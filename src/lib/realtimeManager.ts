import { supabase } from './supabase';

export type RealtimeConnectionStatus =
  | 'IDLE'
  | 'CONNECTING'
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED';

interface RealtimeManagerOptions {
  hotelId: string | null;
  enabled?: boolean;
  onStatusChange?: (status: RealtimeConnectionStatus) => void;
}

/**
 * Coordinated Supabase Realtime Channel Manager
 * 
 * Solves:
 * 1. "WebSocket is closed before the connection is established" by preventing
 *    concurrent/abrupt teardowns during the WebSocket handshake.
 * 2. Deduplicates channels so multiple components don't create competing subscriptions.
 * 3. Handles SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, and CLOSED gracefully.
 * 4. Implements bounded exponential backoff with jitter.
 * 5. Provides controlled background polling fallback if WebSocket is unavailable.
 */
class HotelRealtimeManager {
  private currentHotelId: string | null = null;
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private status: RealtimeConnectionStatus = 'IDLE';
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackPollTimer: ReturnType<typeof setInterval> | null = null;
  private statusListeners = new Set<(status: RealtimeConnectionStatus) => void>();
  private isTearingDown = false;

  public getStatus(): RealtimeConnectionStatus {
    return this.status;
  }

  public subscribeStatus(listener: (status: RealtimeConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setStatus(newStatus: RealtimeConnectionStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    this.statusListeners.forEach((fn) => {
      try {
        fn(newStatus);
      } catch (err) {
        console.warn('[RealtimeManager] Status listener error:', err);
      }
    });

    // If channel fails or closes, initiate controlled fallback polling
    if (newStatus === 'CHANNEL_ERROR' || newStatus === 'TIMED_OUT' || newStatus === 'CLOSED') {
      this.startFallbackPolling();
    } else if (newStatus === 'SUBSCRIBED') {
      this.stopFallbackPolling();
      this.reconnectAttempts = 0;
    }
  }

  public connect(hotelId: string | null, enabled = true) {
    if (!hotelId || !enabled) {
      this.disconnect();
      return;
    }

    if (this.currentHotelId === hotelId && (this.status === 'SUBSCRIBED' || this.status === 'CONNECTING')) {
      return;
    }

    this.disconnect();
    this.currentHotelId = hotelId;
    this.establishSubscription(hotelId);
  }

  private establishSubscription(hotelId: string) {
    this.clearTimers();
    this.setStatus('CONNECTING');
    this.isTearingDown = false;

    const channelName = `hotel_mantri_realtime_${hotelId}_${Date.now()}`;

    try {
      const newChannel = supabase
        .channel(channelName, {
          config: {
            broadcast: { self: false },
            presence: { key: hotelId },
          },
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'reservations', filter: `hotel_id=eq.${hotelId}` },
          (payload) => {
            this.broadcastEvent('hotel_mantri_reservations_updated', {
              source: 'realtime_reservations',
              payload,
            });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'channel_ota_reservations', filter: `hotel_id=eq.${hotelId}` },
          (payload) => {
            this.broadcastEvent('hotel_mantri_reservations_updated', {
              source: 'realtime_ota',
              payload,
            });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'room_chart_entries', filter: `hotel_id=eq.${hotelId}` },
          (payload) => {
            this.broadcastEvent('hotel_mantri_reservations_updated', {
              source: 'realtime_room_chart_entries',
              payload,
            });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'channel_inventory_restrictions', filter: `hotel_id=eq.${hotelId}` },
          (payload) => {
            this.broadcastEvent('hotel_mantri_availability_updated', {
              source: 'realtime_channel_inventory_restrictions',
              payload,
            });
          }
        );

      newChannel.subscribe((status, err) => {
        if (this.isTearingDown) return;

        if (err) {
          console.warn(`[RealtimeManager] Channel notice (${status}):`, err.message || err);
        }

        switch (status) {
          case 'SUBSCRIBED':
            this.setStatus('SUBSCRIBED');
            break;
          case 'TIMED_OUT':
            this.setStatus('TIMED_OUT');
            this.scheduleReconnect(hotelId);
            break;
          case 'CHANNEL_ERROR':
            this.setStatus('CHANNEL_ERROR');
            this.scheduleReconnect(hotelId);
            break;
          case 'CLOSED':
            if (!this.isTearingDown) {
              this.setStatus('CLOSED');
              this.scheduleReconnect(hotelId);
            }
            break;
        }
      });

      this.channel = newChannel;
    } catch (err) {
      console.warn('[RealtimeManager] Error creating realtime channel:', err);
      this.setStatus('CHANNEL_ERROR');
      this.startFallbackPolling();
    }
  }

  private scheduleReconnect(hotelId: string) {
    if (this.isTearingDown || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.warn(`[RealtimeManager] Reconnect ceiling reached (${this.maxReconnectAttempts}). Using resilient polling fallback.`);
      }
      this.startFallbackPolling();
      return;
    }

    this.reconnectAttempts++;
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s + jitter (0-500ms)
    const baseDelay = Math.min(16000, 1000 * Math.pow(2, this.reconnectAttempts - 1));
    const jitter = Math.floor(Math.random() * 500);
    const delay = baseDelay + jitter;

    console.log(`[RealtimeManager] Scheduling reconnect #${this.reconnectAttempts} in ${delay}ms...`);
    this.reconnectTimer = setTimeout(() => {
      if (this.currentHotelId === hotelId && !this.isTearingDown) {
        this.disconnectChannelOnly();
        this.establishSubscription(hotelId);
      }
    }, delay);
  }

  private disconnectChannelOnly() {
    if (this.channel) {
      const ch = this.channel;
      this.channel = null;
      try {
        // Safe unsubscribe without uncaught socket crashes
        ch.unsubscribe().catch(() => {});
        supabase.removeChannel(ch).catch(() => {});
      } catch {
        // ignore
      }
    }
  }

  public disconnect() {
    this.isTearingDown = true;
    this.currentHotelId = null;
    this.clearTimers();
    this.stopFallbackPolling();
    this.disconnectChannelOnly();
    this.setStatus('IDLE');
  }

  private clearTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startFallbackPolling() {
    if (this.fallbackPollTimer) return;
    // Controlled low-frequency polling (every 60s) so UI stays fresh even when WS is blocked
    this.fallbackPollTimer = setInterval(() => {
      if (this.currentHotelId) {
        this.broadcastEvent('hotel_mantri_reservations_updated', { source: 'polling_fallback' });
        this.broadcastEvent('hotel_mantri_availability_updated', { source: 'polling_fallback' });
      }
    }, 60000);
  }

  private stopFallbackPolling() {
    if (this.fallbackPollTimer) {
      clearInterval(this.fallbackPollTimer);
      this.fallbackPollTimer = null;
    }
  }

  private broadcastEvent(name: string, detail?: Record<string, any>) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  }
}

// Global Singleton Instance
export const realtimeManager = new HotelRealtimeManager();
