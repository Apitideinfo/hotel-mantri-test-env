import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Loader2, RefreshCw, BedDouble, Sparkles, AlertCircle, Wrench, Ban,
  Search, ClipboardCheck, X, ChevronDown, UserPlus, Clock, CheckCircle2,
  AlertTriangle, Play, CheckCheck, Send, FileText, Camera, History,
  Users, ShieldCheck, Eye, EyeOff, Filter, Smartphone,
} from 'lucide-react';
import type { Room, RoomCategory, HousekeepingStatus, FrontOfficeRole } from '@/lib/types';
import { groupRoomsByCategory, compareRoomNo } from '@/lib/types';
import { getRooms, getRoomCategories } from '@/lib/api';
import type {
  HousekeepingStaff, HousekeepingTimelineEntry, MaintenanceIssue,
  StaffProductivity, ArrivalReadiness, StayoverService,
} from '@/lib/types-housekeeping';
import {
  HK_STATUSES, CLEANING_PRIORITIES, STAYOVER_SERVICE_TYPES, MAINTENANCE_CATEGORIES,
} from '@/lib/types-housekeeping';
import { useAuth } from '@/lib/auth';
import {
  setRoomHousekeepingStatus, startCleaning, completeCleaning, approveInspection,
  rejectInspection, markDirty, markOutOfOrder, blockRoom, overrideStatus,
  setRoomPriority, assignStaffToRoom, recordStayoverService, getStayoverServices,
  reportMaintenanceIssue, getMaintenanceIssues, updateMaintenanceIssueStatus,
  getHousekeepingStaff, addHousekeepingStaff, getStaffProductivity,
  getRoomTimeline, getArrivalReadiness, updateRoomNote,
} from '@/lib/api-housekeeping';
import { CreateHousekeepingUserModal } from './CreateHousekeepingUserModal';

interface HousekeepingBoardProps {
  onBack: () => void;
  role: FrontOfficeRole | null;
  date?: string;
}

type GroupMode = 'category' | 'floor' | 'status';

