import { supabase } from './supabase';
import { getCurrentHotelId } from './api';
import type { HousekeepingStatus, CleaningPriority, Room } from './types';
import type {
  HousekeepingStaff, HousekeepingTimelineEntry, HousekeepingAssignment,
  StayoverService, HousekeepingInspection, MaintenanceIssue, HousekeepingAuditEntry,
  StaffProductivity, ArrivalReadiness,
} from './types-housekeeping';

// ── Timeline + Audit (internal helper) ──

const addTimeline = async (roomNo: string, action: string, oldStatus: string, newStatus: string, performedBy = '', notes = '', reason = ''): Promise<void> => {
  try {
    await supabase.from('housekeeping_timeline').insert({
      hotel_id: getCurrentHotelId(),
      room_no: roomNo,
      action,
      old_status: oldStatus,
      new_status: newStatus,
      performed_by: performedBy,
      notes,
      reason,
    });
  } catch { /* non-critical */ }
};

const addAudit = async (roomNo: string, oldStatus: string, newStatus: string, userId = '', action = '', notes = '', reason = ''): Promise<void> => {
  try {
    await supabase.from('housekeeping_audit_log').insert({
      hotel_id: getCurrentHotelId(),
      room_no: roomNo,
      old_status: oldStatus,
      new_status: newStatus,
      user_id: userId,
      action,
      notes,
      reason,
    });
  } catch { /* non-critical */ }
};

// ── Core: update room housekeeping status with timeline + audit ──

