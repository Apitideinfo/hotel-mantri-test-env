/**
 * HOTEL MANTRI — Authoritative Reservation API Routes
 * 
 * Provides:
 * - Authoritative hotel-scoped reservation queries with pagination & filtering
 * - Conflict diagnostic scans for authorized administrators
 * - Atomic reservation creation with physical room overlap prevention
 * - Atomic reservation updates, room assignments, stay extensions, and safe check-in
 */

import express from 'express';
import { supabaseServiceRole } from '../supabaseClient.js';
import { requireHotelAccess as checkAuth } from '../middleware/auth.js';
import {
  checkRoomAvailability,
  detectExistingConflicts,
} from '../services/ReservationConflictService.js';
import {
  createReservationsAtomically,
  updateReservationAtomically,
  assignPhysicalRoom,
  extendReservationStay,
  validateAndProcessCheckIn,
  autoAssignPhysicalRoom,
  processPendingRoomAllocations,
  batchAutoAssignReservations,
  isAutoAssignEnabled,
  setAutoAssignEnabled,
} from '../services/RoomAssignmentService.js';
import {
  generateAndDeliverConfirmation,
  buildReservationConfirmationEmail,
  buildOtaOwnerConfirmationEmail,
  buildCustomerConfirmationEmail,
  buildReservationConfirmationWhatsAppText,
  buildMetaBookingConfirmationTemplate,
  resolveReservationNotificationRecipient,
  isOTAReservation,
  normalizeBookingSource,
} from '../services/reservationDeliveryService.js';
import {
  getReservationDocuments,
  readPdfFromStorage,
  generateAndStoreReservationConfirmation,
  updateDocumentDeliveryStatus,
  DOCUMENT_TYPES,
  DELIVERY_STATUS,
} from '../services/documentService.js';
import { sendEmail, isValidEmail } from '../services/emailService.js';
import { sendWhatsAppMessage, buildWhatsAppDirectUrl, normalizeWhatsAppPhone } from '../services/whatsappService.js';
import { resolveHotelOwnerEmail } from '../services/notificationService.js';
import { resolveHotelOwnerWhatsApp } from '../services/dailySummaryService.js';

const router = express.Router();

/**
 * GET /api/reservations
 * Authoritative paginated list with search, date range, channel, and status filters.
 */
