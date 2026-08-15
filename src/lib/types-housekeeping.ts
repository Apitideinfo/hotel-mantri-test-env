import type { HousekeepingStatus, CleaningPriority } from './types';

export interface HousekeepingStaff {
  id: string;
  hotel_id: string;
  name: string;
  phone: string;
  role: 'housekeeper' | 'supervisor';
  is_active: boolean;
  created_at: string;
}

export interface HousekeepingTimelineEntry {
  id: string;
  hotel_id: string;
  room_no: string;
  action: string;
  old_status: string;
  new_status: string;
  performed_by: string;
  notes: string;
  reason: string;
  created_at: string;
}

export interface HousekeepingAssignment {
  id: string;
  hotel_id: string;
  room_no: string;
  staff_id: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  priority: CleaningPriority;
  assigned_at: string;
  cleaning_started_at: string | null;
  cleaning_completed_at: string | null;
  notes: string;
}

export interface StayoverService {
  id: string;
  hotel_id: string;
  room_no: string;
  entry_id: string | null;
  service_type: 'Full Cleaning' | 'Quick Service' | 'Linen Change' | 'Towel Change' | 'Amenities Refill' | 'No Service' | 'Do Not Disturb';
  performed_by: string;
  notes: string;
  created_at: string;
}

export interface HousekeepingInspection {
  id: string;
  hotel_id: string;
  room_no: string;
  staff_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string;
  inspected_by: string;
  inspected_at: string | null;
  created_at: string;
}

export interface MaintenanceIssue {
  id: string;
  hotel_id: string;
  room_no: string;
  issue_category: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  reported_by: string;
  photo_url: string;
  status: 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
  affects_room_sale: boolean;
  created_at: string;
  resolved_at: string | null;
}

export interface HousekeepingAuditEntry {
  id: string;
  hotel_id: string;
  room_no: string;
  old_status: string;
  new_status: string;
  user_id: string;
  action: string;
  notes: string;
  reason: string;
  created_at: string;
}

export interface StaffProductivity {
  staff: HousekeepingStaff;
  assignedRooms: number;
  completedRooms: number;
  pendingRooms: number;
  inProgressRooms: number;
  avgCleaningMinutes: number;
}

export interface ArrivalReadiness {
  totalArrivals: number;
  roomsReady: number;
  roomsDirty: number;
  cleaningInProgress: number;
  inspectionPending: number;
  outOfOrderConflicts: number;
  warnings: string[];
}

export const HK_STATUSES: HousekeepingStatus[] = [
  'Vacant Clean', 'Vacant Dirty', 'Occupied', 'Occupied Clean', 'Occupied Service Due',
  'Cleaning In Progress', 'Ready for Inspection', 'Inspected / Ready', 'Out Of Order', 'Blocked',
];

export const CLEANING_PRIORITIES: CleaningPriority[] = [
  'Urgent Arrival', 'Departure Room', 'Stayover Service', 'Normal', 'VIP', 'Do Not Disturb', 'No Service Requested',
];

export const STAYOVER_SERVICE_TYPES: StayoverService['service_type'][] = [
  'Full Cleaning', 'Quick Service', 'Linen Change', 'Towel Change', 'Amenities Refill', 'No Service', 'Do Not Disturb',
];

export const MAINTENANCE_CATEGORIES = [
  'Plumbing', 'Electrical', 'AC / HVAC', 'Furniture', 'Appliance', 'Structural', 'Other',
];

export const ISSUE_STATUSES: MaintenanceIssue['status'][] = [
  'open', 'assigned', 'in_progress', 'resolved', 'closed',
];