export const setRoomHousekeepingStatus = async (params: {
  roomNo: string;
  status: HousekeepingStatus;
  performedBy?: string;
  notes?: string;
  reason?: string;
  audit?: boolean;
}): Promise<void> => {
  const hotelId = getCurrentHotelId();
  const { roomNo, status, performedBy = '', notes = '', reason = '', audit = false } = params;

  // Fetch old status
  const { data: room } = await supabase
    .from('rooms')
    .select('housekeeping_status')
    .eq('hotel_id', hotelId)
    .eq('room_no', roomNo)
    .maybeSingle();
  const oldStatus = (room as { housekeeping_status?: string })?.housekeeping_status ?? '';

  const updatePayload: Record<string, unknown> = {
    housekeeping_status: status,
    housekeeping_updated_at: new Date().toISOString(),
  };
  if (status === 'Vacant Clean') {
    updatePayload.last_cleaned_at = new Date().toISOString();
  }
  if (status === 'Inspected / Ready') {
    updatePayload.last_inspected_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('rooms')
    .update(updatePayload)
    .eq('hotel_id', hotelId)
    .eq('room_no', roomNo);
  if (error) throw error;

  await addTimeline(roomNo, `Status → ${status}`, oldStatus, status, performedBy, notes, reason);
  if (audit) {
    await addAudit(roomNo, oldStatus, status, performedBy, `Override → ${status}`, notes, reason);
  }
};

// ── Cleaning workflow ──

export const startCleaning = async (roomNo: string, staffId: string | null, performedBy = ''): Promise<void> => {
  const hotelId = getCurrentHotelId();
  await setRoomHousekeepingStatus({ roomNo, status: 'Cleaning In Progress', performedBy });

  try {
    // Update or create assignment
    const { data: existing } = await supabase
      .from('housekeeping_assignments')
      .select('id')
      .eq('hotel_id', hotelId)
      .eq('room_no', roomNo)
      .in('status', ['pending', 'in_progress'])
      .maybeSingle();

    if (existing) {
      await supabase
        .from('housekeeping_assignments')
        .update({ status: 'in_progress', cleaning_started_at: new Date().toISOString(), staff_id: staffId })
        .eq('id', (existing as { id: string }).id);
    } else {
      await supabase.from('housekeeping_assignments').insert({
        hotel_id: hotelId,
        room_no: roomNo,
        staff_id: staffId,
        status: 'in_progress',
        cleaning_started_at: new Date().toISOString(),
      });
    }

    if (staffId) {
      await supabase.from('rooms').update({ assigned_staff_id: staffId }).eq('hotel_id', hotelId).eq('room_no', roomNo);
    }
  } catch { /* non-critical assignment step */ }
};

export const completeCleaning = async (roomNo: string, performedBy = ''): Promise<void> => {
  const hotelId = getCurrentHotelId();
  await setRoomHousekeepingStatus({ roomNo, status: 'Ready for Inspection', performedBy });

  // Update assignment
  await supabase
    .from('housekeeping_assignments')
    .update({ status: 'completed', cleaning_completed_at: new Date().toISOString() })
    .eq('hotel_id', hotelId)
    .eq('room_no', roomNo)
    .in('status', ['pending', 'in_progress']);
};

export const approveInspection = async (roomNo: string, inspectedBy = ''): Promise<void> => {
  const hotelId = getCurrentHotelId();
  await setRoomHousekeepingStatus({ roomNo, status: 'Vacant Clean', performedBy: inspectedBy });

  // Create inspection record
  await supabase.from('housekeeping_inspections').insert({
    hotel_id: hotelId,
    room_no: roomNo,
    status: 'approved',
    inspected_by: inspectedBy,
    inspected_at: new Date().toISOString(),
  });
};

export const rejectInspection = async (roomNo: string, rejectionReason: string, inspectedBy = ''): Promise<void> => {
  if (!rejectionReason.trim()) throw new Error('Rejection reason is required.');
  const hotelId = getCurrentHotelId();

  await setRoomHousekeepingStatus({
    roomNo,
    status: 'Cleaning In Progress',
    performedBy: inspectedBy,
    notes: `Inspection rejected: ${rejectionReason}`,
    reason: rejectionReason,
    audit: true,
  });

  // Create inspection record
  await supabase.from('housekeeping_inspections').insert({
    hotel_id: hotelId,
    room_no: roomNo,
    status: 'rejected',
    rejection_reason: rejectionReason,
    inspected_by: inspectedBy,
    inspected_at: new Date().toISOString(),
  });

  // Reset assignment to in_progress
  await supabase
    .from('housekeeping_assignments')
    .update({ status: 'in_progress', cleaning_completed_at: null })
    .eq('hotel_id', hotelId)
    .eq('room_no', roomNo)
    .in('status', ['completed']);
};

// ── Quick status actions ──

export const markDirty = async (roomNo: string, performedBy = ''): Promise<void> => {
  await setRoomHousekeepingStatus({ roomNo, status: 'Vacant Dirty', performedBy });
};

export const markOutOfOrder = async (roomNo: string, reason: string, performedBy = ''): Promise<void> => {
  if (!reason.trim()) throw new Error('Reason is required for Out of Order.');
  await setRoomHousekeepingStatus({ roomNo, status: 'Out Of Order', performedBy, reason, audit: true });
};

export const blockRoom = async (roomNo: string, reason: string, performedBy = ''): Promise<void> => {
  await setRoomHousekeepingStatus({ roomNo, status: 'Blocked', performedBy, reason, audit: true });
};

export const overrideStatus = async (roomNo: string, status: HousekeepingStatus, reason: string, performedBy = ''): Promise<void> => {
  if (!reason.trim()) throw new Error('Reason is required for status override.');
  await setRoomHousekeepingStatus({ roomNo, status, performedBy, reason, audit: true });
};

// ── Priority + assignment ──

export const setRoomPriority = async (roomNo: string, priority: CleaningPriority): Promise<void> => {
  const { error } = await supabase
    .from('rooms')
    .update({ cleaning_priority: priority })
    .eq('hotel_id', getCurrentHotelId())
    .eq('room_no', roomNo);
  if (error) throw error;
};

export const assignStaffToRoom = async (roomNo: string, staffId: string | null): Promise<void> => {
  const hotelId = getCurrentHotelId();
  const { error } = await supabase
    .from('rooms')
    .update({ assigned_staff_id: staffId })
    .eq('hotel_id', hotelId)
    .eq('room_no', roomNo);
  if (error) throw error;

  // Also update assignment
  await supabase
    .from('housekeeping_assignments')
    .upsert({
      hotel_id: hotelId,
      room_no: roomNo,
      staff_id: staffId,
      status: 'pending',
    }, { onConflict: 'hotel_id,room_no' });
};

// ── Stayover service ──

export const recordStayoverService = async (params: {
  roomNo: string;
  entryId?: string;
  serviceType: StayoverService['service_type'];
  performedBy?: string;
  notes?: string;
}): Promise<void> => {
  const { error } = await supabase.from('housekeeping_stayover_services').insert({
    hotel_id: getCurrentHotelId(),
    room_no: params.roomNo,
    entry_id: params.entryId ?? null,
    service_type: params.serviceType,
    performed_by: params.performedBy ?? '',
    notes: params.notes ?? '',
  });
  if (error) throw error;

  await addTimeline(params.roomNo, `Stayover: ${params.serviceType}`, '', '', params.performedBy ?? '', params.notes ?? '');
};

export const getStayoverServices = async (roomNo: string): Promise<StayoverService[]> => {
  const { data, error } = await supabase
    .from('housekeeping_stayover_services')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('room_no', roomNo)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as StayoverService[]) ?? [];
};