router.get('/', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    if (!hotelId) {
      return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.' });
    }

    // Opportunistic automatic reconciliation for pending unassigned OTA reservations
    try {
      await processPendingRoomAllocations(hotelId);
    } catch (allocErr) {
      console.warn('[Reservations] Background reconciliation non-blocking warning:', allocErr.message);
    }

    const {
      page = 1,
      pageSize = 20,
      search = '',
      fromDate,
      toDate,
      status,
      sourceCategory,
      assignedStatus, // 'all', 'assigned', 'unassigned'
      roomNo,
      sortBy = 'check_in_date',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
    const offset = (pageNum - 1) * limit;

    let query = supabaseServiceRole
      .from('reservations')
      .select('*')
      .eq('hotel_id', hotelId);

    // Filter by status
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    // Filter by source / channel
    if (sourceCategory && sourceCategory !== 'all') {
      query = query.eq('source_category', sourceCategory);
    }

    // Filter by room
    if (roomNo && roomNo !== 'all') {
      query = query.ilike('room_no', roomNo.trim());
    }

    // Filter by assigned / unassigned
    if (assignedStatus === 'unassigned') {
      query = query.or('room_no.is.null,room_no.eq.,room_no.ilike.unassigned,room_no.ilike.tbd');
    } else if (assignedStatus === 'assigned') {
      query = query
        .not('room_no', 'is', null)
        .neq('room_no', '')
        .not('room_no', 'ilike', 'unassigned')
        .not('room_no', 'ilike', 'tbd');
    }

    // Filter by stay dates (stay overlaps [fromDate, toDate])
    if (fromDate && toDate) {
      query = query.lt('check_in_date', toDate).gt('check_out_date', fromDate);
    } else if (fromDate) {
      query = query.gte('check_out_date', fromDate);
    } else if (toDate) {
      query = query.lte('check_in_date', toDate);
    }

    // Search query: guest name, phone, email, room, id
    if (search && search.trim()) {
      const s = search.trim();
      query = query.or(`guest_name.ilike.%${s}%,guest_phone.ilike.%${s}%,guest_email.ilike.%${s}%,room_no.ilike.%${s}%,payment_ref.ilike.%${s}%`);
    }

    // Sort order
    const isAscending = String(sortOrder).toLowerCase() === 'asc';
    query = query.order(sortBy, { ascending: isAscending });

    // Fetch all matching reservations for accurate grouping & pagination
    const { data: rawReservations, error } = await query;
    if (error) {
      console.error('[API /reservations] Query error:', error);
      throw error;
    }

    // Deduplicate any accidental duplicate physical room records in the same group
    const seenGroupRooms = new Set();
    const cleanReservations = [];
    const duplicateIdsToDelete = [];

    for (const r of (rawReservations || [])) {
      const roomKey = (r.room_no || '').trim().toLowerCase();
      const isPhysical = roomKey && roomKey !== 'unassigned' && roomKey !== 'tbd';
      const dedupeKey = r.group_id && isPhysical ? `${r.group_id}::${roomKey}` : null;
      if (dedupeKey) {
        if (seenGroupRooms.has(dedupeKey)) {
          duplicateIdsToDelete.push(r.id);
          continue;
        }
        seenGroupRooms.add(dedupeKey);
      }
      cleanReservations.push(r);
    }

    if (duplicateIdsToDelete.length > 0) {
      console.log(`[API /reservations] Auto-purging ${duplicateIdsToDelete.length} duplicate room records:`, duplicateIdsToDelete);
      supabaseServiceRole
        .from('reservations')
        .delete()
        .in('id', duplicateIdsToDelete)
        .catch((e) => console.warn('[API /reservations] Duplicate delete warning:', e.message));
    }

    // Grouping BEFORE pagination
    const groupsMap = new Map();
    const groupOrder = [];

    for (const r of cleanReservations) {
      const normalizedName = (r.guest_name || '').trim().toLowerCase();
      const key = (r.group_id && r.group_id.trim() !== '') 
        ? r.group_id 
        : (normalizedName ? `${normalizedName}::${r.check_in_date}::${r.check_out_date}` : r.id);

      if (!groupsMap.has(key)) {
        groupsMap.set(key, []);
        groupOrder.push(key);
      }
      groupsMap.get(key).push(r);
    }

    const totalGroupsCount = groupOrder.length;
    const paginatedGroupKeys = groupOrder.slice(offset, offset + limit);
    const paginatedReservations = [];
    for (const k of paginatedGroupKeys) {
      paginatedReservations.push(...groupsMap.get(k));
    }

    // Calculate Global Metrics independent of filters & pagination
    const { data: allHotelRes } = await supabaseServiceRole
      .from('reservations')
      .select('id, group_id, status, room_no, invoice_total, rate, nights')
      .eq('hotel_id', hotelId);

    const seenMetricsKeys = new Set();
    let totalBookings = 0;
    let confirmedCount = 0;
    let checkedInCount = 0;
    let unassignedCount = 0;
    let pipelineTariff = 0;

    for (const r of (allHotelRes || [])) {
      const roomKey = (r.room_no || '').trim().toLowerCase();
      const isPhysical = roomKey && roomKey !== 'unassigned' && roomKey !== 'tbd';
      const dedupeKey = r.group_id && isPhysical ? `${r.group_id}::${roomKey}` : null;
      const key = dedupeKey || r.id;

      if (!seenMetricsKeys.has(key)) {
        seenMetricsKeys.add(key);
        totalBookings++;
        if (r.status === 'confirmed') confirmedCount++;
        if (r.status === 'checked_in') checkedInCount++;
        if (!isPhysical) unassignedCount++;
        const invoiceTotal = Number(r.invoice_total) || 0;
        const rate = Number(r.rate) || 0;
        const nights = Number(r.nights) || 1;
        pipelineTariff += (invoiceTotal > 0 ? invoiceTotal : (rate * nights));
      }
    }

    res.json({
      success: true,
      reservations: paginatedReservations,
      totalCount: totalGroupsCount,
      page: pageNum,
      pageSize: limit,
      totalPages: Math.ceil(totalGroupsCount / limit),
      metrics: {
        totalBookings,
        confirmed: confirmedCount,
        checkedIn: checkedInCount,
        unassigned: unassignedCount,
        totalRevenue: pipelineTariff
      }
    });
  } catch (err) {
    console.error('Error in GET /api/reservations:', err);
    res.status(500).json({
      success: false,
      code: 'RESERVATIONS_FETCH_FAILED',
      message: 'Failed to fetch reservations list.',
    });
  }
});

/**
 * GET /api/reservations/conflicts
 * Diagnostic view for authorized admins to detect existing historical conflicts.
 */
router.get('/conflicts', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    if (!hotelId) {
      return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.' });
    }

    const conflicts = await detectExistingConflicts(hotelId);
    res.json({
      success: true,
      conflicts,
      count: conflicts.length,
    });
  } catch (err) {
    console.error('Error checking reservation conflicts:', err);
    res.status(500).json({ success: false, code: 'CONFLICT_SCAN_FAILED', message: 'Failed to scan reservation conflicts.' });
  }
});

/**
 * POST /api/reservations/check-availability
 * Proactive check for frontend date/room selection before submit.
 */
router.post('/check-availability', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { roomNo, checkIn, checkOut, excludeReservationId } = req.body;

    const result = await checkRoomAvailability({
      hotelId,
      roomNo,
      checkIn,
      checkOut,
      excludeReservationId,
    });

    res.json({
      success: true,
      available: result.available,
      code: result.code || null,
      message: result.message || (result.available ? 'Room is available.' : 'Room is not available.'),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Availability check failed.' });
  }
});

/**
 * POST /api/reservations
 * Authoritative atomic creation of single or multi-room reservation.
 */
