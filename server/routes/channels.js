import express from 'express';
import { supabaseServiceRole } from '../supabaseClient.js';
import { requireHotelAccess as checkAuth } from '../middleware/auth.js';
import * as aiosellService from '../services/aiosellService.js';
import { getChannelProviderConfig } from '../services/providerConfig.js';
import { executeInventoryPush, executeRatePush } from './aiosell.js';
import { processAiosellReservation } from '../services/integrations/aiosell/AiosellReservationService.js';
import { parseWebhookPayload } from '../services/integrations/aiosell/AiosellPayloadParser.js';

const router = express.Router();

/**
 * GET /api/channels
 * Returns normalized channels for the current hotel.
 */
router.get('/', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    if (!hotelId) {
      return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.', requestId: req.requestId });
    }

    const { data: channels, error } = await supabaseServiceRole
      .from('channel_connections')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: true });
      
    if (error) throw error;

    const normalized = (channels || []).map(c => ({
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
    res.status(500).json({ success: false, code: 'CHANNEL_FETCH_FAILED', message: 'Failed to fetch channels', requestId: req.requestId });
  }
});

/**
 * POST /api/channels/discover
 * Honest response: upstream integration does not support dynamic OTA discovery.
 */
router.post('/discover', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    if (!hotelId) {
      return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.', requestId: req.requestId });
    }

    // Verify hotel configuration exists
    await getChannelProviderConfig(hotelId, req.requestId);

    res.status(501).json({ 
      success: false,
      code: 'DISCOVERY_NOT_SUPPORTED',
      message: 'Automatic OTA discovery is not supported for this integration account. Please use Add Channel to connect your distribution channels.',
      discovered: [],
      requestId: req.requestId
    });
  } catch (err) {
    res.status(err.status || 500).json({ 
      success: false, 
      code: err.code || 'DISCOVERY_FAILED', 
      message: err.message || 'Failed to check channel discovery',
      requestId: req.requestId 
    });
  }
});

/**
 * POST /api/channels/test-connection
 * Real server-side connection test for current hotel.
 */
router.post('/test-connection', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    if (!hotelId) {
      return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.', requestId: req.requestId });
    }

    const config = await getChannelProviderConfig(hotelId, req.requestId);
    const result = await aiosellService.testConnection(config);

    if (result.success) {
      return res.json({
        success: true,
        status: 'connected',
        connected: true,
        hotelId,
        environment: result.environment,
        hotelCode: result.hotelCode,
        partnerId: result.partnerId,
        mappingConfigured: (result.mapping?.rooms?.length > 0) || (result.mapping?.ratePlans?.length > 0),
        latencyMs: result.responseTimeMs,
        message: 'Channel integration connection verified successfully',
        requestId: req.requestId
      });
    } else {
      return res.status(result.status || 502).json({
        success: false,
        status: 'error',
        connected: false,
        code: result.error?.code || 'CONNECTION_TEST_FAILED',
        message: result.error?.message || 'Channel integration test failed',
        details: result.diagnostic,
        requestId: req.requestId
      });
    }
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      code: err.code || 'CONNECTION_TEST_ERROR',
      message: err.message || 'Failed to execute connection test',
      requestId: req.requestId
    });
  }
});

/**
 * GET /api/channels/catalog
 * Returns list of supported distribution channels.
 */
router.get('/catalog', checkAuth, async (req, res) => {
  const catalog = [
    { type: 'mmt', label: 'MakeMyTrip', short: 'MMT' },
    { type: 'goibibo', label: 'Goibibo', short: 'G' },
    { type: 'booking_com', label: 'Booking.com', short: 'B' },
    { type: 'agoda', label: 'Agoda', short: 'A' },
    { type: 'expedia', label: 'Expedia', short: 'E' },
    { type: 'airbnb', label: 'Airbnb', short: 'AB' },
    { type: 'cleartrip', label: 'Cleartrip', short: 'C' },
    { type: 'easemytrip', label: 'EaseMyTrip', short: 'EMT' },
    { type: 'hotels_com', label: 'Hotels.com', short: 'H' },
    { type: 'trip_com', label: 'Trip.com', short: 'T' },
    { type: 'yatra', label: 'Yatra / Travelguru', short: 'Y' },
  ];
  res.json(catalog);
});