// ── Maintenance issues ──

export const reportMaintenanceIssue = async (params: {
  roomNo: string;
  issueCategory: string;
  description: string;
  priority: MaintenanceIssue['priority'];
  reportedBy?: string;
  photoUrl?: string;
  affectsRoomSale?: boolean;
}): Promise<MaintenanceIssue> => {
  const hotelId = getCurrentHotelId();
  const { data, error } = await supabase.from('maintenance_issues').insert({
    hotel_id: hotelId,
    room_no: params.roomNo,
    issue_category: params.issueCategory,
    description: params.description,
    priority: params.priority,
    reported_by: params.reportedBy ?? '',
    photo_url: params.photoUrl ?? '',
    affects_room_sale: params.affectsRoomSale ?? false,
  }).select('*').single();
  if (error) throw error;

  // If affects room sale, mark room Out of Order
  if (params.affectsRoomSale) {
    await setRoomHousekeepingStatus({
      roomNo: params.roomNo,
      status: 'Out Of Order',
      performedBy: params.reportedBy ?? '',
      notes: `Maintenance: ${params.issueCategory} — ${params.description}`,
      reason: params.description,
      audit: true,
    });
  }

  await addTimeline(params.roomNo, `Maintenance issue: ${params.issueCategory}`, '', '', params.reportedBy ?? '', params.description);
  return data as MaintenanceIssue;
};

export const getMaintenanceIssues = async (roomNo?: string, status?: MaintenanceIssue['status']): Promise<MaintenanceIssue[]> => {
  let q = supabase
    .from('maintenance_issues')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('created_at', { ascending: false });
  if (roomNo) q = q.eq('room_no', roomNo);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data as MaintenanceIssue[]) ?? [];
};

export const updateMaintenanceIssueStatus = async (id: string, status: MaintenanceIssue['status']): Promise<void> => {
  const payload: Record<string, unknown> = { status };
  if (status === 'resolved' || status === 'closed') {
    payload.resolved_at = new Date().toISOString();
  }
  const { error } = await supabase.from('maintenance_issues').update(payload).eq('id', id);
  if (error) throw error;
};

// ── Staff CRUD ──

export const getHousekeepingStaff = async (): Promise<HousekeepingStaff[]> => {
  const { data, error } = await supabase
    .from('housekeeping_staff')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data as HousekeepingStaff[]) ?? [];
};

export const addHousekeepingStaff = async (name: string, phone: string, role: 'housekeeper' | 'supervisor' = 'housekeeper'): Promise<HousekeepingStaff> => {
  const { data, error } = await supabase.from('housekeeping_staff').insert({
    hotel_id: getCurrentHotelId(),
    name,
    phone,
    role,
  }).select('*').single();
  if (error) throw error;
  return data as HousekeepingStaff;
};

// ── Staff productivity ──