router.post('/', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const userId = req.user?.id || req.auth?.userId || null;

    const rawList = Array.isArray(req.body) ? req.body : [req.body];
    if (rawList.length === 0) {
      return res.status(400).json({ success: false, code: 'EMPTY_INPUT', message: 'No reservation inputs provided.' });
    }

    // Backend validation: Guest email is mandatory for manual reservations and deduplicate physical rooms
    const seenPhysicalRooms = new Set();
    const cleanList = [];
    for (const item of rawList) {
      const roomKey = (item.room_no || '').trim().toLowerCase();
      const isPhysical = roomKey && roomKey !== 'tbd' && roomKey !== 'unassigned';
      if (isPhysical) {
        if (seenPhysicalRooms.has(roomKey)) {
          console.warn(`[API /reservations] Deduplicating redundant physical room in batch payload: ${item.room_no}`);
          continue;
        }
        seenPhysicalRooms.add(roomKey);
      }

      const isOta = Boolean(item.is_ota || item.source_category === 'OTA');
      const cleanEmail = (item.guest_email || '').trim();
      if (!isOta) {
        if (!cleanEmail) {
          return res.status(422).json({
            success: false,
            code: 'GUEST_EMAIL_REQUIRED',
            message: 'Guest email is required to create a reservation.',
          });
        }
        if (!isValidEmail(cleanEmail)) {
          return res.status(422).json({
            success: false,
            code: 'INVALID_GUEST_EMAIL',
            message: 'Please provide a valid guest email address.',
          });
        }
      }
      cleanList.push(item);
    }

    const result = await createReservationsAtomically({
      hotelId,
      inputs: cleanList,
      userId,
    });

    // Generate confirmation PDF and deliver confirmation email/notification
    const deliveryResults = [];
    for (const resItem of result) {
      try {
        const delivery = await generateAndDeliverConfirmation({
          hotelId,
          reservationId: resItem.id,
          reservation: resItem,
          eventType: 'NEW_RESERVATION',
          generatedBy: userId || 'STAFF',
        });
        deliveryResults.push(delivery);
      } catch (e) {
        console.error(`[API /reservations] Confirmation delivery error for ${resItem.id}:`, e.message);
        deliveryResults.push({
          emailDelivery: { status: 'failed', error: e.message },
          whatsappDelivery: { status: 'pending' },
        });
      }
    }

    const firstDelivery = deliveryResults[0];
    const emailStatus = firstDelivery?.emailDelivery?.status === 'sent'
      ? 'EMAIL_SENT'
      : firstDelivery?.emailDelivery?.status === 'not_configured'
      ? 'EMAIL_NOT_CONFIGURED'
      : firstDelivery?.email?.status === 'sent'
      ? 'EMAIL_SENT'
      : firstDelivery?.email?.status === 'not_configured'
      ? 'EMAIL_NOT_CONFIGURED'
      : 'EMAIL_FAILED';

    const waStatusRaw = firstDelivery?.whatsapp?.status || firstDelivery?.whatsappDelivery?.status;
    const whatsappStatus = waStatusRaw === 'sent'
      ? 'WHATSAPP_SENT'
      : waStatusRaw === 'duplicate'
      ? 'WHATSAPP_DUPLICATE_PREVENTED'
      : waStatusRaw === 'not_configured'
      ? 'WHATSAPP_NOT_CONFIGURED'
      : waStatusRaw === 'skipped'
      ? 'WHATSAPP_SKIPPED'
      : waStatusRaw === 'ready_manual'
      ? 'WHATSAPP_READY_MANUAL'
      : 'WHATSAPP_FAILED';

    res.status(201).json({
      success: true,
      message: 'Reservation created successfully.',
      reservations: result,
      reservation: result[0],
      emailStatus,
      emailDelivery: firstDelivery?.email || firstDelivery?.emailDelivery || null,
      whatsappStatus,
      whatsappDelivery: firstDelivery?.whatsapp || firstDelivery?.whatsappDelivery || null,
      pdfDocument: firstDelivery?.pdf || firstDelivery?.document || null,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      code: err.code || 'RESERVATION_CREATE_FAILED',
      message: err.message || 'Failed to create reservation.',
      conflictingReservation: err.conflictingReservation || null,
    });
  }
});

/**
 * PUT /api/reservations/:id
 * Authoritative atomic update of a reservation.
 */
