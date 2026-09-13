import { useState, useEffect } from 'react';
import { apiFetch } from './api-fetch';
import { getCurrentHotelId } from './api';

export type LiveSyncStatus = 
  | 'IDLE' 
  | 'SYNCING' 
  | 'SUCCESS' 
  | 'PARTIAL_SUCCESS' 
  | 'FAILED' 
  | 'NOT_CONFIGURED' 
  | 'NOT_AUTHORIZED';

export interface LiveSyncSummary {
  fetched: number;
  imported: number;
  updated: number;
  cancelled: number;
  mapping_required: number;
  failed: number;
  skipped: number;
}

export interface LiveSyncResult {
  status: LiveSyncStatus;
  message: string;
  summary?: LiveSyncSummary;
  errors?: string[];
  hotelId?: string;
  window?: { startDate: string; endDate: string };
  durationMs?: number;
}

export interface SyncState {
  status: LiveSyncStatus;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  lastResult: LiveSyncResult | null;
  error: string | null;
}

// In-memory state singleton across the frontend application
let currentState: SyncState = {
  status: 'IDLE',
  isSyncing: false,
  lastSyncTime: null,
  lastResult: null,
  error: null,
};

let activeSyncPromise: Promise<LiveSyncResult> | null = null;
let lastSyncHotelId: string | null = null;
const listeners = new Set<(state: SyncState) => void>();
const COOLDOWN_MS = 30 * 1000; // 30-second cooldown for automatic page-open syncs

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn({ ...currentState });
    } catch (e) {
      console.error('Error in sync state listener:', e);
    }
  });
}

/**
 * Centrally triggers an OTA live sync for the active or given hotel.
 * Uses a concurrency lock and cooldown to prevent overlapping or redundant network calls.
 */
export async function triggerLiveSync(
  hotelId?: string,
  options?: { force?: boolean; startDate?: string; endDate?: string }
): Promise<LiveSyncResult> {
  const targetHotelId = hotelId || getCurrentHotelId();
  if (!targetHotelId) {
    return {
      status: 'NOT_CONFIGURED',
      message: 'No active hotel selected for OTA synchronization',
    };
  }

  // If a sync is actively running, reuse its ongoing promise
  if (currentState.isSyncing && activeSyncPromise) {
    return activeSyncPromise;
  }

  // Cooldown check for non-forced (automatic) triggers (scoped per hotel)
  if (!options?.force && currentState.lastSyncTime && lastSyncHotelId === targetHotelId) {
    const elapsed = Date.now() - currentState.lastSyncTime.getTime();
    if (elapsed < COOLDOWN_MS) {
      return (
        currentState.lastResult || {
          status: currentState.status === 'SYNCING' ? 'SYNCING' : 'SUCCESS',
          message: `Live sync cooled down (${Math.ceil((COOLDOWN_MS - elapsed) / 1000)}s remaining)`,
        }
      );
    }
  }

  lastSyncHotelId = targetHotelId;

  // Update state to SYNCING
  currentState = {
    ...currentState,
    isSyncing: true,
    status: 'SYNCING',
    error: null,
  };
  notifyListeners();

  const runSync = async (): Promise<LiveSyncResult> => {
    try {
      const response = await apiFetch('/api/channels/live-sync', {
        method: 'POST',
        body: JSON.stringify({
          hotelId: targetHotelId,
          startDate: options?.startDate,
          endDate: options?.endDate,
          force: options?.force,
        }),
      });

      const result: LiveSyncResult = {
        status: response?.status || (response?.success ? 'SUCCESS' : 'FAILED'),
        message: response?.message || 'Synchronization completed',
        summary: response?.summary,
        errors: response?.errors || [],
        hotelId: response?.hotelId || targetHotelId,
        window: response?.window,
        durationMs: response?.durationMs,
      };

      currentState = {
        status: result.status,
        isSyncing: false,
        lastSyncTime: new Date(),
        lastResult: result,
        error: result.status === 'FAILED' ? result.message : null,
      };

      // Notify application of updated reservations if sync completed successfully or partially
      if (result.status === 'SUCCESS' || result.status === 'PARTIAL_SUCCESS') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('hotel_mantri_reservations_updated', {
              detail: result,
            })
          );
        }
      }

      return result;
    } catch (err: any) {
      const errorMsg = err?.message || 'External channel synchronization failed';
      let status: LiveSyncStatus = 'FAILED';

      if (err?.status === 401 || err?.stage === 'authorization') {
        status = 'NOT_AUTHORIZED';
      } else if (err?.code === 'INTEGRATION_NOT_CONFIGURED') {
        status = 'NOT_CONFIGURED';
      }

      const failResult: LiveSyncResult = {
        status,
        message: errorMsg,
        errors: [errorMsg],
        hotelId: targetHotelId,
      };

      currentState = {
        status,
        isSyncing: false,
        lastSyncTime: new Date(),
        lastResult: failResult,
        error: errorMsg,
      };

      return failResult;
    } finally {
      activeSyncPromise = null;
      notifyListeners();
    }
  };

  activeSyncPromise = runSync();
  return activeSyncPromise;
}

export function getSyncState(): SyncState {
  return { ...currentState };
}

export function subscribeSyncState(listener: (state: SyncState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Custom React hook for monitoring live OTA sync state and triggering manual syncs.
 */
export function useChannelSyncStatus() {
  const [state, setState] = useState<SyncState>(currentState);

  useEffect(() => {
    const unsub = subscribeSyncState(setState);
    return unsub;
  }, []);

  const syncNow = async (startDate?: string, endDate?: string) => {
    return triggerLiveSync(undefined, { force: true, startDate, endDate });
  };

  return {
    ...state,
    syncNow,
  };
}