export const getStaffProductivity = async (): Promise<StaffProductivity[]> => {
  const hotelId = getCurrentHotelId();
  const staff = await getHousekeepingStaff();
  const { data: assignments } = await supabase
    .from('housekeeping_assignments')
    .select('*')
    .eq('hotel_id', hotelId);
  const allAssignments = (assignments as HousekeepingAssignment[]) ?? [];

  return staff.map((s) => {
    const roomAssignments = allAssignments.filter((a) => a.staff_id === s.id);
    const completed = roomAssignments.filter((a) => a.status === 'completed');
    const inProgress = roomAssignments.filter((a) => a.status === 'in_progress');
    const pending = roomAssignments.filter((a) => a.status === 'pending');

    // Calculate avg cleaning time from completed assignments
    let totalMinutes = 0;
    let count = 0;
    for (const a of completed) {
      if (a.cleaning_started_at && a.cleaning_completed_at) {
        const diff = new Date(a.cleaning_completed_at).getTime() - new Date(a.cleaning_started_at).getTime();
        totalMinutes += diff / 60000;
        count++;
      }
    }
    return {
      staff: s,
      assignedRooms: roomAssignments.length,
      completedRooms: completed.length,
      pendingRooms: pending.length,
      inProgressRooms: inProgress.length,
      avgCleaningMinutes: count > 0 ? totalMinutes / count : 0,
    };
  });
};

// ── Timeline ──

export const getRoomTimeline = async (roomNo: string): Promise<HousekeepingTimelineEntry[]> => {
  const { data, error } = await supabase
    .from('housekeeping_timeline')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('room_no', roomNo)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as HousekeepingTimelineEntry[]) ?? [];
};

// ── Audit log ──

export const getAuditLog = async (roomNo?: string): Promise<HousekeepingAuditEntry[]> => {
  let q = supabase
    .from('housekeeping_audit_log')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('created_at', { ascending: false })
    .limit(100);
  if (roomNo) q = q.eq('room_no', roomNo);
  const { data, error } = await q;
  if (error) throw error;
  return (data as HousekeepingAuditEntry[]) ?? [];
};

// ── Arrival readiness ──

export const getArrivalReadiness = async (date: string, rooms: Room[]): Promise<ArrivalReadiness> => {
  const hotelId = getCurrentHotelId();

  // Get today's arrivals from reservations
  const { data: arrivals } = await supabase
    .from('reservations')
    .select('room_no, guest_name, status')
    .eq('hotel_id', hotelId)
    .eq('check_in_date', date)
    .in('status', ['confirmed']);
  const arrivalList = (arrivals as { room_no: string; guest_name: string; status: string }[]) ?? [];

  // Also check room_chart entries with arrival = today and no checked_out_at
  const { data: entryArrivals } = await supabase
    .from('room_chart_entries')
    .select('room_no, guest_name')
    .eq('hotel_id', hotelId)
    .eq('arrival', date)
    .is('checked_out_at', null);
  const entryList = (entryArrivals as { room_no: string; guest_name: string }[]) ?? [];

  const allArrivalRooms = new Set<string>();
  for (const a of [...arrivalList, ...entryList]) {
    allArrivalRooms.add(a.room_no.trim().toLowerCase());
  }

  const warnings: string[] = [];
  let roomsReady = 0;
  let roomsDirty = 0;
  let cleaningInProgress = 0;
  let inspectionPending = 0;
  let outOfOrderConflicts = 0;

  for (const room of rooms) {
    if (!allArrivalRooms.has(room.room_no.trim().toLowerCase())) continue;
    const s = room.housekeeping_status;
    if (s === 'Vacant Clean' || s === 'Inspected / Ready') roomsReady++;
    else if (s === 'Vacant Dirty') roomsDirty++;
    else if (s === 'Cleaning In Progress') cleaningInProgress++;
    else if (s === 'Ready for Inspection') inspectionPending++;
    else if (s === 'Out Of Order' || s === 'Blocked') outOfOrderConflicts++;
  }

  if (roomsDirty > 0) warnings.push(`${roomsDirty} arrival room(s) are still dirty.`);
  if (inspectionPending > 0) warnings.push(`${inspectionPending} arrival room(s) pending inspection.`);
  if (outOfOrderConflicts > 0) warnings.push(`${outOfOrderConflicts} arrival room(s) are Out of Order or Blocked.`);

  return {
    totalArrivals: allArrivalRooms.size,
    roomsReady,
    roomsDirty,
    cleaningInProgress,
    inspectionPending,
    outOfOrderConflicts,
    warnings,
  };
};

// ── Room note ──

export const updateRoomNote = async (roomNo: string, note: string): Promise<void> => {
  const { error } = await supabase
    .from('rooms')
    .update({ housekeeping_note: note })
    .eq('hotel_id', getCurrentHotelId())
    .eq('room_no', roomNo);
  if (error) throw error;
};