router.put('/:id', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const userId = req.user?.id || req.auth?.userId || null;
    const { id } = req.params;

    const isOta = Boolean(req.body.is_ota || req.body.source_category === 'OTA');
    if (!isOta && req.body.guest_email !== undefined && req.body.guest_email !== null) {
      const cleanEmail = String(req.body.guest_email).trim();
      if (cleanEmail && !isValidEmail(cleanEmail)) {
        return res.status(422).json({
          success: false,
          code: 'INVALID_GUEST_EMAIL',
          message: 'Please provide a valid guest email address.',
        });
      }
    }

    const updated = await updateReservationAtomically({
      hotelId,
      reservationId: id,
      updates: req.body,
      userId,
    });

    // Asynchronously generate versioned modification confirmation
    (async () => {
      try {
        await generateAndDeliverConfirmation({
          hotelId,
          reservationId: id,
          reservation: updated,
          eventType: 'RESERVATION_MODIFIED',
          forceNewVersion: true,
          generatedBy: userId || 'STAFF',
        });
      } catch (e) {
        console.error(`[API /reservations/:id] Modification confirmation error for ${id}:`, e.message);
      }
    })().catch(e => console.error('[API /reservations/:id] Delivery worker error:', e));

    res.json({
      success: true,
      message: 'Reservation updated successfully.',
      reservation: updated,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      code: err.code || 'RESERVATION_UPDATE_FAILED',
      message: err.message || 'Failed to update reservation.',
      conflictingReservation: err.conflictingReservation || null,
    });
  }
});

/**
 * POST /api/reservations/:id/assign-room
 * Assigns or reassigns physical room with conflict prevention.
 */
router.post('/:id/assign-room', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const userId = req.user?.id || req.auth?.userId || null;
    const { id } = req.params;
    const { roomNo, roomId } = req.body;

    const updated = await assignPhysicalRoom({
      hotelId,
      reservationId: id,
      roomNo,
      roomId,
      userId,
    });

    (async () => {
      try {
        await generateAndDeliverConfirmation({
          hotelId,
          reservationId: id,
          reservation: updated,
          eventType: 'RESERVATION_MODIFIED',
          forceNewVersion: true,
          generatedBy: userId || 'STAFF',
        });
      } catch (e) {
        console.error(`[API /assign-room] Confirmation error for ${id}:`, e.message);
      }
    })().catch(e => console.error('[API /assign-room] Worker error:', e));

    res.json({
      success: true,
      message: `Room ${roomNo || 'Unassigned'} assigned successfully.`,
      reservation: updated,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      code: err.code || 'ROOM_ASSIGNMENT_FAILED',
      message: err.message || 'Failed to assign room.',
      conflictingReservation: err.conflictingReservation || null,
    });
  }
});

/**
 * POST /api/reservations/:id/auto-assign
 * Automatically assigns an eligible physical room to an unassigned reservation.
 */
router.post('/:id/auto-assign', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const userId = req.user?.id || req.auth?.userId || null;
    const { id } = req.params;
    const { preferredRoomNo, dryRun } = req.body || {};

    const result = await autoAssignPhysicalRoom({
      hotelId,
      reservationId: id,
      preferredRoomNo,
      userId,
      dryRun: Boolean(dryRun),
    });

    if (result.success && !dryRun) {
      (async () => {
        try {
          const { data: updatedRes } = await supabaseServiceRole
            .from('reservations')
            .select('*')
            .eq('id', id)
            .single();

          if (updatedRes) {
            await generateAndDeliverConfirmation({
              hotelId,
              reservationId: id,
              reservation: updatedRes,
              eventType: 'RESERVATION_MODIFIED',
              forceNewVersion: true,
              generatedBy: userId || 'STAFF',
            });
          }
        } catch (e) {
          console.error(`[API /auto-assign] Confirmation error for ${id}:`, e.message);
        }
      })().catch(e => console.error('[API /auto-assign] Worker error:', e));
    }

    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      code: err.code || 'AUTO_ASSIGN_FAILED',
      message: err.message || 'Failed to auto-assign room.',
    });
  }
});

/**
 * POST /api/reservations/auto-assign-all
 * Batch auto-assigns all unassigned reservations in the hotel.
 */
router.post('/auto-assign-all', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const result = await batchAutoAssignReservations(hotelId);
    res.json({
      success: true,
      message: `Processed ${result.total} unassigned reservations: ${result.assignedCount} assigned, ${result.unassignedCount} remaining.`,
      ...result,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      code: 'BATCH_AUTO_ASSIGN_FAILED',
      message: err.message || 'Failed to batch auto-assign reservations.',
    });
  }
});

/**
 * GET /api/reservations/auto-assign-setting
 * Retrieves hotel setting for automatic room assignment.
 */
router.get('/auto-assign-setting', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const enabled = await isAutoAssignEnabled(hotelId);
    res.json({ success: true, hotelId, enabled });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve auto-assign setting.' });
  }
});

/**
 * POST /api/reservations/auto-assign-setting
 * Updates hotel setting for automatic room assignment.
 */
router.post('/auto-assign-setting', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { enabled } = req.body;
    const result = await setAutoAssignEnabled(hotelId, enabled);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update auto-assign setting.' });
  }
});

/**
 * POST /api/reservations/:id/extend
 * Extends reservation stay date with conflict checking.
 */
