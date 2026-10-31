/**
 * HOTEL MANTRI — Housekeeping API Routes
 * 
 * Provides:
 * - GET  /api/housekeeping/rooms             — Authoritative rooms list with cleaning status & priorities
 * - POST /api/housekeeping/start-cleaning    — Transition: Vacant Dirty / Assigned → Cleaning In Progress
 * - POST /api/housekeeping/complete-cleaning — Transition: Cleaning In Progress → Ready for Inspection
 * - POST /api/housekeeping/send-for-inspection — Explicit send room for inspection
 * - POST /api/housekeeping/approve-inspection — Transition: Ready for Inspection → Vacant Clean / Ready
 * - POST /api/housekeeping/reject-inspection  — Reject inspection: moves back to Cleaning In Progress
 * - POST /api/housekeeping/priority          — Update room cleaning priority
 * - POST /api/housekeeping/note              — Add / update housekeeping note
 * - POST /api/housekeeping/maintenance       — Report maintenance issue
 * - GET  /api/housekeeping/maintenance       — List maintenance issues
 * - GET  /api/housekeeping/staff             — List housekeeping staff
 * - POST /api/housekeeping/assign            — Assign room to staff member
 * 
 * SECURITY:
 * - Accessible by Housekeeping, Reception, Manager, Owner / Hotel Admin, Super Admin.
 * - Sensitive hotel financial data (rates, guest billing, payouts) is strictly omitted.
 */