/**
 * GET /api/channels/:channelId
 * Returns a single channel with its mapping and sync statistics.
 */
router.get('/:channelId', checkAuth, async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const { channelId } = req.params;
    if (!hotelId) return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.', requestId: req.requestId });

    const { data: channel, error } = await supabaseServiceRole
      .from('channel_connections')
      .select('*')
      .eq('id', channelId)
      .eq('hotel_id', hotelId)
      .single();

    if (error || !channel) {
      return res.status(404).json({ success: false, code: 'CHANNEL_NOT_FOUND', message: 'Channel connection not found', requestId: req.requestId });
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
      },
      requestId: req.requestId
    });
  } catch (err) {
    console.error('Error fetching channel details:', err);
    res.status(500).json({ success: false, code: 'CHANNEL_DETAILS_FAILED', message: 'Failed to fetch channel details', requestId: req.requestId });
  }
});

/**
 * PATCH /api/channels/:channelId
 * Update channel settings (external ID, enabled state, connection status).
 */
router.patch('/:channelId', checkAuth, async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const { channelId } = req.params;
    const { externalChannelId, isEnabled, connectionStatus, mappingStatus, status } = req.body;
    if (!hotelId) return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.', requestId: req.requestId });

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
    res.status(500).json({ success: false, code: 'CHANNEL_UPDATE_FAILED', message: 'Failed to update channel', requestId: req.requestId });
  }
});

/**
 * DELETE /api/channels/:channelId
 * Disconnect or remove a channel connection.
 */
router.delete('/:channelId', checkAuth, async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const { channelId } = req.params;
    if (!hotelId) return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.', requestId: req.requestId });

    // Delete mappings for this channel connection
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
    res.json({ success: true, message: 'Channel connection removed successfully', requestId: req.requestId });
  } catch (err) {
    console.error('Error removing channel:', err);
    res.status(500).json({ success: false, code: 'CHANNEL_DELETE_FAILED', message: 'Failed to remove channel', requestId: req.requestId });
  }
});

/**
 * GET /api/channels/:channelId/mappings
 * Fetch room and rate mappings for a specific channel.
 */
router.get('/:channelId/mappings', checkAuth, async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const { channelId } = req.params;
    if (!hotelId) return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.', requestId: req.requestId });

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
    res.status(500).json({ success: false, code: 'MAPPINGS_FETCH_FAILED', message: 'Failed to fetch channel mappings', requestId: req.requestId });
  }
});

/**
 * POST /api/channels/:channelId/mappings
 * Batch save/upsert room and rate mappings for this channel.
 */
router.post('/:channelId/mappings', checkAuth, async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const { channelId } = req.params;
    const { mappings } = req.body;
    if (!hotelId) return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.', requestId: req.requestId });
    if (!Array.isArray(mappings)) return res.status(400).json({ success: false, code: 'INVALID_MAPPINGS_PAYLOAD', message: 'mappings array required', requestId: req.requestId });

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
      provider: 'aiosell',
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

    res.json({ success: true, count: data?.length || 0, mappings: data, requestId: req.requestId });
  } catch (err) {
    console.error('Error saving channel mappings:', err);
    res.status(500).json({ success: false, code: 'MAPPINGS_SAVE_FAILED', message: err.message || 'Failed to save mappings', requestId: req.requestId });
  }
});

/**
 * POST /api/channels/:channelId/sync/inventory
 * Push inventory for this channel.
 */