router.post('/:id/extend', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const userId = req.user?.id || req.auth?.userId || null;
    const { id } = req.params;
    const { newCheckOut } = req.body;

    const updated = await extendReservationStay({
      hotelId,
      reservationId: id,
      newCheckOut,
      userId,
    });

    (async () => {
      try {
        await generateAndDeliverConfirmation({
          hotelId,
          reservationId: id,
          reservation: updated,
          eventType: 'RESERVATION_MODIFIED',
          forceNewVersion: true,
          generatedBy: userId || 'STAFF',
        });
      } catch (e) {
        console.error(`[API /extend] Confirmation error for ${id}:`, e.message);
      }
    })().catch(e => console.error('[API /extend] Worker error:', e));

    res.json({
      success: true,
      message: 'Stay extended successfully.',
      reservation: updated,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      code: err.code || 'STAY_EXTENSION_FAILED',
      message: err.message || 'Failed to extend stay.',
      conflictingReservation: err.conflictingReservation || null,
    });
  }
});

/**
 * POST /api/reservations/:id/check-in
 * Safe check-in validation.
 */
router.post('/:id/check-in', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const userId = req.user?.id || req.auth?.userId || null;
    const { id } = req.params;

    const result = await validateAndProcessCheckIn({
      hotelId,
      reservationId: id,
      userId,
    });

    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      code: err.code || 'CHECK_IN_BLOCKED',
      message: err.message || 'Failed to check in.',
    });
  }
});

/**
 * DELETE /api/reservations/:id
 * Cancels or deletes a reservation.
 */
router.delete('/:id', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { id } = req.params;
    const { hardDelete = false } = req.query;

    if (hardDelete === 'true') {
      const { error } = await supabaseServiceRole
        .from('reservations')
        .delete()
        .eq('id', id)
        .eq('hotel_id', hotelId);
      if (error) throw error;
    } else {
      const { error } = await supabaseServiceRole
        .from('reservations')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('hotel_id', hotelId);
      if (error) throw error;

      // Asynchronously generate cancellation confirmation
      (async () => {
        try {
          await generateAndDeliverConfirmation({
            hotelId,
            reservationId: id,
            eventType: 'RESERVATION_CANCELLED',
            generatedBy: req.user?.id || 'STAFF',
          });
        } catch (e) {
          console.error(`[API /reservations/:id] Cancellation confirmation error for ${id}:`, e.message);
        }
      })().catch(e => console.error('[API /reservations/:id] Cancellation worker error:', e));
    }

    res.json({ success: true, message: 'Reservation cancelled successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, code: 'CANCEL_FAILED', message: 'Failed to cancel reservation.' });
  }
});

// ─── GET /api/reservations/:id/confirmation ──────────────────────────────────
/**
 * Returns latest confirmation document status, versions history, and WhatsApp links.
 */
router.get('/:id/confirmation', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { id } = req.params;

    // 1. Verify reservation belongs to hotel
    const { data: reservation, error: resErr } = await supabaseServiceRole
      .from('reservations')
      .select('*')
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .maybeSingle();

    if (resErr || !reservation) {
      return res.status(404).json({ success: false, code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found.' });
    }

    // 2. Fetch existing documents
    let docs = await getReservationDocuments(hotelId, id);

    // If no document exists yet, auto-generate version 1
    if (!docs || docs.length === 0) {
      try {
        const gen = await generateAndStoreReservationConfirmation({
          hotelId,
          reservationId: id,
          reservation,
        });
        docs = [gen.document];
      } catch (err) {
        console.warn(`[API /confirmation] Auto-generation failed for ${id}:`, err.message);
      }
    }

    const latestDoc = docs && docs.length > 0 ? docs[0] : null;

    // 3. Resolve WhatsApp direct link (guest phone for direct, owner phone for OTA)
    const ownerWhatsApp = await resolveHotelOwnerWhatsApp(hotelId);
    let whatsappDirectUrl = null;
    const isOta = isOTAReservation(reservation);
    const targetPhone = isOta
      ? (ownerWhatsApp.valid ? ownerWhatsApp.phone : null)
      : (reservation.guest_phone || (ownerWhatsApp.valid ? ownerWhatsApp.phone : null));

    if (targetPhone) {
      const ci = String(reservation.check_in_date || '').slice(0, 10);
      const co = String(reservation.check_out_date || '').slice(0, 10);
      const d1 = new Date(ci + 'T00:00:00');
      const d2 = new Date(co + 'T00:00:00');
      const nights = Math.max(1, Math.round((d2 - d1) / (1000 * 3600 * 24)));

      const waText = buildReservationConfirmationWhatsAppText({
        hotelName: ownerWhatsApp.hotelName || 'Hotel Mantri',
        reservationId: id,
        confirmationNumber: `HM-RES-${id.slice(0, 8).toUpperCase()}`,
        otaBookingId: reservation.remarks || '',
        bookingSource: reservation.source_name || reservation.source_category || (isOta ? 'OTA' : 'Direct'),
        guestName: reservation.guest_name || 'Guest',
        checkIn: reservation.check_in_date,
        checkOut: reservation.check_out_date,
        nights,
        roomCategory: reservation.rate_plan || reservation.room_category || 'Standard',
        roomNo: reservation.room_no,
        totalAmount: reservation.invoice_total || reservation.rate || 0,
        advancePaid: reservation.advance_paid || 0,
        balanceDue: Math.max(0, (reservation.invoice_total || 0) - (reservation.advance_paid || 0)),
        version: latestDoc?.version || 1,
      });
      whatsappDirectUrl = buildWhatsAppDirectUrl(targetPhone, waText);
    }

    const ownerEmail = await resolveHotelOwnerEmail(hotelId);
    const recipientResolution = await resolveReservationNotificationRecipient({ hotelId, reservation });
    const sourceInfo = normalizeBookingSource(reservation);

    res.json({
      success: true,
      reservationId: id,
      document: latestDoc,
      versions: docs || [],
      recipient: recipientResolution,
      sourceInfo,
      guestContact: {
        name: reservation.guest_name || 'Guest',
        email: reservation.guest_email || null,
        phone: reservation.guest_phone || null,
      },
      ownerContact: {
        email: ownerEmail?.email || null,
        phone: ownerWhatsApp.valid ? ownerWhatsApp.phone : null,
      },
      whatsappDirectUrl,
    });
  } catch (err) {
    console.error('Error fetching reservation confirmation:', err);
    res.status(500).json({ success: false, code: 'CONFIRMATION_FETCH_FAILED', message: err.message });
  }
});