import express from 'express';
import { supabaseServiceRole, ensureAuth } from '../supabaseClient.js';
import { requireHotelAccess as checkAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(checkAuth);

/**
 * Helper to compute effective user-facing housekeeping status
 * based on rooms table (Vacant Clean, Vacant Dirty, Inspection, Occupied, Out Of Order, Blocked)
 * and housekeeping_assignments table (pending, in_progress, completed).
 */
const resolveEffectiveStatus = (room, assignment) => {
  const dbStatus = room.housekeeping_status || 'Vacant Clean';
  if (dbStatus === 'Inspection') {
    return 'Ready for Inspection';
  }
  if (dbStatus === 'Vacant Clean') {
    return 'Vacant Clean';
  }
  if (dbStatus === 'Vacant Dirty') {
    if (assignment?.status === 'in_progress') {
      return 'Cleaning In Progress';
    }
    if (assignment?.status === 'completed') {
      return 'Ready for Inspection';
    }
    if (room.assigned_staff_id || assignment?.status === 'pending') {
      return 'Assigned';
    }
    return 'Vacant Dirty';
  }
  return dbStatus;
};

/**
 * GET /api/housekeeping/rooms
 * Returns all active rooms with housekeeping fields, sanitized of financial/rate data.
 */
router.get('/rooms', async (req, res) => {
  const requestId = req.requestId || 'REQ-HK-ROOMS';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    if (!hotelId) {
      return res.status(400).json({ success: false, error: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.' });
    }

    await ensureAuth();

    // Query rooms with non-sensitive fields (omitting room_type which does not exist)
    const { data: rooms, error: roomErr } = await supabaseServiceRole
      .from('rooms')
      .select('id, hotel_id, room_no, category_id, floor, is_active, sort_order, housekeeping_status, cleaning_priority, assigned_staff_id, housekeeping_note, housekeeping_updated_at, last_cleaned_at, last_inspected_at, last_departure_time, last_guest_name')
      .eq('hotel_id', hotelId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (roomErr) {
      console.error(`[${requestId}] Failed to fetch housekeeping rooms:`, roomErr);
      return res.status(500).json({ success: false, error: 'DATABASE_ERROR', message: roomErr.message });
    }

    // Fetch active assignments for the hotel
    const { data: assignments } = await supabaseServiceRole
      .from('housekeeping_assignments')
      .select('id, room_no, staff_id, status, priority, cleaning_started_at, cleaning_completed_at, notes')
      .eq('hotel_id', hotelId);

    const assignMap = new Map();
    (assignments || []).forEach((a) => {
      // Keep most relevant assignment per room (in_progress > pending > completed)
      const existing = assignMap.get(a.room_no);
      if (!existing || a.status === 'in_progress') {
        assignMap.set(a.room_no, a);
      }
    });

    // Also fetch staff names for mapping assigned_staff_id
    const { data: staff } = await supabaseServiceRole
      .from('housekeeping_staff')
      .select('id, name, phone, role, is_active')
      .eq('hotel_id', hotelId);

    const staffMap = new Map();
    (staff || []).forEach((s) => staffMap.set(s.id, s));

    const enrichedRooms = (rooms || []).map((r) => {
      const assignment = assignMap.get(r.room_no);
      const effectiveStatus = resolveEffectiveStatus(r, assignment);
      const assigned = r.assigned_staff_id ? staffMap.get(r.assigned_staff_id) : (assignment?.staff_id ? staffMap.get(assignment.staff_id) : null);

      return {
        ...r,
        housekeeping_status: effectiveStatus,
        raw_db_status: r.housekeeping_status,
        cleaning_started_at: assignment?.cleaning_started_at || null,
        cleaning_completed_at: assignment?.cleaning_completed_at || null,
        assigned_staff_name: assigned?.name || '',
        assigned_staff_phone: assigned?.phone || '',
      };
    });

    return res.json({
      success: true,
      rooms: enrichedRooms,
      total: enrichedRooms.length,
      requestId,
    });
  } catch (err) {
    console.error(`[${requestId}] GET /api/housekeeping/rooms exception:`, err);
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Server error loading rooms.' });
  }
});

/**
 * POST /api/housekeeping/start-cleaning
 * Flow: Vacant Dirty / Assigned → Cleaning In Progress
 */
router.post('/start-cleaning', async (req, res) => {
  const requestId = req.requestId || 'REQ-HK-START';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { roomNo, staffId } = req.body;
    if (!roomNo) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Room number is required.' });
    }

    await ensureAuth();
    const nowIso = new Date().toISOString();

    const updatePayload = {
      housekeeping_status: 'Vacant Dirty',
      housekeeping_updated_at: nowIso,
    };
    if (staffId) {
      updatePayload.assigned_staff_id = staffId;
    }

    const { error: roomErr } = await supabaseServiceRole
      .from('rooms')
      .update(updatePayload)
      .eq('hotel_id', hotelId)
      .eq('room_no', roomNo);

    if (roomErr) throw roomErr;

    // Record timeline & assignment
    try {
      await supabaseServiceRole.from('housekeeping_timeline').insert({
        hotel_id: hotelId,
        room_no: roomNo,
        action: 'Start Cleaning',
        old_status: 'Vacant Dirty',
        new_status: 'Cleaning In Progress',
        performed_by: req.user?.email || req.auth?.userId || 'Housekeeper',
      });

      // Upsert assignment with in_progress status
      const { data: existingAssign } = await supabaseServiceRole
        .from('housekeeping_assignments')
        .select('id')
        .eq('hotel_id', hotelId)
        .eq('room_no', roomNo)
        .maybeSingle();

      if (existingAssign) {
        await supabaseServiceRole
          .from('housekeeping_assignments')
          .update({
            status: 'in_progress',
            cleaning_started_at: nowIso,
            ...(staffId ? { staff_id: staffId } : {}),
          })
          .eq('id', existingAssign.id);
      } else {
        await supabaseServiceRole.from('housekeeping_assignments').insert({
          hotel_id: hotelId,
          room_no: roomNo,
          staff_id: staffId || null,
          status: 'in_progress',
          cleaning_started_at: nowIso,
        });
      }
    } catch { /* non-critical audit */ }

    return res.json({
      success: true,
      roomNo,
      status: 'Cleaning In Progress',
      startedAt: nowIso,
      message: `Cleaning started for Room ${roomNo}.`,
      requestId,
    });
  } catch (err) {
    console.error(`[${requestId}] start-cleaning error:`, err);
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to start cleaning.' });
  }
});

/**
 * POST /api/housekeeping/complete-cleaning
 * Flow: Cleaning In Progress → Ready for Inspection
 */
router.post('/complete-cleaning', async (req, res) => {
  const requestId = req.requestId || 'REQ-HK-COMPLETE';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { roomNo, notes = '' } = req.body;
    if (!roomNo) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Room number is required.' });
    }

    await ensureAuth();
    const nowIso = new Date().toISOString();

    // Sets db status to 'Inspection' (allowed by database check constraint)
    const { error: roomErr } = await supabaseServiceRole
      .from('rooms')
      .update({
        housekeeping_status: 'Inspection',
        housekeeping_updated_at: nowIso,
        last_cleaned_at: nowIso,
        ...(notes ? { housekeeping_note: notes } : {}),
      })
      .eq('hotel_id', hotelId)
      .eq('room_no', roomNo);

    if (roomErr) throw roomErr;

    try {
      await supabaseServiceRole.from('housekeeping_timeline').insert({
        hotel_id: hotelId,
        room_no: roomNo,
        action: 'Cleaning Completed',
        old_status: 'Cleaning In Progress',
        new_status: 'Ready for Inspection',
        performed_by: req.user?.email || req.auth?.userId || 'Housekeeper',
        notes,
      });

      await supabaseServiceRole
        .from('housekeeping_assignments')
        .update({ status: 'completed', cleaning_completed_at: nowIso })
        .eq('hotel_id', hotelId)
        .eq('room_no', roomNo);
    } catch { /* non-critical audit */ }

    return res.json({
      success: true,
      roomNo,
      status: 'Ready for Inspection',
      completedAt: nowIso,
      message: `Room ${roomNo} marked complete and sent for inspection.`,
      requestId,
    });
  } catch (err) {
    console.error(`[${requestId}] complete-cleaning error:`, err);
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to complete cleaning.' });
  }
});

