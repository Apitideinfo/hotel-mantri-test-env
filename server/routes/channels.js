import express from 'express';
import { supabaseServiceRole } from '../supabaseClient.js';
import { requireHotelAccess as checkAuth } from '../middleware/auth.js';
import * as aiosellService from '../services/aiosellService.js';

const router = express.Router();

/**
 * GET /api/channels
 * Returns normalized channels for the current hotel.
 */
router.get('/', checkAuth, async (req, res) => {
  try {
    const hotelId = req.headers['x-hotel-id'];
    if (!hotelId) return res.status(400).json({ error: 'x-hotel-id required' });

    const { data: channels, error } = await supabaseServiceRole
      .from('channel_connections')
      .select('*')
      .eq('hotel_id', hotelId);
      
    if (error) throw error;

    const normalized = channels.map(c => ({
      id: c.id,
      hotelId: c.hotel_id,
      channelType: c.channel_type,
      displayName: c.channel_name,
      externalChannelId: c.external_channel_id,
      status: c.status,
      connectionStatus: c.connection_status,
      isEnabled: c.is_enabled,
      mappingStatus: c.mapping_status,
      lastSyncAt: c.last_sync_at,
      lastSuccessfulSyncAt: c.last_successful_sync_at,
      lastError: c.last_error
    }));

    res.json(normalized);
  } catch (err) {
    console.error('Error fetching channels:', err);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

/**
 * POST /api/channels/discover
 * Attempt to discover channels from the upstream provider.
 */
router.post('/discover', checkAuth, async (req, res) => {
  try {
    const hotelId = req.headers['x-hotel-id'];
    if (!hotelId) return res.status(400).json({ error: 'x-hotel-id required' });

    const { data: settings } = await supabaseServiceRole
      .from('channel_settings')
      .select('*')
      .eq('hotel_id', hotelId)
      .single();

    if (!settings || !settings.aiosell_hotel_code) {
      return res.status(400).json({ error: 'Property configuration could not be verified.' });
    }

    // Attempt to verify property
    try {
      await aiosellService.getPropertyMapping(settings);
    } catch (e) {
      return res.status(401).json({ error: 'Channel connection could not be verified.' });
    }

    // STRICT COMPLIANCE: The official Aiosell API documentation does NOT expose a "Connected OTAs" endpoint.
    // Probing endpoints like /channels and /connected_channels returns 404.
    // The prompt dictates: "If the connected-channel API does not expose enough data to implement a specific UI feature: STOP and document the exact limitation. Do NOT fabricate data. DO NOT invent an external API endpoint."
    
    res.status(501).json({ 
      error: 'Channel discovery is not currently supported by the upstream provider integration.',
      discovered: []
    });

  } catch (err) {
    console.error('Error discovering channels:', err);
    res.status(500).json({ error: 'Failed to discover channels' });
  }
});

import { executeInventoryPush, executeRatePush } from './aiosell.js';
import { processAiosellReservation } from '../services/integrations/aiosell/AiosellReservationService.js';
import { parseWebhookPayload } from '../services/integrations/aiosell/AiosellPayloadParser.js';

/**
 * GET /api/channels/:channelId
 * Returns a single channel with its mapping and sync statistics.
 */
router.get('/:channelId', checkAuth, async (req, res) => {
  try {
    const hotelId = req.headers['x-hotel-id'];
    const { channelId } = req.params;
    if (!hotelId) return res.status(400).json({ error: 'x-hotel-id required' });

    const { data: channel, error } = await supabaseServiceRole
      .from('channel_connections')
      .select('*')
      .eq('id', channelId)
      .eq('hotel_id', hotelId)
      .single();

    if (error || !channel) {
      return res.status(404).json({ error: 'Channel connection not found' });
    }

    // Fetch mappings count
    const { data: mappings } = await supabaseServiceRole
      .from('channel_rate_mappings')
      .select('id, room_category_id, rate_plan_id, status')
      .eq('hotel_id', hotelId)
      .or(`channel_connection_id.eq.${channelId},channel_connection_id.is.null`);

    // Fetch categories count
    const { count: totalCategories } = await supabaseServiceRole
      .from('room_categories')
      .select('id', { count: 'exact', head: true })
      .eq('hotel_id', hotelId)
      .eq('is_active', true);

    // Fetch rate plans count
    const { count: totalRatePlans } = await supabaseServiceRole
      .from('rate_plans')
      .select('id', { count: 'exact', head: true })
      .eq('hotel_id', hotelId)
      .eq('is_active', true);

    // Count mapped
    const mappedRooms = new Set((mappings || []).filter(m => m.status === 'mapped' && m.room_category_id).map(m => m.room_category_id)).size;
    const mappedRates = new Set((mappings || []).filter(m => m.status === 'mapped' && m.rate_plan_id).map(m => m.rate_plan_id)).size;

    // Fetch future reservations count
    const today = new Date().toISOString().split('T')[0];
    const { count: futureReservationsCount } = await supabaseServiceRole
      .from('channel_ota_reservations')
      .select('id', { count: 'exact', head: true })
      .eq('hotel_id', hotelId)
      .gte('check_in_date', today);

    // Fetch sync errors count
    const { count: syncErrorsCount } = await supabaseServiceRole
      .from('channel_sync_logs')
      .select('id', { count: 'exact', head: true })
      .eq('hotel_id', hotelId)
      .eq('status', 'failure');

    res.json({
      id: channel.id,
      hotelId: channel.hotel_id,
      channelType: channel.channel_type,
      displayName: channel.channel_name,
      externalChannelId: channel.external_channel_id,
      status: channel.status,
      connectionStatus: channel.connection_status,
      isEnabled: channel.is_enabled,
      mappingStatus: channel.mapping_status,
      lastSyncAt: channel.last_sync_at,
      lastSuccessfulSyncAt: channel.last_successful_sync_at,
      lastError: channel.last_error,
      stats: {
        totalRooms: totalCategories || 0,
        mappedRooms,
        totalRatePlans: totalRatePlans || 0,
        mappedRates,
        futureReservations: futureReservationsCount || 0,
        syncErrors: syncErrorsCount || 0,
      }
    });
  } catch (err) {
    console.error('Error fetching channel details:', err);
    res.status(500).json({ error: 'Failed to fetch channel details' });
  }
});

/**
 * PATCH /api/channels/:channelId
 * Update channel settings (external ID, enabled state, connection status).
 */
router.patch('/:channelId', checkAuth, async (req, res) => {
  try {
    const hotelId = req.headers['x-hotel-id'];
    const { channelId } = req.params;
    const { externalChannelId, isEnabled, connectionStatus, mappingStatus, status } = req.body;
    if (!hotelId) return res.status(400).json({ error: 'x-hotel-id required' });

    const updates = { updated_at: new Date().toISOString() };
    if (externalChannelId !== undefined) updates.external_channel_id = externalChannelId || null;
    if (isEnabled !== undefined) updates.is_enabled = Boolean(isEnabled);
    if (connectionStatus !== undefined) updates.connection_status = connectionStatus;
    if (mappingStatus !== undefined) updates.mapping_status = mappingStatus;
    if (status !== undefined) updates.status = status;

    const { data, error } = await supabaseServiceRole
      .from('channel_connections')
      .update(updates)
      .eq('id', channelId)
      .eq('hotel_id', hotelId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error updating channel:', err);
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

/**
 * DELETE /api/channels/:channelId
 * Disconnect or remove a channel connection.
 */
router.delete('/:channelId', checkAuth, async (req, res) => {
  try {
    const hotelId = req.headers['x-hotel-id'];
    const { channelId } = req.params;
    if (!hotelId) return res.status(400).json({ error: 'x-hotel-id required' });

    // Delete mappings first to be clean
    await supabaseServiceRole
      .from('channel_rate_mappings')
      .delete()
      .eq('channel_connection_id', channelId)
      .eq('hotel_id', hotelId);

    const { error } = await supabaseServiceRole
      .from('channel_connections')
      .delete()
      .eq('id', channelId)
      .eq('hotel_id', hotelId);

    if (error) throw error;
    res.json({ success: true, message: 'Channel connection removed successfully' });
  } catch (err) {
    console.error('Error removing channel:', err);
    res.status(500).json({ error: 'Failed to remove channel' });
  }
});

/**
 * GET /api/channels/:channelId/mappings
 * Fetch room and rate mappings for a specific channel.
 */
router.get('/:channelId/mappings', checkAuth, async (req, res) => {
  try {
    const hotelId = req.headers['x-hotel-id'];
    const { channelId } = req.params;
    if (!hotelId) return res.status(400).json({ error: 'x-hotel-id required' });

    const { data, error } = await supabaseServiceRole
      .from('channel_rate_mappings')
      .select('*')
      .eq('hotel_id', hotelId)
      .or(`channel_connection_id.eq.${channelId},channel_connection_id.is.null`)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching channel mappings:', err);
    res.status(500).json({ error: 'Failed to fetch channel mappings' });
  }
});

/**
 * POST /api/channels/:channelId/mappings
 * Batch save/upsert room and rate mappings for this channel.
 */
router.post('/:channelId/mappings', checkAuth, async (req, res) => {
  try {
    const hotelId = req.headers['x-hotel-id'];
    const { channelId } = req.params;
    const { mappings } = req.body;
    if (!hotelId) return res.status(400).json({ error: 'x-hotel-id required' });
    if (!Array.isArray(mappings)) return res.status(400).json({ error: 'mappings array required' });

    const now = new Date().toISOString();
    const records = mappings.map(m => ({
      ...(m.id ? { id: m.id } : {}),
      hotel_id: hotelId,
      channel_connection_id: channelId,
      room_category_id: m.roomCategoryId || m.room_category_id || null,
      rate_plan_id: m.ratePlanId || m.rate_plan_id || null,
      external_room_code: m.externalRoomCode || m.external_room_code || null,
      external_room_name: m.externalRoomName || m.external_room_name || null,
      external_rate_plan_code: m.externalRatePlanCode || m.external_rate_plan_code || null,
      external_rate_plan_name: m.externalRatePlanName || m.external_rate_plan_name || null,
      status: m.status || ((m.externalRoomCode && m.externalRatePlanCode) ? 'mapped' : (m.externalRoomCode || m.externalRatePlanCode) ? 'mapped' : 'unmapped'),
      is_active: m.isActive !== undefined ? m.isActive : true,
      updated_at: now
    }));

    const { data, error } = await supabaseServiceRole
      .from('channel_rate_mappings')
      .upsert(records)
      .select();

    if (error) throw error;

    // Update connection mapping status
    const allMapped = records.every(r => r.status === 'mapped');
    const anyMapped = records.some(r => r.status === 'mapped');
    const newMappingStatus = allMapped ? 'mapped' : anyMapped ? 'partially_mapped' : 'unmapped';

    await supabaseServiceRole
      .from('channel_connections')
      .update({ mapping_status: newMappingStatus, updated_at: now })
      .eq('id', channelId)
      .eq('hotel_id', hotelId);

    res.json({ success: true, count: data?.length || 0, mappings: data });
  } catch (err) {
    console.error('Error saving channel mappings:', err);
    res.status(500).json({ error: err.message || 'Failed to save mappings' });
  }
});

/**
 * POST /api/channels/:channelId/sync/inventory
 * Push inventory for this channel.
 */
router.post('/:channelId/sync/inventory', checkAuth, async (req, res) => {
  const startTime = Date.now();
  const hotelId = req.headers['x-hotel-id'];
  const { channelId } = req.params;
  const { startDate, endDate } = req.body;

  try {
    if (!hotelId) return res.status(400).json({ error: 'x-hotel-id required' });

    const sDate = startDate || new Date().toISOString().split('T')[0];
    const eDate = endDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const result = await executeInventoryPush(hotelId, sDate, eDate);

    // Update channel connection last sync
    const now = new Date().toISOString();
    await supabaseServiceRole
      .from('channel_connections')
      .update({
        last_sync_at: now,
        last_successful_sync_at: now,
        last_sync_status: 'success',
        last_error: null,
        updated_at: now
      })
      .eq('id', channelId)
      .eq('hotel_id', hotelId);

    // Log to sync logs
    await supabaseServiceRole.from('channel_sync_logs').insert({
      hotel_id: hotelId,
      channel_connection_id: channelId,
      log_type: 'INVENTORY_SYNC',
      direction: 'outbound',
      status: 'success',
      message: `Inventory successfully synchronized from ${sDate} to ${eDate}`,
      date_range: `${sDate} to ${eDate}`,
      retry_status: 'not_retried',
      retry_count: 0
    });

    res.json({ success: true, durationMs: Date.now() - startTime, result });
  } catch (err) {
    console.error('Inventory sync error:', err);
    const now = new Date().toISOString();

    await supabaseServiceRole
      .from('channel_connections')
      .update({
        last_sync_at: now,
        last_sync_status: 'failure',
        last_error: err.message || 'Inventory sync failed',
        updated_at: now
      })
      .eq('id', channelId)
      .eq('hotel_id', hotelId);

    await supabaseServiceRole.from('channel_sync_logs').insert({
      hotel_id: hotelId,
      channel_connection_id: channelId,
      log_type: 'INVENTORY_SYNC',
      direction: 'outbound',
      status: 'failure',
      message: 'Inventory synchronization failed',
      error_detail: err.message || 'Unknown error during inventory sync',
      retry_status: 'not_retried',
      retry_count: 0
    });

    res.status(500).json({ error: err.message || 'Inventory sync failed' });
  }
});

/**
 * POST /api/channels/:channelId/sync/rates
 * Push rates for this channel.
 */
router.post('/:channelId/sync/rates', checkAuth, async (req, res) => {
  const startTime = Date.now();
  const hotelId = req.headers['x-hotel-id'];
  const { channelId } = req.params;
  const { startDate, endDate } = req.body;

  try {
    if (!hotelId) return res.status(400).json({ error: 'x-hotel-id required' });

    const sDate = startDate || new Date().toISOString().split('T')[0];
    const eDate = endDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const result = await executeRatePush(hotelId, sDate, eDate);

    // Update channel connection last sync
    const now = new Date().toISOString();
    await supabaseServiceRole
      .from('channel_connections')
      .update({
        last_sync_at: now,
        last_successful_sync_at: now,
        last_sync_status: 'success',
        last_error: null,
        updated_at: now
      })
      .eq('id', channelId)
      .eq('hotel_id', hotelId);

    // Log to sync logs
    await supabaseServiceRole.from('channel_sync_logs').insert({
      hotel_id: hotelId,
      channel_connection_id: channelId,
      log_type: 'RATE_SYNC',
      direction: 'outbound',
      status: 'success',
      message: `Rates successfully synchronized from ${sDate} to ${eDate}`,
      date_range: `${sDate} to ${eDate}`,
      retry_status: 'not_retried',
      retry_count: 0
    });

    res.json({ success: true, durationMs: Date.now() - startTime, result });
  } catch (err) {
    console.error('Rate sync error:', err);
    const now = new Date().toISOString();

    await supabaseServiceRole
      .from('channel_connections')
      .update({
        last_sync_at: now,
        last_sync_status: 'failure',
        last_error: err.message || 'Rate sync failed',
        updated_at: now
      })
      .eq('id', channelId)
      .eq('hotel_id', hotelId);

    await supabaseServiceRole.from('channel_sync_logs').insert({
      hotel_id: hotelId,
      channel_connection_id: channelId,
      log_type: 'RATE_SYNC',
      direction: 'outbound',
      status: 'failure',
      message: 'Rate synchronization failed',
      error_detail: err.message || 'Unknown error during rate sync',
      retry_status: 'not_retried',
      retry_count: 0
    });

    res.status(500).json({ error: err.message || 'Rate sync failed' });
  }
});

/**
 * POST /api/channels/:channelId/future-bookings
 * Pull future bookings and process idempotently into reservations pipeline.
 */
router.post('/:channelId/future-bookings', checkAuth, async (req, res) => {
  try {
    const hotelId = req.headers['x-hotel-id'];
    const { channelId } = req.params;
    const { startDate, endDate } = req.body;
    if (!hotelId) return res.status(400).json({ error: 'x-hotel-id required' });

    const { data: settings } = await supabaseServiceRole
      .from('channel_settings')
      .select('*')
      .eq('hotel_id', hotelId)
      .single();
      
    if (!settings || !settings.aiosell_hotel_code) {
      return res.status(400).json({ error: 'Property configuration could not be verified.' });
    }

    const sDate = startDate || new Date().toISOString().split('T')[0];
    const eDate = endDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    // Fetch channel details to know channel_name
    const { data: connection } = await supabaseServiceRole
      .from('channel_connections')
      .select('channel_name, channel_type')
      .eq('id', channelId)
      .eq('hotel_id', hotelId)
      .maybeSingle();

    const rawReservations = await aiosellService.fetchReservations(sDate, eDate, settings);
    
    let list = [];
    if (Array.isArray(rawReservations)) list = rawReservations;
    else if (rawReservations && Array.isArray(rawReservations.data)) list = rawReservations.data;
    else if (rawReservations && Array.isArray(rawReservations.reservations)) list = rawReservations.reservations;

    const stats = {
      imported: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      mapping_required: 0
    };
    const errors = [];

    for (const raw of list) {
      try {
        const payload = parseWebhookPayload({
          ...raw,
          action: raw.action || 'book',
          hotelCode: settings.aiosell_hotel_code,
          channelName: connection?.channel_name || raw.channel || 'OTA'
        });

        const resResult = await processAiosellReservation(payload, hotelId);
        
        // Scope channel_connection_id on the record if it was saved to channel_ota_reservations
        if (payload.bookingId) {
          await supabaseServiceRole
            .from('channel_ota_reservations')
            .update({ channel_connection_id: channelId })
            .eq('hotel_id', hotelId)
            .eq('ota_booking_id', payload.bookingId);
        }

        if (stats[resResult.status] !== undefined) {
          stats[resResult.status]++;
        } else {
          stats.imported++;
        }
      } catch (err) {
        errors.push(err.message || 'Error processing reservation');
        stats.failed++;
      }
    }

    // Log the pull action
    await supabaseServiceRole.from('channel_sync_logs').insert({
      hotel_id: hotelId,
      channel_connection_id: channelId,
      log_type: 'RESERVATION_PULL',
      direction: 'inbound',
      status: stats.failed > 0 && stats.imported === 0 ? 'failure' : 'success',
      message: `Pulled ${list.length} bookings (${stats.imported} imported, ${stats.updated} updated, ${stats.mapping_required} mapping required)`,
      date_range: `${sDate} to ${eDate}`,
      retry_status: 'not_retried',
      retry_count: 0
    });

    res.json({
      success: true,
      totalFetched: list.length,
      stats,
      errors
    });
  } catch (err) {
    console.error('Error fetching future bookings:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch future bookings' });
  }
});

/**
 * GET /api/channels/:channelId/reservations
 * Fetch reservations associated with this channel connection.
 */
router.get('/:channelId/reservations', checkAuth, async (req, res) => {
  try {
    const hotelId = req.headers['x-hotel-id'];
    const { channelId } = req.params;
    if (!hotelId) return res.status(400).json({ error: 'x-hotel-id required' });

    // Fetch channel to know channel name
    const { data: connection } = await supabaseServiceRole
      .from('channel_connections')
      .select('channel_name')
      .eq('id', channelId)
      .eq('hotel_id', hotelId)
      .maybeSingle();

    let query = supabaseServiceRole
      .from('channel_ota_reservations')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (connection?.channel_name) {
      query = query.or(`channel_connection_id.eq.${channelId},channel_name.ilike.%${connection.channel_name}%`);
    } else {
      query = query.eq('channel_connection_id', channelId);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching channel reservations:', err);
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
});

/**
 * GET /api/channels/:channelId/logs
 * Fetch sync logs for this channel.
 */
router.get('/:channelId/logs', checkAuth, async (req, res) => {
  try {
    const hotelId = req.headers['x-hotel-id'];
    const { channelId } = req.params;
    if (!hotelId) return res.status(400).json({ error: 'x-hotel-id required' });

    const { data, error } = await supabaseServiceRole
      .from('channel_sync_logs')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('channel_connection_id', channelId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching channel logs:', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});


/**
 * POST /api/channels
 * Manually add a channel connection.
 */
router.post('/', checkAuth, async (req, res) => {
  try {
    const hotelId = req.headers['x-hotel-id'];
    const { channelType, displayName, externalChannelId } = req.body;
    if (!hotelId) return res.status(400).json({ error: 'x-hotel-id required' });
    if (!channelType || !displayName) return res.status(400).json({ error: 'channelType and displayName required' });

    // Validate that integration is setup
    const { data: settings } = await supabaseServiceRole
      .from('channel_settings')
      .select('*')
      .eq('hotel_id', hotelId)
      .single();

    if (!settings || !settings.aiosell_hotel_code) {
      return res.status(400).json({ error: 'Property configuration could not be verified.' });
    }

    // Check for duplicate channel
    const { data: existingChannel } = await supabaseServiceRole
      .from('channel_connections')
      .select('id')
      .eq('hotel_id', hotelId)
      .eq('channel_type', channelType)
      .maybeSingle();

    if (existingChannel) {
      return res.status(409).json({
        error: 'CHANNEL_ALREADY_EXISTS',
        message: 'This channel is already added for this hotel.'
      });
    }

    // Insert into channel_connections
    const { data, error } = await supabaseServiceRole
      .from('channel_connections')
      .insert({
        hotel_id: hotelId,
        channel_type: channelType,
        channel_name: displayName,
        external_channel_id: externalChannelId || null,
        status: 'awaiting_external_activation',
        connection_status: 'pending',
        mapping_status: 'unmapped'
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'CHANNEL_ALREADY_EXISTS',
          message: 'This channel is already added for this hotel.'
        });
      }
      throw error;
    }
    res.json(data);
  } catch (err) {
    const errorId = `CHANNEL_ADD_ERROR_${Date.now()}`;
    console.error(`[${errorId}] Error adding channel:`, {
      message: err.message,
      code: err.code,
      details: err.details,
      hint: err.hint,
      stack: err.stack,
      body: req.body
    });
    
    if (process.env.NODE_ENV !== 'production') {
      res.status(500).json({ 
        error: 'Failed to add channel',
        errorId,
        debug: {
          message: err.message,
          code: err.code,
          details: err.details,
          hint: err.hint
        }
      });
    } else {
      res.status(500).json({ error: 'Failed to add channel', errorId });
    }
  }
});

export default router;