const STATUS_CONFIG: Record<HousekeepingStatus, { color: string; bg: string; border: string; dot: string; icon: typeof BedDouble }> = {
  'Vacant Clean':          { color: 'text-emerald-700',  bg: 'bg-emerald-50',  border: 'border-emerald-200',  dot: 'bg-emerald-500',  icon: Sparkles },
  'Vacant Dirty':          { color: 'text-amber-700',    bg: 'bg-amber-50',    border: 'border-amber-200',    dot: 'bg-amber-500',    icon: BedDouble },
  'Occupied':              { color: 'text-brand-700',   bg: 'bg-brand-50',    border: 'border-brand-200',    dot: 'bg-brand-500',    icon: BedDouble },
  'Occupied Clean':        { color: 'text-teal-700',     bg: 'bg-teal-50',     border: 'border-teal-200',     dot: 'bg-teal-500',     icon: CheckCircle2 },
  'Occupied Service Due':  { color: 'text-orange-700',  bg: 'bg-orange-50',   border: 'border-orange-200',  dot: 'bg-orange-500',   icon: AlertCircle },
  'Cleaning In Progress': { color: 'text-sky-700',      bg: 'bg-sky-50',      border: 'border-sky-200',      dot: 'bg-sky-500',      icon: Play },
  'Ready for Inspection':  { color: 'text-violet-700',  bg: 'bg-violet-50',   border: 'border-violet-200',   dot: 'bg-violet-500',   icon: ClipboardCheck },
  'Inspected / Ready':     { color: 'text-indigo-700',  bg: 'bg-indigo-50',   border: 'border-indigo-200',   dot: 'bg-indigo-500',   icon: ShieldCheck },
  'Out Of Order':          { color: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200',      dot: 'bg-red-500',      icon: Wrench },
  'Blocked':               { color: 'text-slate-600',   bg: 'bg-slate-100',   border: 'border-slate-300',    dot: 'bg-slate-500',    icon: Ban },
};

const PRIORITY_COLORS: Record<string, string> = {
  'Urgent Arrival': 'bg-red-100 text-red-700',
  'Departure Room': 'bg-orange-100 text-orange-700',
  'Stayover Service': 'bg-sky-100 text-sky-700',
  'Normal': 'bg-slate-100 text-slate-600',
  'VIP': 'bg-brand-gold-100 text-brand-gold-700',
  'Do Not Disturb': 'bg-slate-200 text-slate-500',
  'No Service Requested': 'bg-slate-100 text-slate-400',
};

const fmtTime = (ts: string | null): string => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const HousekeepingBoard = ({ onBack, role, date }: HousekeepingBoardProps) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [categories, setCategories] = useState<RoomCategory[]>([]);
  const [staff, setStaff] = useState<HousekeepingStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<HousekeepingStatus | ''>('');
  const [groupMode, setGroupMode] = useState<GroupMode>('category');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [arrivalReadiness, setArrivalReadiness] = useState<ArrivalReadiness | null>(null);
  const [showStaffPanel, setShowStaffPanel] = useState(false);
  const [staffProductivity, setStaffProductivity] = useState<StaffProductivity[]>([]);
  const [showCreateStaffModal, setShowCreateStaffModal] = useState(false);
  const [staffCreatedToast, setStaffCreatedToast] = useState<string | null>(null);

  const { user, role: authRole, permissions } = useAuth();
  const isHousekeepingUser = authRole === 'housekeeping';
  const canApprove = role === 'admin' || role === 'super_admin' || role === 'manager' || authRole === 'owner' || authRole === 'manager' || authRole === 'hotel_admin' || Boolean(permissions?.canApproveInspection);
  const canReportMaint = Boolean(permissions?.canMaintenance !== false);

  const [boardTab, setBoardTab] = useState<'assigned' | 'all'>(isHousekeepingUser ? 'assigned' : 'all');
  const [quickMaintRoom, setQuickMaintRoom] = useState<Room | null>(null);
  const [quickNoteRoom, setQuickNoteRoom] = useState<Room | null>(null);
  const [quickMaintCategory, setQuickMaintCategory] = useState(MAINTENANCE_CATEGORIES[0]);
  const [quickMaintDesc, setQuickMaintDesc] = useState('');
  const [quickMaintPriority, setQuickMaintPriority] = useState<MaintenanceIssue['priority']>('medium');
  const [quickMaintAffectsSale, setQuickMaintAffectsSale] = useState(false);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [quickRejectRoom, setQuickRejectRoom] = useState<Room | null>(null);
  const [quickRejectReason, setQuickRejectReason] = useState('');

  const today = date ?? new Date().toISOString().slice(0, 10);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rms, cats, stf] = await Promise.all([getRooms(), getRoomCategories(), getHousekeepingStaff()]);
      setRooms(rms);
      setCategories(cats);
      setStaff(stf);

      // Arrival readiness
      try {
        const ar = await getArrivalReadiness(today, rms.filter((r) => r.is_active));
        setArrivalReadiness(ar);
      } catch { /* non-critical */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => { load(); }, [load]);

  const activeRooms = useMemo(() => rooms.filter((r) => r.is_active), [rooms]);

  // Match current staff profile
  const currentStaffMember = useMemo(() => {
    if (!user) return null;
    const meta = (user.user_metadata || {}) as Record<string, any>;
    const metaPhone = (meta.mobile || meta.phone || '').replace(/\D/g, '');
    const metaName = (meta.full_name || meta.name || user.email?.split('@')[0] || '').toLowerCase().trim();
    return staff.find((s) => {
      const sPhone = (s.phone || '').replace(/\D/g, '');
      const sName = (s.name || '').toLowerCase().trim();
      return (metaPhone && sPhone === metaPhone) || (metaName && sName === metaName);
    }) || null;
  }, [user, staff]);

  const assignedFloor = (user?.user_metadata as any)?.assigned_floor || '';

  const myAssignedRooms = useMemo(() => {
    const sorted = [...activeRooms].sort((a, b) => compareRoomNo(a.room_no, b.room_no));
    if (currentStaffMember) {
      const assigned = sorted.filter((r) => r.assigned_staff_id === currentStaffMember.id);
      if (assigned.length > 0) return assigned;
    }
    if (assignedFloor) {
      const onFloor = sorted.filter((r) => String(r.floor) === String(assignedFloor));
      if (onFloor.length > 0) return onFloor;
    }
    // Fallback: actionable cleaning rooms
    return sorted.filter((r) => ['Vacant Dirty', 'Cleaning In Progress', 'Ready for Inspection', 'Inspection'].includes(r.housekeeping_status));
  }, [activeRooms, currentStaffMember, assignedFloor]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of activeRooms) {
      counts[r.housekeeping_status] = (counts[r.housekeeping_status] ?? 0) + 1;
    }
    return counts;
  }, [activeRooms]);

  const filteredRooms = useMemo(() => {
    let result = activeRooms;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => r.room_no.toLowerCase().includes(q));
    }
    if (filterStatus) {
      result = result.filter((r) => r.housekeeping_status === filterStatus);
    }
    return result;
  }, [activeRooms, search, filterStatus]);

  const groupedRooms = useMemo(() => {
    const sorted = [...filteredRooms].sort((a, b) => compareRoomNo(a.room_no, b.room_no));

    if (groupMode === 'floor') {
      const groups: { key: string; label: string; rooms: Room[] }[] = [];
      const floorMap = new Map<string, Room[]>();
      for (const r of sorted) {
        const f = r.floor || 'Unknown';
        if (!floorMap.has(f)) floorMap.set(f, []);
        floorMap.get(f)!.push(r);
      }
      for (const [floor, rms] of floorMap) {
        groups.push({ key: floor, label: `Floor ${floor}`, rooms: rms });
      }
      return groups;
    }

    if (groupMode === 'status') {
      const groups: { key: string; label: string; rooms: Room[] }[] = [];
      const statusMap = new Map<string, Room[]>();
      for (const r of sorted) {
        const s = r.housekeeping_status;
        if (!statusMap.has(s)) statusMap.set(s, []);
        statusMap.get(s)!.push(r);
      }
      for (const [status, rms] of statusMap) {
        groups.push({ key: status, label: status, rooms: rms });
      }
      return groups;
    }

    // category
    const catGroups = groupRoomsByCategory(sorted, categories);
    return catGroups.map((g) => ({
      key: g.cat?.id ?? '__uncat',
      label: g.cat?.name ?? 'Uncategorized',
      rooms: g.rooms,
    }));
  }, [filteredRooms, categories, groupMode]);

  const handleQuickAction = async (action: string, roomNo: string, extra?: string) => {
    setSaving(true);
    setError(null);
    try {
      switch (action) {
        case 'startCleaning':
          await startCleaning(roomNo, null);
          break;
        case 'completeCleaning':
          await completeCleaning(roomNo);
          break;
        case 'approve':
          await approveInspection(roomNo);
          break;
        case 'markDirty':
          await markDirty(roomNo);
          break;
        case 'markOutOfOrder':
          if (!extra?.trim()) { setError('Reason required for Out of Order.'); return; }
          await markOutOfOrder(roomNo, extra);
          break;
        case 'blockRoom':
          if (!extra?.trim()) { setError('Reason required to block room.'); return; }
          await blockRoom(roomNo, extra);
          break;
        case 'override':
          if (!extra?.trim()) { setError('Reason required for override.'); return; }
          await overrideStatus(roomNo, 'Vacant Clean', extra);
          break;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  const SUMMARY_CARDS: { status: HousekeepingStatus; icon: typeof BedDouble }[] = [
    { status: 'Vacant Clean', icon: Sparkles },
    { status: 'Vacant Dirty', icon: BedDouble },
    { status: 'Occupied', icon: BedDouble },
    { status: 'Cleaning In Progress', icon: Play },
    { status: 'Ready for Inspection', icon: ClipboardCheck },
    { status: 'Inspected / Ready', icon: ShieldCheck },
    { status: 'Out Of Order', icon: Wrench },
    { status: 'Blocked', icon: Ban },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 flex-wrap shadow-2xs">
        {!isHousekeepingUser && (
          <button onClick={onBack} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer" title="Back">
            <RefreshCw className="w-4 h-4 rotate-180" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-sky-600" />
          <h1 className="text-lg font-black text-slate-900 tracking-tight">Housekeeping Workspace</h1>
        </div>
        <div className="flex-1" />
        {!isHousekeepingUser && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateStaffModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm rounded-xl transition cursor-pointer"
              title="Create Housekeeping User Account"
            >
              <UserPlus className="w-4 h-4" /> Create Staff Account
            </button>
            <button
              onClick={() => { setShowStaffPanel(true); loadStaffProductivity(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
            >
              <Users className="w-4 h-4" /> Staff Panel
            </button>
          </div>
        )}
        <button onClick={load} className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition cursor-pointer" title="Refresh Board">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Primary Tab Switcher */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setBoardTab('assigned')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-extrabold rounded-lg transition cursor-pointer ${
              boardTab === 'assigned'
                ? 'bg-white text-sky-700 shadow-xs ring-1 ring-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-600" />
            <span>MY ASSIGNED ROOMS</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${boardTab === 'assigned' ? 'bg-sky-100 text-sky-800' : 'bg-slate-200 text-slate-700'}`}>
              {myAssignedRooms.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setBoardTab('all')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-extrabold rounded-lg transition cursor-pointer ${
              boardTab === 'all'
                ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BedDouble className="w-3.5 h-3.5 text-slate-500" />
            <span>ALL HOTEL ROOMS</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${boardTab === 'all' ? 'bg-slate-200 text-slate-800' : 'bg-slate-200 text-slate-700'}`}>
              {activeRooms.length}
            </span>
          </button>
        </div>

        {isHousekeepingUser && (
          <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>Logged in as: <strong className="text-slate-800 font-bold">{user?.user_metadata?.full_name || user?.user_metadata?.username || 'Staff'}</strong></span>
            {user?.user_metadata?.assigned_floor && (
              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[11px]">
                Floor {user.user_metadata.assigned_floor}
              </span>
            )}
          </div>
        )}
      </div>

      {staffCreatedToast && (
        <div className="mx-4 my-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold rounded-xl p-3 flex items-center gap-2 animate-fade-in shadow-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{staffCreatedToast}</span>
          <button onClick={() => setStaffCreatedToast(null)} className="ml-auto cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {error && (
        <div className="mx-4 my-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 flex items-center gap-2 animate-fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* TAB 1: MY ASSIGNED ROOMS (Mobile-First Task Workspace) */}
      {boardTab === 'assigned' && (
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Quick Header Strip */}
          <div className="bg-gradient-to-r from-sky-900 via-blue-900 to-indigo-950 rounded-2xl p-4 text-white shadow-sm flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-bold text-sky-200 uppercase tracking-wider">Housekeeping Tasks</p>
              <h2 className="text-lg font-black text-white">
                {myAssignedRooms.length} {myAssignedRooms.length === 1 ? 'Room' : 'Rooms'} To Clean / Inspect
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2.5 py-1 rounded-lg font-bold">
                {myAssignedRooms.filter((r) => r.housekeeping_status === 'Vacant Dirty').length} Dirty
              </span>
              <span className="bg-sky-400/20 text-sky-300 border border-sky-400/30 px-2.5 py-1 rounded-lg font-bold">
                {myAssignedRooms.filter((r) => r.housekeeping_status === 'Cleaning In Progress').length} Cleaning
              </span>
              <span className="bg-violet-400/20 text-violet-300 border border-violet-400/30 px-2.5 py-1 rounded-lg font-bold">
                {myAssignedRooms.filter((r) => r.housekeeping_status === 'Ready for Inspection').length} Inspection
              </span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading assigned rooms…
            </div>
          ) : myAssignedRooms.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">All Rooms Cleaned!</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No rooms currently require cleaning for your assigned profile. You can view all property rooms in the "ALL HOTEL ROOMS" tab.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {myAssignedRooms.map((room) => {
                const config = STATUS_CONFIG[room.housekeeping_status];
                const Icon = config.icon;
                const priorityColor = PRIORITY_COLORS[room.cleaning_priority] ?? PRIORITY_COLORS['Normal'];
                const category = categories.find((c) => c.id === room.category_id)?.name ?? 'Room';

                return (
                  <div
                    key={room.id}
                    className={`bg-white rounded-2xl border-2 ${config.border} shadow-sm hover:shadow-md transition p-4 flex flex-col justify-between`}
                  >
                    <div>
                      {/* Top Room Row */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-black text-slate-900 tracking-tight">Room {room.room_no}</span>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                            {room.floor ? `Fl ${room.floor}` : ''} • {category}
                          </span>
                        </div>
                        <div className={`w-3 h-3 rounded-full ${config.dot}`} />
                      </div>

                      {/* Status + Priority */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold ${config.bg} ${config.color} border ${config.border}`}>
                          <Icon className="w-3.5 h-3.5" />
                          <span>{room.housekeeping_status}</span>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${priorityColor}`}>
                          {room.cleaning_priority}
                        </span>
                      </div>

                      {/* Housekeeping Note */}
                      {room.housekeeping_note && (
                        <div className="mb-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200/80 text-xs text-amber-900">
                          <p className="font-bold flex items-center gap-1"><FileText className="w-3.5 h-3.5 text-amber-700" /> Note:</p>
                          <p className="mt-0.5 italic">{room.housekeeping_note}</p>
                        </div>
                      )}

                      {room.last_cleaned_at && (
                        <p className="text-[11px] text-slate-400 mb-2">
                          Last Cleaned: {fmtTime(room.last_cleaned_at)}
                        </p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                      {room.housekeeping_status === 'Vacant Dirty' && (
                        <button
                          type="button"
                          onClick={() => handleQuickAction('startCleaning', room.room_no)}
                          disabled={saving}
                          className="w-full h-11 bg-sky-600 hover:bg-sky-700 active:scale-[0.98] text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-50 cursor-pointer"
                        >
                          <Play className="w-4 h-4 fill-current" /> Start Cleaning
                        </button>
                      )}

                      {room.housekeeping_status === 'Cleaning In Progress' && (
                        <button
                          type="button"
                          onClick={() => handleQuickAction('completeCleaning', room.room_no)}
                          disabled={saving}
                          className="w-full h-11 bg-violet-600 hover:bg-violet-700 active:scale-[0.98] text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-50 cursor-pointer"
                        >
                          <CheckCheck className="w-4 h-4" /> Mark Complete (Send for Inspection)
                        </button>
                      )}

                      {room.housekeeping_status === 'Ready for Inspection' && (
                        canApprove ? (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleQuickAction('approve', room.room_no)}
                              disabled={saving}
                              className="h-11 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition disabled:opacity-50 cursor-pointer"
                            >
                              <ShieldCheck className="w-4 h-4" /> Approve Clean
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setQuickRejectRoom(room);
                                setQuickRejectReason('');
                              }}
                              disabled={saving}
                              className="h-11 bg-rose-50 hover:bg-rose-100 active:scale-[0.98] text-rose-700 border border-rose-200 font-bold rounded-xl flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                            >
                              <X className="w-4 h-4" /> Reject
                            </button>
                          </div>
                        ) : (
                          <div className="h-11 bg-violet-50 border border-violet-200 text-violet-800 font-bold rounded-xl flex items-center justify-center gap-2 text-xs">
                            <Clock className="w-4 h-4 text-violet-600" /> Ready for Inspection (Awaiting Approval)
                          </div>
                        )
                      )}

                      {(room.housekeeping_status === 'Vacant Clean' || room.housekeeping_status === 'Inspected / Ready') && (
                        <div className="h-11 bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold rounded-xl flex items-center justify-center gap-2 text-xs">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Vacant Clean & Ready
                        </div>
                      )}

                      {room.housekeeping_status === 'Occupied' && (
                        <button
                          type="button"
                          onClick={() => setSelectedRoom(room)}
                          className="w-full h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition cursor-pointer"
                        >
                          <BedDouble className="w-4 h-4" /> Stayover Service Details
                        </button>
                      )}

                      {/* Secondary Actions */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        {canReportMaint && (
                          <button
                            type="button"
                            onClick={() => {
                              setQuickMaintRoom(room);
                              setQuickMaintDesc('');
                              setQuickMaintCategory(MAINTENANCE_CATEGORIES[0]);
                              setQuickMaintPriority('medium');
                              setQuickMaintAffectsSale(false);
                            }}
                            className="text-orange-600 hover:text-orange-700 font-bold flex items-center gap-1.5 p-1 rounded-lg hover:bg-orange-50 transition cursor-pointer"
                          >
                            <Wrench className="w-3.5 h-3.5" /> Report Issue
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setQuickNoteRoom(room);
                            setQuickNoteText(room.housekeeping_note || '');
                          }}
                          className="text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1.5 p-1 rounded-lg hover:bg-blue-50 transition cursor-pointer ml-auto"
                        >
                          <FileText className="w-3.5 h-3.5" /> {room.housekeeping_note ? 'Edit Note' : 'Add Note'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ALL HOTEL ROOMS (Overview for Supervisors & Staff) */}
      {boardTab === 'all' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Summary cards */}
          <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 shrink-0">
            {SUMMARY_CARDS.map(({ status, icon: Icon }) => {
              const config = STATUS_CONFIG[status];
              const count = statusCounts[status] ?? 0;
              return (
                <button
                  key={status}
                  onClick={() => setFilterStatus(filterStatus === status ? '' : status)}
                  className={`rounded-xl p-2.5 border text-left transition hover:shadow-sm cursor-pointer ${
                    filterStatus === status ? 'ring-2 ring-brand-500 ' : ''
                  }${config.border} ${config.bg}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${config.bg} ${config.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className={`text-lg font-bold tabular-nums ${config.color}`}>{count}</span>
                  </div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wide font-medium truncate">{status}</p>
                </button>
              );
            })}
          </div>

          {/* Arrival Readiness (Only visible if not housekeeping or if permitted) */}
          {!isHousekeepingUser && arrivalReadiness && arrivalReadiness.totalArrivals > 0 && (
            <div className="px-4 pb-2 shrink-0">
              <div className={`rounded-xl border p-3 ${
                arrivalReadiness.warnings.length > 0
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-emerald-50 border-emerald-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className={`w-4 h-4 ${arrivalReadiness.warnings.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`} />
                  <h3 className="text-sm font-bold text-brand-navy-800">Arrival Readiness — {today}</h3>
                </div>
                <div className="flex flex-wrap gap-4 text-xs">
                  <span className="text-slate-600"><b>{arrivalReadiness.totalArrivals}</b> arrivals</span>
                  <span className="text-emerald-600"><b>{arrivalReadiness.roomsReady}</b> ready</span>
                  <span className="text-amber-600"><b>{arrivalReadiness.roomsDirty}</b> dirty</span>
                  <span className="text-sky-600"><b>{arrivalReadiness.cleaningInProgress}</b> cleaning</span>
                  <span className="text-violet-600"><b>{arrivalReadiness.inspectionPending}</b> inspection</span>
                  <span className="text-red-600"><b>{arrivalReadiness.outOfOrderConflicts}</b> OOO/blocked</span>
                </div>
              </div>
            </div>
          )}

          {/* Search + filter + group */}
          <div className="px-4 pb-2 flex items-center gap-2 flex-wrap shrink-0">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Search room…" value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as HousekeepingStatus | '')}
              className="text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white">
              <option value="">All Statuses</option>
              {HK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              {(['category', 'floor', 'status'] as GroupMode[]).map((m) => (
                <button key={m} onClick={() => setGroupMode(m)}
                  className={`px-2.5 py-1 text-xs rounded-md transition capitalize cursor-pointer ${groupMode === m ? 'bg-white text-brand-navy-800 shadow-sm font-medium' : 'text-slate-500'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Room grid */}
          <div className="flex-1 overflow-auto px-4 pb-4">
            {loading ? (
              <div className="flex items-center justify-center h-64 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
              </div>
            ) : filteredRooms.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-slate-400 text-sm">No rooms match the filter.</div>
            ) : (
              <div className="space-y-4">
                {groupedRooms.map((group) => (
                  <div key={group.key}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-4 w-1 rounded-full bg-brand-500" />
                      <h2 className="text-sm font-bold text-brand-navy-700 uppercase tracking-wider">{group.label}</h2>
                      <span className="text-xs text-slate-400">— {group.rooms.length} rooms</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
                      {group.rooms.map((room) => (
                        <RoomCard
                          key={room.id}
                          room={room}
                          staff={staff}
                          role={role}
                          saving={saving}
                          onClick={() => setSelectedRoom(room)}
                          onQuickAction={handleQuickAction}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* QUICK REPORT MAINTENANCE MODAL */}
      {quickMaintRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-orange-600" />
                <h3 className="font-bold text-slate-900">Report Issue — Room {quickMaintRoom.room_no}</h3>
              </div>
              <button onClick={() => setQuickMaintRoom(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Issue Category</label>
                <select
                  value={quickMaintCategory}
                  onChange={(e) => setQuickMaintCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"
                >
                  {MAINTENANCE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Description</label>
                <textarea
                  value={quickMaintDesc}
                  onChange={(e) => setQuickMaintDesc(e.target.value)}
                  placeholder="Describe the issue (e.g. Tap leaking, AC not cooling)..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Priority</label>
                  <select
                    value={quickMaintPriority}
                    onChange={(e) => setQuickMaintPriority(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-700 font-bold mt-4">
                  <input
                    type="checkbox"
                    checked={quickMaintAffectsSale}
                    onChange={(e) => setQuickMaintAffectsSale(e.target.checked)}
                    className="rounded text-orange-600"
                  />
                  Affects Room Sale
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setQuickMaintRoom(null)}
                className="flex-1 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!quickMaintDesc.trim() || saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await reportMaintenanceIssue({
                      roomNo: quickMaintRoom.room_no,
                      issueCategory: quickMaintCategory,
                      description: quickMaintDesc.trim(),
                      priority: quickMaintPriority,
                      affectsRoomSale: quickMaintAffectsSale,
                    });
                    setQuickMaintRoom(null);
                    await load();
                  } catch (err: any) {
                    setError(err?.message || 'Failed to submit issue');
                  } finally {
                    setSaving(false);
                  }
                }}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl disabled:opacity-50"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK ADD NOTE MODAL */}
      {quickNoteRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900">Housekeeping Note — Room {quickNoteRoom.room_no}</h3>
              </div>
              <button onClick={() => setQuickNoteRoom(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Room Instructions / Note</label>
              <textarea
                value={quickNoteText}
                onChange={(e) => setQuickNoteText(e.target.value)}
                placeholder="e.g. Extra pillows requested, cleaning completed by Ramu..."
                rows={4}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none"
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setQuickNoteRoom(null)}
                className="flex-1 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await updateRoomNote(quickNoteRoom.room_no, quickNoteText.trim());
                    setQuickNoteRoom(null);
                    await load();
                  } catch (err: any) {
                    setError(err?.message || 'Failed to save note');
                  } finally {
                    setSaving(false);
                  }
                }}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK REJECT INSPECTION MODAL */}
      {quickRejectRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <X className="w-5 h-5 text-rose-600" />
                <h3 className="font-bold text-slate-900">Reject Inspection — Room {quickRejectRoom.room_no}</h3>
              </div>
              <button onClick={() => setQuickRejectRoom(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Reason for Rejection (Required)</label>
              <textarea
                value={quickRejectReason}
                onChange={(e) => setQuickRejectReason(e.target.value)}
                placeholder="What was not cleaned properly? (e.g. Bathroom floor wet, dust on table)..."
                rows={3}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none"
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setQuickRejectRoom(null)}
                className="flex-1 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!quickRejectReason.trim() || saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await rejectInspection(quickRejectRoom.room_no, quickRejectReason.trim());
                    setQuickRejectRoom(null);
                    await load();
                  } catch (err: any) {
                    setError(err?.message || 'Failed to reject inspection');
                  } finally {
                    setSaving(false);
                  }
                }}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl disabled:opacity-50"
              >
                Reject to In-Progress
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room detail bottom sheet */}
      {selectedRoom && (
        <RoomDetailSheet
          room={selectedRoom}
          staff={staff}
          role={role}
          onClose={() => setSelectedRoom(null)}
          onAction={async (action, extra) => {
            await handleQuickAction(action, selectedRoom.room_no, extra);
          }}
          onAssignStaff={async (staffId) => {
            setSaving(true);
            try {
              await assignStaffToRoom(selectedRoom.room_no, staffId);
              await load();
              setSelectedRoom((prev) => prev ? { ...prev, assigned_staff_id: staffId } : null);
            } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
            finally { setSaving(false); }
          }}
          onSetPriority={async (priority) => {
            setSaving(true);
            try {
              await setRoomPriority(selectedRoom.room_no, priority);
              await load();
            } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
            finally { setSaving(false); }
          }}
          onSaveNote={async (note) => {
            setSaving(true);
            try {
              await updateRoomNote(selectedRoom.room_no, note);
              await load();
            } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
            finally { setSaving(false); }
          }}
          onReportMaintenance={async (params) => {
            setSaving(true);
            try {
              await reportMaintenanceIssue(params);
              await load();
            } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
            finally { setSaving(false); }
          }}
          onRecordStayover={async (serviceType, notes) => {
            setSaving(true);
            try {
              await recordStayoverService({ roomNo: selectedRoom.room_no, serviceType, notes });
              setSaving(false);
            } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
            finally { setSaving(false); }
          }}
          onRejectInspection={async (reason) => {
            setSaving(true);
            try {
              await rejectInspection(selectedRoom.room_no, reason);
              await load();
            } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
            finally { setSaving(false); }
          }}
          savingState={saving}
        />
      )}

      {/* Staff panel */}
      {showStaffPanel && (
        <StaffPanel
          staff={staff}
          productivity={staffProductivity}
          onClose={() => setShowStaffPanel(false)}
          onCreateAccount={() => setShowCreateStaffModal(true)}
          onAddStaff={async (name, phone, r) => {
            setSaving(true);
            try { await addHousekeepingStaff(name, phone, r); await loadStaffProductivity(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
            finally { setSaving(false); }
          }}
          saving={saving}
        />
      )}

      {/* Create Housekeeping User Modal */}
      <CreateHousekeepingUserModal
        isOpen={showCreateStaffModal}
        onClose={() => setShowCreateStaffModal(false)}
        categories={categories}
        onSuccess={(newUser) => {
          setStaffCreatedToast(`Housekeeping user account created for "${newUser.name}"! Login ID: "${newUser.username}". They can now log in using this username.`);
          load();
          loadStaffProductivity();
          setTimeout(() => setStaffCreatedToast(null), 8000);
        }}
      />
    </div>
  );

  async function loadStaffProductivity() {
    try {
      const p = await getStaffProductivity();
      setStaffProductivity(p);
    } catch { /* non-critical */ }
  }
};

// ── Room Card ──
const RoomCard = ({ room, staff, role, saving, onClick, onQuickAction }: {
  room: Room; staff: HousekeepingStaff[]; role: FrontOfficeRole | null; saving: boolean;
  onClick: () => void; onQuickAction: (action: string, roomNo: string, extra?: string) => void;
}) => {
  const config = STATUS_CONFIG[room.housekeeping_status];
  const Icon = config.icon;
  const assignedStaff = staff.find((s) => s.id === room.assigned_staff_id);
  const priorityColor = PRIORITY_COLORS[room.cleaning_priority] ?? PRIORITY_COLORS['Normal'];

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border-2 ${config.border} ${config.bg} p-3 transition cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-base font-bold text-brand-navy-700">{room.room_no}</span>
        <div className={`w-2.5 h-2.5 rounded-full ${config.dot}`} />
      </div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
        <span className={`text-xs font-semibold ${config.color} truncate`}>{room.housekeeping_status}</span>
      </div>
      {room.last_guest_name && room.housekeeping_status === 'Occupied' && (
        <p className="text-[10px] text-slate-600 truncate mb-1">Guest: {room.last_guest_name}</p>
      )}
      {assignedStaff && (
        <p className="text-[10px] text-slate-500 truncate mb-1">Staff: {assignedStaff.name}</p>
      )}
      {room.last_cleaned_at && (
        <p className="text-[9px] text-slate-400 truncate">Cleaned: {fmtTime(room.last_cleaned_at)}</p>
      )}
      {room.housekeeping_note && (
        <p className="text-[10px] text-slate-500 truncate mt-1 italic">"{room.housekeeping_note}"</p>
      )}
      <div className="flex items-center gap-1 mt-2">
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${priorityColor}`}>
          {room.cleaning_priority}
        </span>
      </div>
      {/* Quick action button */}
      <div className="mt-2 pt-2 border-t border-slate-200/50">
        {room.housekeeping_status === 'Vacant Dirty' && (
          <button
            onClick={(e) => { e.stopPropagation(); onQuickAction('startCleaning', room.room_no); }}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1 py-1.5 text-xs font-semibold text-white bg-sky-500 hover:bg-sky-600 rounded-lg transition disabled:opacity-50"
          >
            <Play className="w-3 h-3" /> Start Cleaning
          </button>
        )}
        {room.housekeeping_status === 'Cleaning In Progress' && (
          <button
            onClick={(e) => { e.stopPropagation(); onQuickAction('completeCleaning', room.room_no); }}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1 py-1.5 text-xs font-semibold text-white bg-violet-500 hover:bg-violet-600 rounded-lg transition disabled:opacity-50"
          >
            <CheckCheck className="w-3 h-3" /> Complete
          </button>
        )}
        {room.housekeeping_status === 'Ready for Inspection' && (role === 'admin' || role === 'super_admin' || role === 'manager') && (
          <button
            onClick={(e) => { e.stopPropagation(); onQuickAction('approve', room.room_no); }}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1 py-1.5 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition disabled:opacity-50"
          >
            <ShieldCheck className="w-3 h-3" /> Approve
          </button>
        )}
        {room.housekeeping_status === 'Occupied' && (
          <span className="text-[10px] text-slate-400 text-center block">Tap for stayover service</span>
        )}
      </div>
    </div>
  );
};

// ── Room Detail Bottom Sheet ──
const RoomDetailSheet = ({ room, staff, role, onClose, onAction, onAssignStaff, onSetPriority, onSaveNote, onReportMaintenance, onRecordStayover, onRejectInspection, savingState }: {
  room: Room; staff: HousekeepingStaff[]; role: FrontOfficeRole | null; onClose: () => void;
  onAction: (action: string, extra?: string) => void;
  onAssignStaff: (staffId: string | null) => void;
  onSetPriority: (priority: typeof CLEANING_PRIORITIES[number]) => void;
  onSaveNote: (note: string) => void;
  onReportMaintenance: (params: { roomNo: string; issueCategory: string; description: string; priority: MaintenanceIssue['priority']; affectsRoomSale: boolean }) => void;
  onRecordStayover: (serviceType: StayoverService['service_type'], notes: string) => void;
  onRejectInspection: (reason: string) => void;
  savingState: boolean;
}) => {
  const [tab, setTab] = useState<'actions' | 'timeline' | 'maintenance'>('actions');
  const [timeline, setTimeline] = useState<HousekeepingTimelineEntry[]>([]);
  const [stayoverHistory, setStayoverHistory] = useState<StayoverService[]>([]);
  const [maintenanceIssues, setMaintenanceIssues] = useState<MaintenanceIssue[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [noteText, setNoteText] = useState(room.housekeeping_note);
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showOooBox, setShowOooBox] = useState(false);
  const [oooReason, setOooReason] = useState('');
  const [showBlockBox, setShowBlockBox] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [maintCategory, setMaintCategory] = useState(MAINTENANCE_CATEGORIES[0]);
  const [maintDesc, setMaintDesc] = useState('');
  const [maintPriority, setMaintPriority] = useState<MaintenanceIssue['priority']>('medium');
  const [maintAffectsSale, setMaintAffectsSale] = useState(false);
  const [stayoverType, setStayoverType] = useState<StayoverService['service_type']>('Full Cleaning');
  const [stayoverNotes, setStayoverNotes] = useState('');

  useEffect(() => {
    if (tab === 'timeline') loadTimeline();
    if (tab === 'maintenance') loadMaintenance();
  }, [tab]);

  const loadTimeline = async () => {
    setLoadingTimeline(true);
    try {
      const [tl, sv] = await Promise.all([getRoomTimeline(room.room_no), getStayoverServices(room.room_no)]);
      setTimeline(tl);
      setStayoverHistory(sv);
    } catch { /* non-critical */ }
    finally { setLoadingTimeline(false); }
  };

  const loadMaintenance = async () => {
    try {
      const issues = await getMaintenanceIssues(room.room_no);
      setMaintenanceIssues(issues);
    } catch { /* non-critical */ }
  };

  const config = STATUS_CONFIG[room.housekeeping_status];
  const Icon = config.icon;
  const assignedStaff = staff.find((s) => s.id === room.assigned_staff_id);
  const canOverride = role === 'admin' || role === 'super_admin';
  const canInspect = role === 'admin' || role === 'super_admin' || role === 'manager';

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 animate-fade-in" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col animate-slide-up">
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className={`px-4 py-3 border-b border-slate-200 ${config.bg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${config.bg} ${config.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-brand-navy-800">Room {room.room_no}</h2>
                <p className={`text-xs font-semibold ${config.color}`}>{room.housekeeping_status}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/50 rounded-lg text-slate-500">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-4">
          {(['actions', 'timeline', 'maintenance'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition border-b-2 ${tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* ACTIONS TAB */}
          {tab === 'actions' && (
            <>
              {/* Room info */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {room.last_guest_name && <InfoCell label="Guest" value={room.last_guest_name} />}
                {room.last_departure_time && <InfoCell label="Departure" value={room.last_departure_time} />}
                {room.last_cleaned_at && <InfoCell label="Last Cleaned" value={fmtTime(room.last_cleaned_at)} />}
                {room.last_inspected_at && <InfoCell label="Last Inspected" value={fmtTime(room.last_inspected_at)} />}
              </div>

              {/* Priority */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Cleaning Priority</label>
                <select
                  value={room.cleaning_priority}
                  onChange={(e) => onSetPriority(e.target.value as typeof CLEANING_PRIORITIES[number])}
                  disabled={savingState}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {CLEANING_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* Staff assignment */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Assigned Staff</label>
                <select
                  value={room.assigned_staff_id ?? ''}
                  onChange={(e) => onAssignStaff(e.target.value || null)}
                  disabled={savingState}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="">Unassigned</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                </select>
              </div>

              {/* Note */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Special Notes</label>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={2}
                  placeholder="Add a note…"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none"
                />
                <button
                  onClick={() => onSaveNote(noteText)}
                  disabled={savingState}
                  className="mt-1 px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50"
                >
                  Save Note
                </button>
              </div>

              {/* Quick actions */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <ActionBtn icon={Play} label="Start Cleaning" color="bg-sky-500" onClick={() => onAction('startCleaning')} disabled={savingState} />
                <ActionBtn icon={CheckCheck} label="Complete Cleaning" color="bg-violet-500" onClick={() => onAction('completeCleaning')} disabled={savingState} />
                {canInspect && <ActionBtn icon={ShieldCheck} label="Approve Clean" color="bg-emerald-500" onClick={() => onAction('approve')} disabled={savingState} />}
                {canInspect && room.housekeeping_status === 'Ready for Inspection' && (
                  <ActionBtn icon={X} label="Reject Inspection" color="bg-red-500" onClick={() => setShowRejectBox(true)} disabled={savingState} />
                )}
                <ActionBtn icon={BedDouble} label="Mark Dirty" color="bg-amber-500" onClick={() => onAction('markDirty')} disabled={savingState} />
                <ActionBtn icon={Wrench} label="Out of Order" color="bg-red-600" onClick={() => setShowOooBox(true)} disabled={savingState} />
                <ActionBtn icon={Ban} label="Block Room" color="bg-slate-600" onClick={() => setShowBlockBox(true)} disabled={savingState} />
                <ActionBtn icon={AlertCircle} label="Report Issue" color="bg-orange-500" onClick={() => setShowMaintenanceForm(true)} disabled={savingState} />
              </div>

              {/* Stayover service (for occupied rooms) */}
              {(room.housekeeping_status === 'Occupied' || room.housekeeping_status === 'Occupied Clean' || room.housekeeping_status === 'Occupied Service Due') && (
                <div className="pt-2 border-t border-slate-200">
                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Stayover Service</label>
                  <div className="flex gap-2">
                    <select
                      value={stayoverType}
                      onChange={(e) => setStayoverType(e.target.value as StayoverService['service_type'])}
                      className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                    >
                      {STAYOVER_SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button
                      onClick={() => onRecordStayover(stayoverType, stayoverNotes)}
                      disabled={savingState}
                      className="px-3 py-2 text-sm font-semibold text-white bg-teal-500 hover:bg-teal-600 rounded-lg disabled:opacity-50"
                    >
                      Record
                    </button>
                  </div>
                  <input
                    type="text"
                    value={stayoverNotes}
                    onChange={(e) => setStayoverNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="mt-1.5 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              )}

              {/* Reject reason box */}
              {showRejectBox && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-bold text-red-700">Rejection Reason (required)</p>
                  <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2}
                    placeholder="Why is this being rejected?" className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg resize-none" />
                  <div className="flex gap-2">
                    <button onClick={() => { onRejectInspection(rejectReason); setShowRejectBox(false); setRejectReason(''); }}
                      disabled={!rejectReason.trim() || savingState}
                      className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg disabled:opacity-50">
                      Confirm Reject
                    </button>
                    <button onClick={() => { setShowRejectBox(false); setRejectReason(''); }}
                      className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
                  </div>
                </div>
              )}

              {/* OOO reason box */}
              {showOooBox && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-bold text-red-700">Out of Order Reason (required)</p>
                  <textarea value={oooReason} onChange={(e) => setOooReason(e.target.value)} rows={2}
                    placeholder="What is wrong with the room?" className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg resize-none" />
                  <div className="flex gap-2">
                    <button onClick={() => { onAction('markOutOfOrder', oooReason); setShowOooBox(false); setOooReason(''); }}
                      disabled={!oooReason.trim() || savingState}
                      className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg disabled:opacity-50">
                      Mark Out of Order
                    </button>
                    <button onClick={() => { setShowOooBox(false); setOooReason(''); }}
                      className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
                  </div>
                </div>
              )}

              {/* Block reason box */}
              {showBlockBox && (
                <div className="bg-slate-100 border border-slate-300 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-bold text-slate-700">Block Reason (required)</p>
                  <textarea value={blockReason} onChange={(e) => setBlockReason(e.target.value)} rows={2}
                    placeholder="Why is this room blocked?" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-none" />
                  <div className="flex gap-2">
                    <button onClick={() => { onAction('blockRoom', blockReason); setShowBlockBox(false); setBlockReason(''); }}
                      disabled={!blockReason.trim() || savingState}
                      className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-slate-700 rounded-lg disabled:opacity-50">
                      Block Room
                    </button>
                    <button onClick={() => { setShowBlockBox(false); setBlockReason(''); }}
                      className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
                  </div>
                </div>
              )}

              {/* Maintenance form */}
              {showMaintenanceForm && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-bold text-orange-700">Report Maintenance Issue</p>
                  <select value={maintCategory} onChange={(e) => setMaintCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-orange-200 rounded-lg bg-white">
                    {MAINTENANCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <textarea value={maintDesc} onChange={(e) => setMaintDesc(e.target.value)} rows={2}
                    placeholder="Describe the issue…" className="w-full px-3 py-2 text-sm border border-orange-200 rounded-lg resize-none" />
                  <div className="flex gap-2">
                    <select value={maintPriority} onChange={(e) => setMaintPriority(e.target.value as MaintenanceIssue['priority'])}
                      className="flex-1 px-3 py-2 text-sm border border-orange-200 rounded-lg bg-white">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input type="checkbox" checked={maintAffectsSale} onChange={(e) => setMaintAffectsSale(e.target.checked)} />
                      Affects sale (OOO)
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        onReportMaintenance({
                          roomNo: room.room_no,
                          issueCategory: maintCategory,
                          description: maintDesc,
                          priority: maintPriority,
                          affectsRoomSale: maintAffectsSale,
                        });
                        setShowMaintenanceForm(false);
                        setMaintDesc(''); setMaintAffectsSale(false);
                      }}
                      disabled={!maintDesc.trim() || savingState}
                      className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-orange-600 rounded-lg disabled:opacity-50">
                      Submit Report
                    </button>
                    <button onClick={() => setShowMaintenanceForm(false)}
                      className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* TIMELINE TAB */}
          {tab === 'timeline' && (
            <div className="space-y-2">
              {loadingTimeline ? (
                <div className="flex items-center justify-center py-8 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
                </div>
              ) : timeline.length === 0 && stayoverHistory.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No timeline events yet.</p>
              ) : (
                <>
                  {timeline.map((e) => (
                    <div key={e.id} className="flex gap-2.5 pb-2 border-b border-slate-100 last:border-0">
                      <div className="w-7 h-7 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                        <History className="w-3.5 h-3.5 text-brand-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800">{e.action}</p>
                        <p className="text-[10px] text-slate-400">
                          {e.performed_by && `By ${e.performed_by} · `}{fmtTime(e.created_at)}
                        </p>
                        {e.notes && <p className="text-[10px] text-slate-500 mt-0.5">{e.notes}</p>}
                        {e.reason && <p className="text-[10px] text-red-500 mt-0.5">Reason: {e.reason}</p>}
                      </div>
                    </div>
                  ))}
                  {stayoverHistory.map((s) => (
                    <div key={s.id} className="flex gap-2.5 pb-2 border-b border-slate-100 last:border-0">
                      <div className="w-7 h-7 rounded-full bg-teal-50 flex items-center justify-center shrink-0">
                        <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800">Stayover: {s.service_type}</p>
                        <p className="text-[10px] text-slate-400">
                          {s.performed_by && `By ${s.performed_by} · `}{fmtTime(s.created_at)}
                        </p>
                        {s.notes && <p className="text-[10px] text-slate-500 mt-0.5">{s.notes}</p>}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* MAINTENANCE TAB */}
          {tab === 'maintenance' && (
            <div className="space-y-2">
              <button
                onClick={() => setShowMaintenanceForm(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg"
              >
                <AlertCircle className="w-4 h-4" /> Report New Issue
              </button>
              {maintenanceIssues.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No maintenance issues reported.</p>
              ) : (
                maintenanceIssues.map((issue) => (
                  <div key={issue.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">{issue.issue_category}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        issue.status === 'open' ? 'bg-red-100 text-red-700' :
                        issue.status === 'resolved' || issue.status === 'closed' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>{issue.status}</span>
                    </div>
                    <p className="text-xs text-slate-600">{issue.description}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span>Priority: {issue.priority}</span>
                      {issue.affects_room_sale && <span className="text-red-500 font-medium">Affects sale</span>}
                      <span>{fmtTime(issue.created_at)}</span>
                    </div>
                    {issue.status !== 'resolved' && issue.status !== 'closed' && (
                      <button
                        onClick={async () => { await updateMaintenanceIssueStatus(issue.id, 'resolved'); await loadMaintenance(); }}
                        className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                      >
                        Mark Resolved
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ── Staff Panel ──
const StaffPanel = ({ staff, productivity, onClose, onAddStaff, onCreateAccount, saving }: {
  staff: HousekeepingStaff[];
  productivity: StaffProductivity[];
  onClose: () => void;
  onAddStaff: (name: string, phone: string, role: 'housekeeper' | 'supervisor') => void;
  onCreateAccount?: () => void;
  saving: boolean;
}) => {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sRole, setSRole] = useState<'housekeeper' | 'supervisor'>('housekeeper');

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 animate-fade-in" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col animate-slide-up">
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-bold text-brand-navy-800">Housekeeping Staff</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {onCreateAccount && (
            <button
              onClick={() => { onClose(); onCreateAccount(); }}
              className="w-full flex items-center justify-center gap-2 py-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition cursor-pointer"
            >
              <UserPlus className="w-4 h-4" /> Create Staff Login Account (Username & Password)
            </button>
          )}
          {showAdd ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <input type="text" placeholder="Staff name" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <input type="text" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <select value={sRole} onChange={(e) => setSRole(e.target.value as 'housekeeper' | 'supervisor')}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="housekeeper">Housekeeper</option>
                <option value="supervisor">Supervisor</option>
              </select>
              <div className="flex gap-2">
                <button onClick={() => { onAddStaff(name, phone, sRole); setShowAdd(false); setName(''); setPhone(''); }}
                  disabled={!name.trim() || saving}
                  className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg disabled:opacity-50">
                  Add Staff
                </button>
                <button onClick={() => setShowAdd(false)} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAdd(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50">
              <UserPlus className="w-4 h-4" /> Add Staff Member
            </button>
          )}

          {productivity.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No staff added yet.</p>
          ) : (
            productivity.map((p) => (
              <div key={p.staff.id} className="bg-white border border-slate-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{p.staff.name}</p>
                    <p className="text-[10px] text-slate-400 capitalize">{p.staff.role}{p.staff.phone && ` · ${p.staff.phone}`}</p>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center">
                    <Users className="w-4 h-4 text-brand-600" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <Stat label="Assigned" value={p.assignedRooms} color="text-slate-700" />
                  <Stat label="Pending" value={p.pendingRooms} color="text-amber-600" />
                  <Stat label="In Progress" value={p.inProgressRooms} color="text-sky-600" />
                  <Stat label="Done" value={p.completedRooms} color="text-emerald-600" />
                </div>
                {p.avgCleaningMinutes > 0 && (
                  <p className="text-[10px] text-slate-400 mt-2 text-center">
                    Avg cleaning time: {Math.round(p.avgCleaningMinutes)} min
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};

// ── Small helpers ──
const InfoCell = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
    <p className="text-[9px] text-slate-400 uppercase tracking-wide font-medium">{label}</p>
    <p className="text-xs font-semibold text-slate-700 truncate">{value}</p>
  </div>
);

const ActionBtn = ({ icon: Icon, label, color, onClick, disabled }: {
  icon: typeof BedDouble; label: string; color: string; onClick: () => void; disabled: boolean;
}) => (
  <button onClick={onClick} disabled={disabled}
    className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-white ${color} hover:opacity-90 rounded-lg transition disabled:opacity-50 active:scale-[0.98]`}>
    <Icon className="w-3.5 h-3.5" /> {label}
  </button>
);

const Stat = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div>
    <p className={`text-base font-bold tabular-nums ${color}`}>{value}</p>
    <p className="text-[9px] text-slate-400 uppercase tracking-wide">{label}</p>
  </div>
);