// ─── GET /api/reservations/:id/confirmation/pdf ──────────────────────────────
/**
 * Streams or downloads the generated PDF document.
 */
router.get('/:id/confirmation/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    let hotelId = req.headers['x-hotel-id'] || req.query.hotelId || req.hotelId || req.auth?.hotelId;
    const requestedVersion = req.query.version ? parseInt(req.query.version, 10) : null;

    // Verify reservation exists and resolve hotelId
    const query = supabaseServiceRole
      .from('reservations')
      .select('*')
      .eq('id', id);

    if (hotelId) {
      query.eq('hotel_id', hotelId);
    }

    const { data: reservation, error: resErr } = await query.maybeSingle();

    if (resErr || !reservation) {
      return res.status(404).json({ success: false, code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found.' });
    }

    hotelId = reservation.hotel_id;

    const docs = await getReservationDocuments(hotelId, id);
    let targetDoc = null;
    if (requestedVersion) {
      targetDoc = docs.find(d => d.version === requestedVersion);
    } else {
      targetDoc = docs[0];
    }

    let pdfBuffer = null;
    if (targetDoc?.storage_path) {
      pdfBuffer = await readPdfFromStorage(hotelId, id, targetDoc.storage_path);
    }

    if (!pdfBuffer) {
      // Generate on the fly if file missing
      const gen = await generateAndStoreReservationConfirmation({
        hotelId,
        reservationId: id,
        reservation,
      });
      pdfBuffer = gen.buffer;
      targetDoc = gen.document;
    }

    const fileName = targetDoc?.file_name || `Hotel-Mantri-Reservation-Confirmation-HM-${id.slice(0, 8).toUpperCase()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) {
    console.error('Error streaming confirmation PDF:', err);
    res.status(500).json({ success: false, code: 'PDF_FETCH_FAILED', message: err.message });
  }
});

// ─── POST /api/reservations/:id/confirmation/regenerate ──────────────────────
router.post('/:id/confirmation/regenerate', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const userId = req.user?.id || req.auth?.userId || 'STAFF';
    const { id } = req.params;
    const { newVersion = false } = req.body;

    const result = await generateAndDeliverConfirmation({
      hotelId,
      reservationId: id,
      forceNewVersion: !!newVersion,
      generatedBy: userId,
    });

    res.json({
      success: true,
      message: 'Confirmation regenerated successfully.',
      ...result,
    });
  } catch (err) {
    console.error('Error regenerating confirmation:', err);
    res.status(500).json({ success: false, code: 'REGENERATE_FAILED', message: err.message });
  }
});

// ─── POST /api/reservations/:id/confirmation/send-email ──────────────────────
router.post('/:id/confirmation/send-email', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { id } = req.params;
    const { recipientEmail } = req.body;

    // 1. Fetch reservation
    const { data: reservation, error: resErr } = await supabaseServiceRole
      .from('reservations')
      .select('*')
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .maybeSingle();

    if (resErr || !reservation) {
      return res.status(404).json({ success: false, code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found.' });
    }

    // 2. Resolve recipient email: either custom recipient or source-based resolution
    const recipientResolution = await resolveReservationNotificationRecipient({ hotelId, reservation });
    let targetEmail = (recipientEmail || '').trim();
    let isOta = recipientResolution.sourceType === 'OTA';

    if (!targetEmail) {
      if (recipientResolution.recipientType === 'NONE') {
        return res.status(400).json({
          success: false,
          code: 'EMAIL_NOT_AVAILABLE',
          message: 'Customer email is not available for this reservation. Please provide a recipient email address to send the confirmation.',
        });
      }
      targetEmail = recipientResolution.email || '';
    } else {
      // If user manually entered an email for an OTA booking, keep isOta true; if manual booking, keep false
      if (!isOTAReservation(reservation)) {
        isOta = false;
      }
    }

    if (!targetEmail || !isValidEmail(targetEmail)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_RECIPIENT',
        message: 'No valid recipient email address available.',
      });
    }

    // 3. Ensure confirmation PDF exists
    let docs = await getReservationDocuments(hotelId, id);
    let targetDoc = docs[0];
    let pdfBuffer = targetDoc ? await readPdfFromStorage(hotelId, id, targetDoc.storage_path) : null;

    if (!pdfBuffer) {
      const gen = await generateAndStoreReservationConfirmation({ hotelId, reservationId: id, reservation });
      pdfBuffer = gen.buffer;
      targetDoc = gen.document;
    }

    // 4. Build email content using dedicated source template
    const hotel = (await supabaseServiceRole.from('hotels').select('*').eq('id', hotelId).maybeSingle()).data || {};
    const settings = (await supabaseServiceRole.from('hotel_settings').select('*').eq('id', hotelId).maybeSingle()).data || {};
    const hotelName = settings.hotel_name || hotel.hotel_name || 'Hotel Mantri';
    const hotelPhone = settings.phone || hotel.phone || '';
    const hotelEmail = settings.email || hotel.email || '';
    const hotelAddress = settings.address || hotel.address || '';

    const checkIn = String(reservation.check_in_date || '').slice(0, 10);
    const checkOut = String(reservation.check_out_date || '').slice(0, 10);
    const d1 = new Date(checkIn + 'T00:00:00');
    const d2 = new Date(checkOut + 'T00:00:00');
    const nights = Math.max(1, Math.round((d2 - d1) / (1000 * 3600 * 24)));
    const rateVal = Number(reservation.rate) || 0;
    const taxableVal = Number(reservation.taxable_amount) || (rateVal * nights);
    const gstVal = Number(reservation.gst_amount) || 0;
    const totalVal = Number(reservation.invoice_total) || (taxableVal + gstVal);
    const advanceVal = Number(reservation.advance_paid) || 0;
    const dueVal = Math.max(0, totalVal - advanceVal);

    let emailContent;
    if (isOta) {
      emailContent = buildOtaOwnerConfirmationEmail({
        hotelName,
        reservationId: id,
        confirmationNumber: `HM-RES-${id.slice(0, 8).toUpperCase()}`,
        otaBookingId: recipientResolution.otaBookingId || reservation.remarks || '',
        bookingSource: recipientResolution.sourceName || reservation.source_name || 'OTA',
        guestName: reservation.guest_name || 'Guest',
        guestPhone: reservation.guest_phone || '',
        checkIn,
        checkOut,
        nights,
        roomCategory: reservation.rate_plan || reservation.room_category || 'Standard',
        roomNo: reservation.room_no,
        ratePlan: reservation.rate_plan || 'Standard',
        totalAmount: totalVal,
        advancePaid: advanceVal,
        balanceDue: dueVal,
        paymentStatus: dueVal === 0 ? 'Paid' : 'Pending',
        specialRequests: reservation.remarks || '',
        pdfFilename: targetDoc.file_name,
        version: targetDoc.version || 1,
      });
    } else {
      emailContent = buildCustomerConfirmationEmail({
        hotelName,
        hotelPhone,
        hotelEmail,
        hotelAddress,
        reservationId: id,
        confirmationNumber: `HM-RES-${id.slice(0, 8).toUpperCase()}`,
        bookingDate: reservation.created_at || new Date().toISOString(),
        bookingSource: reservation.source_name || reservation.source_category || 'Walk-in',
        guestName: reservation.guest_name || 'Guest',
        guestPhone: reservation.guest_phone || '',
        guestEmail: targetEmail,
        checkIn,
        checkOut,
        nights,
        roomCategory: reservation.rate_plan || reservation.room_category || 'Standard',
        roomsCount: 1,
        roomNo: reservation.room_no,
        mealPlan: reservation.meal_plan || 'EP',
        ratePlan: reservation.rate_plan || 'Standard',
        totalAmount: totalVal,
        advancePaid: advanceVal,
        balanceDue: dueVal,
        paymentStatus: dueVal === 0 ? 'Paid' : 'Pending',
        pdfFilename: targetDoc.file_name,
        version: targetDoc.version || 1,
      });
    }

    // 5. Send email via SMTP with attached PDF
    const sendResult = await sendEmail({
      to: targetEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      attachments: [
        {
          filename: targetDoc.file_name,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    if (sendResult.success) {
      await updateDocumentDeliveryStatus(hotelId, id, targetDoc.version, { emailStatus: DELIVERY_STATUS.SENT });
      return res.json({
        success: true,
        message: `Confirmation email sent to ${targetEmail}.`,
        messageId: sendResult.messageId,
      });
    } else {
      await updateDocumentDeliveryStatus(hotelId, id, targetDoc.version, {
        emailStatus: DELIVERY_STATUS.FAILED,
        errorDetails: sendResult.errorCode || sendResult.message,
      });
      return res.status(502).json({
        success: false,
        code: sendResult.errorCode || 'EMAIL_SEND_FAILED',
        message: sendResult.message || 'Failed to send confirmation email.',
      });
    }
  } catch (err) {
    console.error('Error sending confirmation email:', err);
    res.status(500).json({ success: false, code: 'EMAIL_SEND_FAILED', message: err.message });
  }
});

// ─── POST /api/reservations/:id/confirmation/send-whatsapp ───────────────────
router.post('/:id/confirmation/send-whatsapp', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { id } = req.params;
    const { phoneNumber } = req.body;

    // 1. Fetch reservation
    const { data: reservation, error: resErr } = await supabaseServiceRole
      .from('reservations')
      .select('*')
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .maybeSingle();

    if (resErr || !reservation) {
      return res.status(404).json({ success: false, code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found.' });
    }

    // 2. Resolve recipient phone
    let targetPhone = phoneNumber;
    const hotelObj = (await supabaseServiceRole.from('hotels').select('*').eq('id', hotelId).maybeSingle()).data || {};
    const settingsObj = (await supabaseServiceRole.from('hotel_settings').select('*').eq('id', hotelId).maybeSingle()).data || {};
    const hotelName = settingsObj.hotel_name || hotelObj.hotel_name || 'Hotel Mantri';

    if (!targetPhone) {
      if (reservation.guest_phone) {
        targetPhone = reservation.guest_phone;
      } else {
        const ownerWhatsApp = await resolveHotelOwnerWhatsApp(hotelId);
        if (ownerWhatsApp.valid) {
          targetPhone = ownerWhatsApp.phone;
        }
      }
    }

    const norm = normalizeWhatsAppPhone(targetPhone);
    if (!norm.valid) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PHONE',
        message: norm.error || 'No valid recipient WhatsApp phone number available.',
      });
    }
    targetPhone = norm.normalized;

    const checkIn = String(reservation.check_in_date || '').slice(0, 10);
    const checkOut = String(reservation.check_out_date || '').slice(0, 10);
    const d1 = new Date(checkIn + 'T00:00:00');
    const d2 = new Date(checkOut + 'T00:00:00');
    const nights = Math.max(1, Math.round((d2 - d1) / (1000 * 3600 * 24)));
    const totalVal = Number(reservation.invoice_total) || (Number(reservation.rate || 0) * nights);
    const advanceVal = Number(reservation.advance_paid) || 0;
    const dueVal = Math.max(0, totalVal - advanceVal);

    const waText = buildReservationConfirmationWhatsAppText({
      hotelName,
      reservationId: id,
      confirmationNumber: `HM-RES-${id.slice(0, 8).toUpperCase()}`,
      otaBookingId: reservation.remarks || '',
      bookingSource: reservation.source_name || reservation.source_category || 'Direct',
      guestName: reservation.guest_name || 'Guest',
      checkIn,
      checkOut,
      nights,
      roomCategory: reservation.rate_plan || reservation.room_category || 'Standard',
      roomNo: reservation.room_no,
      totalAmount: totalVal,
      advancePaid: advanceVal,
      balanceDue: dueVal,
    });

    const directUrl = buildWhatsAppDirectUrl(targetPhone, waText);

    const roomInfo = `${reservation.rate_plan || reservation.room_category || 'Standard'}${
      reservation.room_no && reservation.room_no.toLowerCase() !== 'unassigned' ? ` (Room ${reservation.room_no})` : ''
    }`;

    const metaTemplate = buildMetaBookingConfirmationTemplate({
      guestName: reservation.guest_name || 'Guest',
      hotelName,
      confirmationNumber: `HM-RES-${id.slice(0, 8).toUpperCase()}`,
      roomDetails: roomInfo,
      checkIn: formatDateReadable(checkIn),
      checkOut: formatDateReadable(checkOut),
      totalAmount: totalVal,
    });

    // Send via provider
    const sendResult = await sendWhatsAppMessage({
      to: targetPhone,
      text: waText,
      templateName: metaTemplate.templateName,
      templateComponents: metaTemplate.templateComponents,
      templateLanguage: metaTemplate.templateLanguage,
    });

    // Update document delivery status if document exists
    const docs = await getReservationDocuments(hotelId, id);
    const latestVersion = docs && docs.length > 0 ? docs[0].version : 1;
    if (sendResult.success) {
      await updateDocumentDeliveryStatus(hotelId, id, latestVersion, { whatsappStatus: DELIVERY_STATUS.SENT });
      return res.json({
        success: true,
        message: 'WhatsApp confirmation sent successfully.',
        messageId: sendResult.messageId,
        whatsappDirectUrl: directUrl,
      });
    } else {
      const isNotConfigured = sendResult.status === 'provider_not_configured';
      await updateDocumentDeliveryStatus(hotelId, id, latestVersion, {
        whatsappStatus: isNotConfigured ? DELIVERY_STATUS.NOT_CONFIGURED : DELIVERY_STATUS.FAILED,
        errorDetails: sendResult.message || sendResult.errorCode,
      });
      return res.json({
        success: false,
        code: sendResult.errorCode,
        message: sendResult.message,
        whatsappDirectUrl: directUrl,
      });
    }
  } catch (err) {
    console.error('Error sending confirmation WhatsApp:', err);
    res.status(500).json({ success: false, code: 'WHATSAPP_SEND_FAILED', message: err.message });
  }
});

export default router;