/**
 * POST /api/housekeeping/send-for-inspection
 * Explicit action to move room into Ready for Inspection
 */
router.post('/send-for-inspection', async (req, res) => {
  const requestId = req.requestId || 'REQ-HK-INSPECT-SEND';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { roomNo } = req.body;
    if (!roomNo) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Room number is required.' });
    }

    await ensureAuth();
    const nowIso = new Date().toISOString();

    const { error } = await supabaseServiceRole
      .from('rooms')
      .update({
        housekeeping_status: 'Inspection',
        housekeeping_updated_at: nowIso,
      })
      .eq('hotel_id', hotelId)
      .eq('room_no', roomNo);

    if (error) throw error;

    return res.json({
      success: true,
      roomNo,
      status: 'Ready for Inspection',
      message: `Room ${roomNo} sent for inspection.`,
      requestId,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to submit room inspection.' });
  }
});

/**
 * POST /api/housekeeping/approve-inspection
 * Flow: Ready for Inspection → Vacant Clean / Ready
 */
router.post('/approve-inspection', async (req, res) => {
  const requestId = req.requestId || 'REQ-HK-APPROVE';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { roomNo } = req.body;
    if (!roomNo) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Room number is required.' });
    }

    // Role check: Housekeeping user must have canApproveInspection or be manager/owner/admin
    const userRole = (req.userRole || req.auth?.role || '').toLowerCase();
    const canApprove = Boolean(
      req.auth?.isSuperAdmin ||
      userRole === 'hotel_admin' ||
      userRole === 'owner' ||
      userRole === 'manager' ||
      Boolean(req.auth?.permissions?.canApproveInspection)
    );

    if (!canApprove) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        code: 'INSPECTION_PERMISSION_REQUIRED',
        message: 'You do not have permission to approve room inspections.',
        requestId,
      });
    }

    await ensureAuth();
    const nowIso = new Date().toISOString();

    const { error: roomErr } = await supabaseServiceRole
      .from('rooms')
      .update({
        housekeeping_status: 'Vacant Clean',
        room_status: 'Vacant',
        housekeeping_updated_at: nowIso,
        last_inspected_at: nowIso,
      })
      .eq('hotel_id', hotelId)
      .eq('room_no', roomNo);

    if (roomErr) throw roomErr;

    try {
      await supabaseServiceRole.from('housekeeping_inspections').insert({
        hotel_id: hotelId,
        room_no: roomNo,
        status: 'approved',
        inspected_by: req.user?.email || req.auth?.userId || 'Supervisor',
        inspected_at: nowIso,
      });

      await supabaseServiceRole.from('housekeeping_timeline').insert({
        hotel_id: hotelId,
        room_no: roomNo,
        action: 'Inspection Approved',
        old_status: 'Ready for Inspection',
        new_status: 'Vacant Clean',
        performed_by: req.user?.email || req.auth?.userId || 'Supervisor',
      });
    } catch { /* non-critical audit */ }

    return res.json({
      success: true,
      roomNo,
      status: 'Vacant Clean',
      message: `Room ${roomNo} approved and marked Vacant Clean / Ready.`,
      requestId,
    });
  } catch (err) {
    console.error(`[${requestId}] approve-inspection error:`, err);
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to approve room inspection.' });
  }
});