router.post('/:channelId/sync/inventory', checkAuth, async (req, res) => {
  const startTime = Date.now();
  const hotelId = (req.hotelId || req.auth?.hotelId);
  const { channelId } = req.params;
  const { startDate, endDate } = req.body;

  try {
    if (!hotelId) return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.', requestId: req.requestId });

    const sDate = startDate || new Date().toISOString().split('T')[0];
    const eDate = endDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    // Validate dates
    if (new Date(sDate) > new Date(eDate)) {
      return res.status(400).json({ success: false, code: 'INVALID_DATE_RANGE', message: 'Start date cannot be after end date.', requestId: req.requestId });
    }
    const diffDays = Math.round((new Date(eDate) - new Date(sDate)) / (1000 * 60 * 60 * 24));
    if (diffDays > 90) {
      return res.status(400).json({ success: false, code: 'DATE_RANGE_EXCEEDED', message: 'Date range cannot exceed 90 days for inventory sync.', requestId: req.requestId });
    }

    // Check active mappings for this channel connection
    const { data: mappings } = await supabaseServiceRole
      .from('channel_rate_mappings')
      .select('id, room_category_id, external_room_code, status')
      .eq('hotel_id', hotelId)
      .eq('status', 'mapped')
      .not('external_room_code', 'is', null)
      .or(`channel_connection_id.eq.${channelId},channel_connection_id.is.null`);

    if (!mappings || mappings.length === 0) {
      return res.status(422).json({
        success: false,
        code: 'MAPPING_REQUIRED',
        message: 'Room mappings are required before inventory can be synchronized for this channel.',
        channelId,
        requestId: req.requestId
      });
    }

    const result = await executeInventoryPush(hotelId, channelId, sDate, eDate);

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

    res.json({ success: true, durationMs: Date.now() - startTime, result, requestId: req.requestId });
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

    const statusCode = err.status || 500;
    res.status(statusCode).json({
      success: false,
      code: err.code || 'INVENTORY_SYNC_FAILED',
      message: err.message || 'Inventory sync failed',
      requestId: req.requestId
    });
  }
});

/**
 * POST /api/channels/:channelId/sync/rates
 * Push rates for this channel.
 */
router.post('/:channelId/sync/rates', checkAuth, async (req, res) => {
  const startTime = Date.now();
  const hotelId = (req.hotelId || req.auth?.hotelId);
  const { channelId } = req.params;
  const { startDate, endDate } = req.body;

  try {
    if (!hotelId) return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.', requestId: req.requestId });

    const sDate = startDate || new Date().toISOString().split('T')[0];
    const eDate = endDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    // Validate dates
    if (new Date(sDate) > new Date(eDate)) {
      return res.status(400).json({ success: false, code: 'INVALID_DATE_RANGE', message: 'Start date cannot be after end date.', requestId: req.requestId });
    }
    const diffDays = Math.round((new Date(eDate) - new Date(sDate)) / (1000 * 60 * 60 * 24));
    if (diffDays > 90) {
      return res.status(400).json({ success: false, code: 'DATE_RANGE_EXCEEDED', message: 'Date range cannot exceed 90 days for rate sync.', requestId: req.requestId });
    }

    // Check active rate mappings for this channel connection
    const { data: mappings } = await supabaseServiceRole
      .from('channel_rate_mappings')
      .select('id, room_category_id, rate_plan_id, status')
      .eq('hotel_id', hotelId)
      .eq('status', 'mapped')
      .not('external_rate_plan_code', 'is', null)
      .or(`channel_connection_id.eq.${channelId},channel_connection_id.is.null`);

    if (!mappings || mappings.length === 0) {
      return res.status(422).json({
        success: false,
        code: 'RATE_MAPPING_REQUIRED',
        message: 'Rate mappings are required before rates can be synchronized for this channel.',
        channelId,
        requestId: req.requestId
      });
    }

    const result = await executeRatePush(hotelId, channelId, sDate, eDate);

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

    res.json({ success: true, durationMs: Date.now() - startTime, result, requestId: req.requestId });
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

    const statusCode = err.status || 500;
    res.status(statusCode).json({
      success: false,
      code: err.code || 'RATE_SYNC_FAILED',
      message: err.message || 'Rate sync failed',
      requestId: req.requestId
    });
  }
});

/**
 * POST /api/channels/:channelId/future-bookings
 * Pull future bookings and process idempotently into reservations pipeline.
 */
