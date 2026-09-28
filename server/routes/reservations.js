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
} from '../services/RoomAssignmentService.js';

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
      .select('*', { count: 'exact' })
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

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data: reservations, count, error } = await query;
    if (error) {
      console.error('[API /reservations] Query error:', error);
      throw error;
    }

    res.json({
      success: true,
      reservations: reservations || [],
      totalCount: count || 0,
      page: pageNum,
      pageSize: limit,
      totalPages: Math.ceil((count || 0) / limit),
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

    const result = await createReservationsAtomically({
      hotelId,
      inputs: req.body,
      userId,
    });

    res.status(201).json({
      success: true,
      message: 'Reservation created successfully.',
      reservations: result,
      reservation: result[0],
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

    const updated = await updateReservationAtomically({
      hotelId,
      reservationId: id,
      updates: req.body,
      userId,
    });

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
    }

    res.json({ success: true, message: 'Reservation cancelled successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, code: 'CANCEL_FAILED', message: 'Failed to cancel reservation.' });
  }
});

export default router;