/**
 * POST /api/housekeeping/reject-inspection
 * Flow: Ready for Inspection → Cleaning In Progress (with rejection reason)
 */
router.post('/reject-inspection', async (req, res) => {
  const requestId = req.requestId || 'REQ-HK-REJECT';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { roomNo, reason } = req.body;
    if (!roomNo || !reason?.trim()) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Room number and rejection reason are required.' });
    }

    await ensureAuth();
    const nowIso = new Date().toISOString();

    const { error: roomErr } = await supabaseServiceRole
      .from('rooms')
      .update({
        housekeeping_status: 'Vacant Dirty',
        housekeeping_updated_at: nowIso,
        housekeeping_note: `Inspection rejected: ${reason.trim()}`,
      })
      .eq('hotel_id', hotelId)
      .eq('room_no', roomNo);

    if (roomErr) throw roomErr;

    try {
      await supabaseServiceRole.from('housekeeping_inspections').insert({
        hotel_id: hotelId,
        room_no: roomNo,
        status: 'rejected',
        rejection_reason: reason.trim(),
        inspected_by: req.user?.email || req.auth?.userId || 'Supervisor',
        inspected_at: nowIso,
      });

      await supabaseServiceRole
        .from('housekeeping_assignments')
        .update({ status: 'in_progress', cleaning_completed_at: null })
        .eq('hotel_id', hotelId)
        .eq('room_no', roomNo);

      await supabaseServiceRole.from('housekeeping_timeline').insert({
        hotel_id: hotelId,
        room_no: roomNo,
        action: 'Inspection Rejected',
        old_status: 'Ready for Inspection',
        new_status: 'Cleaning In Progress',
        performed_by: req.user?.email || req.auth?.userId || 'Supervisor',
        notes: reason.trim(),
        reason: reason.trim(),
      });
    } catch { /* non-critical audit */ }

    return res.json({
      success: true,
      roomNo,
      status: 'Cleaning In Progress',
      message: `Inspection rejected for Room ${roomNo}: ${reason.trim()}`,
      requestId,
    });
  } catch (err) {
    console.error(`[${requestId}] reject-inspection error:`, err);
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to reject inspection.' });
  }
});

/**
 * POST /api/housekeeping/priority
 * Sets cleaning priority (Urgent Arrival, Departure Room, Normal, VIP, etc.)
 */
router.post('/priority', async (req, res) => {
  const requestId = req.requestId || 'REQ-HK-PRIORITY';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { roomNo, priority } = req.body;
    if (!roomNo || !priority) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Room number and priority are required.' });
    }

    await ensureAuth();
    const { error } = await supabaseServiceRole
      .from('rooms')
      .update({
        cleaning_priority: priority,
        housekeeping_updated_at: new Date().toISOString(),
      })
      .eq('hotel_id', hotelId)
      .eq('room_no', roomNo);

    if (error) throw error;

    return res.json({
      success: true,
      roomNo,
      priority,
      message: `Priority for Room ${roomNo} updated to ${priority}.`,
      requestId,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to update priority.' });
  }
});