router.post('/:channelId/future-bookings', checkAuth, async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const { channelId } = req.params;
    const { startDate, endDate } = req.body;
    if (!hotelId) return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.', requestId: req.requestId });

    // Validate date range
    const sDate = startDate || new Date().toISOString().split('T')[0];
    const eDate = endDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    if (new Date(sDate) > new Date(eDate)) {
      return res.status(400).json({ success: false, code: 'INVALID_DATE_RANGE', message: 'Start date cannot be after end date.', requestId: req.requestId });
    }
    const diffDays = Math.round((new Date(eDate) - new Date(sDate)) / (1000 * 60 * 60 * 24));
    if (diffDays > 180) {
      return res.status(400).json({ success: false, code: 'DATE_RANGE_EXCEEDED', message: 'Future booking pull date range cannot exceed 180 days.', requestId: req.requestId });
    }

    // Resolve provider config properly using the centralized resolver
    const providerConfig = await getChannelProviderConfig(hotelId, req.requestId);

    // Fetch channel details to know channel_name
    const { data: connection } = await supabaseServiceRole
      .from('channel_connections')
      .select('channel_name, channel_type')
      .eq('id', channelId)
      .eq('hotel_id', hotelId)
      .maybeSingle();

    const rawReservations = await aiosellService.fetchReservations(sDate, eDate, providerConfig);
    
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
          hotelCode: providerConfig.hotelCode,
          channelName: connection?.channel_name || raw.channel || 'OTA'
        });

        const resResult = await processAiosellReservation(payload, hotelId);
        
        // Scope channel_connection_id on the record in channel_ota_reservations
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
      errors,
      requestId: req.requestId
    });
  } catch (err) {
    console.error('Error fetching future bookings:', err);
    res.status(err.status || 500).json({
      success: false,
      code: err.code || 'FUTURE_BOOKINGS_FAILED',
      message: err.message || 'Failed to fetch future bookings',
      requestId: req.requestId
    });
  }
});

/**
 * GET /api/channels/:channelId/reservations
 * Fetch reservations for a channel.
 */
router.get('/:channelId/reservations', checkAuth, async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const { channelId } = req.params;
    if (!hotelId) return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.', requestId: req.requestId });

    const { data, error } = await supabaseServiceRole
      .from('channel_ota_reservations')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('channel_connection_id', channelId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching channel reservations:', err);
    res.status(500).json({ success: false, code: 'RESERVATIONS_FETCH_FAILED', message: 'Failed to fetch reservations', requestId: req.requestId });
  }
});

/**
 * GET /api/channels/:channelId/logs
 * Fetch sync logs for a channel.
 */
router.get('/:channelId/logs', checkAuth, async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const { channelId } = req.params;
    if (!hotelId) return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.', requestId: req.requestId });

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
    res.status(500).json({ success: false, code: 'LOGS_FETCH_FAILED', message: 'Failed to fetch logs', requestId: req.requestId });
  }
});

/**
 * POST /api/channels
 * Manually add a channel connection.
 */
router.post('/', checkAuth, async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const { channelType, displayName, externalChannelId } = req.body;
    if (!hotelId) return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.', requestId: req.requestId });
    if (!channelType || !displayName) return res.status(400).json({ success: false, code: 'MISSING_FIELDS', message: 'channelType and displayName required', requestId: req.requestId });

    // Validate that integration is setup
    await getChannelProviderConfig(hotelId, req.requestId);

    // Check for duplicate channel
    const { data: existingChannel } = await supabaseServiceRole
      .from('channel_connections')
      .select('id')
      .eq('hotel_id', hotelId)
      .eq('channel_type', channelType)
      .maybeSingle();

    if (existingChannel) {
      return res.status(409).json({
        success: false,
        code: 'CHANNEL_ALREADY_EXISTS',
        channelId: existingChannel.id,
        message: 'This channel is already added for this hotel.',
        requestId: req.requestId
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
        mapping_status: 'unmapped',
        is_enabled: true
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        const { data: dup } = await supabaseServiceRole
          .from('channel_connections')
          .select('id')
          .eq('hotel_id', hotelId)
          .eq('channel_type', channelType)
          .maybeSingle();

        return res.status(409).json({
          success: false,
          code: 'CHANNEL_ALREADY_EXISTS',
          channelId: dup?.id,
          message: 'This channel is already added for this hotel.',
          requestId: req.requestId
        });
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      channel: data,
      requestId: req.requestId
    });
  } catch (err) {
    console.error(`Error adding channel:`, err);
    res.status(err.status || 500).json({
      success: false,
      code: err.code || 'CHANNEL_ADD_FAILED',
      message: err.message || 'Failed to add channel',
      requestId: req.requestId
    });
  }
});

export default router;