/**
 * POST /api/housekeeping/note
 * Adds or updates housekeeping notes for a room
 */
router.post('/note', async (req, res) => {
  const requestId = req.requestId || 'REQ-HK-NOTE';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { roomNo, note = '' } = req.body;
    if (!roomNo) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Room number is required.' });
    }

    await ensureAuth();
    const { error } = await supabaseServiceRole
      .from('rooms')
      .update({
        housekeeping_note: note.trim(),
        housekeeping_updated_at: new Date().toISOString(),
      })
      .eq('hotel_id', hotelId)
      .eq('room_no', roomNo);

    if (error) throw error;

    return res.json({
      success: true,
      roomNo,
      note: note.trim(),
      message: `Note updated for Room ${roomNo}.`,
      requestId,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to update note.' });
  }
});

/**
 * POST /api/housekeeping/maintenance
 * Reports a room maintenance issue
 */
router.post('/maintenance', async (req, res) => {
  const requestId = req.requestId || 'REQ-HK-MAINT-CREATE';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { roomNo, issueCategory = 'Other', description, priority = 'medium', affectsRoomSale = false } = req.body;

    if (!roomNo || !description?.trim()) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Room number and description are required.' });
    }

    await ensureAuth();

    const { data: issue, error } = await supabaseServiceRole
      .from('maintenance_issues')
      .insert({
        hotel_id: hotelId,
        room_no: roomNo,
        issue_category: issueCategory,
        description: description.trim(),
        priority,
        reported_by: req.user?.email || req.auth?.userId || 'Housekeeper',
        affects_room_sale: Boolean(affectsRoomSale),
        status: 'open',
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: `Maintenance issue reported for Room ${roomNo}.`,
      issue,
      requestId,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to report maintenance issue.' });
  }
});

/**
 * GET /api/housekeeping/maintenance
 * Lists maintenance issues for hotel
 */
router.get('/maintenance', async (req, res) => {
  const requestId = req.requestId || 'REQ-HK-MAINT-LIST';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    await ensureAuth();

    const { data: issues, error } = await supabaseServiceRole
      .from('maintenance_issues')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json({
      success: true,
      issues: issues || [],
      total: issues?.length || 0,
      requestId,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to update maintenance issue.' });
  }
});

/**
 * GET /api/housekeeping/staff
 * Lists housekeeping staff
 */
router.get('/staff', async (req, res) => {
  const requestId = req.requestId || 'REQ-HK-STAFF';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    await ensureAuth();

    const { data: staff, error } = await supabaseServiceRole
      .from('housekeeping_staff')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;

    return res.json({
      success: true,
      staff: staff || [],
      requestId,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch staff.' });
  }
});

/**
 * POST /api/housekeeping/assign
 * Assigns room to staff member
 */
router.post('/assign', async (req, res) => {
  const requestId = req.requestId || 'REQ-HK-ASSIGN';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { roomNo, staffId } = req.body;
    if (!roomNo) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Room number is required.' });
    }

    await ensureAuth();

    const { data: currentRoom } = await supabaseServiceRole
      .from('rooms')
      .select('housekeeping_status')
      .eq('hotel_id', hotelId)
      .eq('room_no', roomNo)
      .single();

    const { error } = await supabaseServiceRole
      .from('rooms')
      .update({
        assigned_staff_id: staffId || null,
        housekeeping_updated_at: new Date().toISOString(),
      })
      .eq('hotel_id', hotelId)
      .eq('room_no', roomNo);

    if (error) throw error;

    // Record pending assignment
    await supabaseServiceRole
      .from('housekeeping_assignments')
      .upsert({
        hotel_id: hotelId,
        room_no: roomNo,
        staff_id: staffId || null,
        status: 'pending',
      }, { onConflict: 'hotel_id,room_no' });

    return res.json({
      success: true,
      roomNo,
      staffId: staffId || null,
      status: 'Assigned',
      message: `Room ${roomNo} assigned.`,
      requestId,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to assign staff.' });
  }
});

export default router;
