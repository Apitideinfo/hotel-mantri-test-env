import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ArrowLeft, Plus, Trash2, Save, BedDouble, X, Check,
  UtensilsCrossed, Receipt, TrendingUp, Calculator,
  Clock, Wallet, Building2, AlertCircle, IndianRupee,
  Lock, Unlock, Bed, Users, DollarSign, CreditCard, Smartphone,
  Banknote, ChevronRight, CheckCircle2, AlertTriangle, Loader2,
} from 'lucide-react';
import type {
  RoomChartEntry, RoomChartEntryInput, HotelSettings,
  CompanySource, SourceCategory, PayMode, MealPlan, GstMode, GstType, GstSlab,
  RoomCategory, Room, HotSeason,
} from '@/lib/types';
import { MEAL_PLANS, GST_SLABS, GST_MODES, GST_TYPES, SPLIT_PAYMENT_KEYS, SPLIT_PAY_MODE_KEYS, SPLIT_PAYMENT_LABELS, groupRoomsByCategory, compareRoomNo } from '@/lib/types';
import type { ExpenseEntry, ExpenseEntryInput, RevenueEntry, RevenueEntryInput, ExpenseHead, RevenueHead, RevenuePaymentMode } from '@/lib/types-finance';
import { EXPENSE_HEADS, REVENUE_HEADS } from '@/lib/types-finance';
import {
  getSettings, getRoomChart, saveRoomChartRow, deleteRoomChartRow,
  getCompanySources, classifyCompany, getRoomCategories,
  getDerivedReport, getRooms,
  getDayCloseRecord, closeDay, reopenDay, getDayCloseAuditLog,
} from '@/lib/api';
import { checkRoomAvailability } from '@/lib/api-reservations';
import {
  getExpenseEntriesForDate, saveExpenseEntry, deleteExpenseEntry,
  getRevenueEntriesForDate, saveRevenueEntry, deleteRevenueEntry,
} from '@/lib/api-finance';
import { getHotSeasons, isHotSeasonDate } from '@/lib/api-calendar';
import { aggregateRoomChart, fmtMoney, fmtInt, calcOcc, calcClosingRooms, calcGst, calcGstFull, toNum } from '@/lib/calc';
import { brand } from '@/lib/theme';
import type { DerivedReport, DayCloseRecord, DayCloseAuditLog } from '@/lib/types';

interface RoomChartProps {
  date: string;
  onBack: () => void;
  onSaved: () => void;
}

type Tab = 'rooms' | 'expenses' | 'review';
type RoomStatus = 'occupied' | 'vacant' | 'complimentary' | 'house_use' | 'day_use' | 'ooo';
type RoomSelectionRow = { roomNo: string; category: string; rate: number };
const UNAVAILABLE_HOUSEKEEPING = new Set(['Occupied', 'Occupied Clean', 'Occupied Service Due', 'Out Of Order', 'OutOfOrder', 'Blocked']);

const MEAL_LABEL: Record<MealPlan, string> = { EP: 'EP', CP: 'CP', MAP: 'MAP', AP: 'AP' };
const MEAL_COLOR: Record<MealPlan, string> = {
  EP: 'bg-slate-100 text-slate-600',
  CP: 'bg-sky-100 text-sky-700',
  MAP: 'bg-amber-100 text-amber-700',
  AP: 'bg-emerald-100 text-emerald-700',
};

const STATUS_CONFIG: Record<RoomStatus, { label: string; dot: string; border: string; bg: string; text: string; accent: string }> = {
  occupied:      { label: 'Occupied',      dot: 'bg-emerald-500', border: 'border-emerald-200', bg: 'bg-emerald-50',  text: 'text-emerald-700', accent: 'from-emerald-500 to-emerald-600' },
  vacant:        { label: 'Vacant',        dot: 'bg-slate-300',   border: 'border-slate-200',   bg: 'bg-white',         text: 'text-slate-500', accent: 'from-slate-300 to-slate-400' },
  complimentary: { label: 'Complimentary', dot: 'bg-amber-400',   border: 'border-amber-200',   bg: 'bg-amber-50',       text: 'text-amber-700', accent: 'from-amber-400 to-amber-500' },
  house_use:     { label: 'House Use',     dot: 'bg-sky-400',     border: 'border-sky-200',     bg: 'bg-sky-50',         text: 'text-sky-700', accent: 'from-sky-400 to-sky-500' },
  day_use:       { label: 'Day Use',       dot: 'bg-orange-400',  border: 'border-orange-200', bg: 'bg-orange-50',      text: 'text-orange-700', accent: 'from-orange-400 to-orange-500' },
  ooo:           { label: 'Out of Order',  dot: 'bg-red-400',     border: 'border-red-200',     bg: 'bg-red-50',         text: 'text-red-700', accent: 'from-red-400 to-red-500' },
};

const entryStatus = (e: RoomChartEntry): RoomStatus => {
  if (e.is_complimentary) return 'complimentary';
  return 'occupied';
};

const emptyRow = (date: string, settings?: HotelSettings | null): RoomChartEntryInput => {
  const isGstRegistered = settings?.gst_registered ?? false;
  const defaultGstType: GstType = isGstRegistered ? ((settings?.gst_mode as GstType) ?? 'Exclusive') : 'No Scope';
  const defaultSlab: GstSlab = isGstRegistered ? (settings?.default_gst_slab ?? 0) : 0;
  return {
    report_date: date,
    room_no: '',
    guest_name: '',
    arrival: date,
    departure: date,
    nights: 1,
    room_rate: 0,
    total: 0,
    company: '',
    source_category: 'Direct/Walking',
    pay_mode: 'Cash',
    description: '',
    is_complimentary: false,
    meal_plan: 'EP',
    room_category: 'Standard',
    gst_mode: (defaultGstType === 'No Scope' ? 'Exclusive' : defaultGstType) as GstMode,
    gst_type: defaultGstType,
    gst_slab: defaultSlab,
    gst_amount: 0,
    taxable_amount: 0,
    invoice_total: 0,
    revenue_category: 'Room Revenue',
    remarks: '',
    created_by: '',
    business_date: date,
    pay_cash: 0,
    pay_upi: 0,
    pay_card: 0,
    pay_bank: 0,
    pay_advance: 0,
    pay_balance: 0,
    id_proof_type: 'None',
    id_proof_number: '',
    id_proof_verified: false,
    arrival_time: '',
    checkout_time: '',
    checked_in_at: null,
    checked_out_at: null,
    reservation_id: null,
  };
};

const emptyExpense = (date: string): ExpenseEntryInput => ({
  entry_date: date,
  category_id: null,
  category_name: 'Housekeeping',
  amount: 0,
  payment_mode: 'Cash',
  description: '',
  bill_no: '',
  is_paid: true,
  paid_date: date,
  notes: '',
  created_by: null,
});

const emptyRevenue = (date: string): RevenueEntryInput => ({
  entry_date: date,
  revenue_head: 'Kitchen',
  description: '',
  amount: 0,
  payment_mode: 'Cash',
  notes: '',
});

export const RoomChart = ({ date: initialDate, onBack, onSaved }: RoomChartProps) => {
  const [tab, setTab] = useState<Tab>('rooms');
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [sources, setSources] = useState<CompanySource[]>([]);
  const [categories, setCategories] = useState<RoomCategory[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [entries, setEntries] = useState<RoomChartEntry[]>([]);
  const [hotSeasons, setHotSeasons] = useState<HotSeason[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Side panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelRow, setPanelRow] = useState<RoomChartEntryInput | null>(null);
  const [panelMode, setPanelMode] = useState<'add' | 'edit'>('add');
  const [addRoomRows, setAddRoomRows] = useState<RoomSelectionRow[]>([]);
  const [defaultRoomRate, setDefaultRoomRate] = useState(0);
  const [roomSearch, setRoomSearch] = useState('');
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [availableRoomNos, setAvailableRoomNos] = useState<Set<string>>(new Set());
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  // Expense & Revenue state
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [newExpense, setNewExpense] = useState<ExpenseEntryInput>(emptyExpense(initialDate));
  const [revenues, setRevenues] = useState<RevenueEntry[]>([]);
  const [newRevenue, setNewRevenue] = useState<RevenueEntryInput>(emptyRevenue(initialDate));

  // Derived report for review tab
  const [derived, setDerived] = useState<DerivedReport | null>(null);
  const [derivedLoading, setDerivedLoading] = useState(false);

  // Close Day / Reopen Day state
  const [dayCloseRecord, setDayCloseRecord] = useState<DayCloseRecord | null>(null);
  const [closeDayLoading, setCloseDayLoading] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeWarnings, setCloseWarnings] = useState<string[]>([]);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeSuccess, setCloseSuccess] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<DayCloseAuditLog[]>([]);

  const gstEnabled = settings?.gst_registered ?? false;
  const totalInventoryRooms = rooms.filter((r) => r.is_active).length;
  const totalRooms = totalInventoryRooms || (settings?.total_rooms ?? 22);
  const openingBalance = settings?.opening_cash_balance ?? 0;

  const load = useCallback(async (d: string) => {
    try {
      setLoading(true);
      setError(null);
      const [s, srcs, cats, rms, hs] = await Promise.all([
        getSettings(),
        getCompanySources(),
        getRoomCategories(),
        getRooms(),
        getHotSeasons(),
      ]);
      setSettings(s);
      setSources(srcs);
      setCategories(cats);
      setRooms(rms);
      setHotSeasons(hs);
      const [es, exp, rev] = await Promise.all([
        getRoomChart(d),
        getExpenseEntriesForDate(d),
        getRevenueEntriesForDate(d),
      ]);
      setEntries(es);
      setExpenses(exp);
      setRevenues(rev);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDerived = useCallback(async (d: string) => {
    setDerivedLoading(true);
    try {
      const dr = await getDerivedReport(d, totalRooms, openingBalance);
      setDerived(dr);
    } catch {
      setDerived(null);
    } finally {
      setDerivedLoading(false);
    }
  }, [totalRooms, openingBalance]);

  const loadDayClose = useCallback(async (d: string) => {
    try {
      const rec = await getDayCloseRecord(d);
      setDayCloseRecord(rec);
      if (rec) {
        const log = await getDayCloseAuditLog(d);
        setAuditLog(log);
      } else {
        setAuditLog([]);
      }
    } catch {
      setDayCloseRecord(null);
      setAuditLog([]);
    }
  }, []);

  useEffect(() => { load(initialDate); }, [initialDate, load]);
  useEffect(() => { loadDayClose(selectedDate); }, [selectedDate, loadDayClose]);

  // ── Close Day / Reopen Day handlers ──
  const handleCloseDayClick = async () => {
    setCloseDayLoading(true);
    setCloseError(null);
    setCloseWarnings([]);
    setCloseSuccess(false);
    try {
      const result = await closeDay(selectedDate, settings?.manager_name ?? 'Hotel Staff');
      setCloseWarnings(result.warnings);
      setShowCloseModal(true);
      setCloseSuccess(true);
      await loadDayClose(selectedDate);
    } catch (e) {
      setCloseError(e instanceof Error ? e.message : 'Failed to close day');
      setShowCloseModal(true);
    } finally {
      setCloseDayLoading(false);
    }
  };

  const handleReopenDayClick = async () => {
    if (!reopenReason.trim()) {
      setReopenError('A reason is required to reopen a closed day.');
      return;
    }
    setCloseDayLoading(true);
    setReopenError(null);
    try {
      await reopenDay(selectedDate, settings?.manager_name ?? 'Hotel Staff', reopenReason);
      setShowReopenModal(false);
      setReopenReason('');
      await loadDayClose(selectedDate);
    } catch (e) {
      setReopenError(e instanceof Error ? e.message : 'Failed to reopen day');
    } finally {
      setCloseDayLoading(false);
    }
  };

  const agg = useMemo(() => aggregateRoomChart(entries), [entries]);
  const occupiedTotal = agg.roomsOccupied + agg.complimentary;
  const occ = calcOcc(occupiedTotal, totalRooms);
  const closingRooms = calcClosingRooms(occupiedTotal, totalRooms);

  const todayExpensesTotal = expenses.reduce((s, e) => s + toNum(e.amount), 0);
  const otherRevenueTotal = revenues.reduce((s, r) => s + toNum(r.amount), 0);
  const roomRevenue = agg.roomRevenue;
  const grossRevenue = roomRevenue + otherRevenueTotal;
  const netOperatingProfit = grossRevenue - todayExpensesTotal;

  const totalCollection = agg.cash + agg.bank + (gstEnabled ? agg.payUpi + agg.payCard : 0);

  // Build room cards from Property Master inventory, overlaid with today's entries.
  const roomCards = useMemo(() => {
    const cards: { roomNo: string; status: RoomStatus; entry?: RoomChartEntry; category?: string; category_id?: string | null; floor?: string | null; tariff?: number }[] = [];
    const entryByRoomNo = new Map<string, RoomChartEntry>();
    for (const e of entries) {
      const key = (e.room_no || '').trim().toLowerCase();
      if (key) entryByRoomNo.set(key, e);
    }
    const usedNos = new Set<string>();
    for (const r of rooms) {
      if (!r.is_active) continue;
      const key = r.room_no.trim().toLowerCase();
      usedNos.add(key);
      const e = entryByRoomNo.get(key);
      cards.push({
        roomNo: r.room_no,
        status: e ? entryStatus(e) : 'vacant',
        entry: e,
        category: r.category_id ? (categories.find((c) => c.id === r.category_id)?.name ?? undefined) : undefined,
        category_id: r.category_id,
        floor: r.floor,
        tariff: r.default_tariff,
      });
    }
    for (const e of entries) {
      const key = (e.room_no || '').trim().toLowerCase();
      if (!key || usedNos.has(key)) continue;
      cards.push({ roomNo: e.room_no, status: entryStatus(e), entry: e });
    }
    return cards;
  }, [entries, rooms, categories]);

  const [y, m, d] = selectedDate.split('-');
  const displayDate = `${d}/${m}/${y}`;

  // ── Panel handlers ──
  const openAddPanel = () => {
    setPanelMode('add');
    setEditingId(null);
    setPanelRow(emptyRow(selectedDate, settings));
    setAddRoomRows([]);
    setDefaultRoomRate(0);
    setRoomSearch('');
    setRoomPickerOpen(false);
    setPanelOpen(true);
  };

  const openAddPanelForRoom = (roomNo: string, category?: string) => {
    setPanelMode('add');
    setEditingId(null);
    const row = emptyRow(selectedDate, settings);
    row.room_no = roomNo;
    if (category) row.room_category = category;
    const cat = categories.find((c) => c.name === category);
    if (cat) {
      row.room_rate = toNum(cat.default_tariff);
      row.total = toNum(cat.default_tariff);
      const { taxable, gst, invoiceTotal } = calcGstFull(row.total, row.gst_type, row.gst_slab);
      row.taxable_amount = taxable;
      row.gst_amount = gst;
      row.invoice_total = invoiceTotal;
    }
    setPanelRow(row);
    setAddRoomRows([{ roomNo, category: category ?? '', rate: toNum(row.room_rate) }]);
    setDefaultRoomRate(toNum(row.room_rate));
    setRoomSearch('');
    setRoomPickerOpen(false);
    setPanelOpen(true);
  };

  const openEditPanel = (e: RoomChartEntry) => {
    setPanelMode('edit');
    setEditingId(e.id);
    const entryGstType: GstType = e.gst_type != null
      ? e.gst_type
      : (!settings?.gst_registered ? 'No Scope' : ((e.gst_mode ?? 'Exclusive') as GstType));
    setPanelRow({
      report_date: e.report_date,
      room_no: e.room_no,
      guest_name: e.guest_name,
      arrival: e.arrival ?? '',
      departure: e.departure ?? '',
      nights: e.nights,
      room_rate: e.room_rate,
      total: e.total,
      company: e.company,
      source_category: e.source_category,
      pay_mode: e.pay_mode,
      description: e.description,
      is_complimentary: e.is_complimentary,
      meal_plan: (e.meal_plan ?? 'EP') as MealPlan,
      room_category: e.room_category ?? 'Standard',
      gst_mode: (e.gst_mode ?? 'Exclusive') as GstMode,
      gst_type: entryGstType,
      gst_slab: (e.gst_slab ?? 0) as GstSlab,
      gst_amount: toNum(e.gst_amount),
      taxable_amount: toNum(e.taxable_amount),
      invoice_total: toNum((e as unknown as Record<string, unknown>).invoice_total) || (toNum(e.total) > 0 ? toNum(e.total) : toNum(e.room_rate)),
      revenue_category: ((e as unknown as Record<string, unknown>).revenue_category as string) ?? 'Room Revenue',
      remarks: ((e as unknown as Record<string, unknown>).remarks as string) ?? '',
      created_by: ((e as unknown as Record<string, unknown>).created_by as string) ?? '',
      business_date: ((e as unknown as Record<string, unknown>).business_date as string | null) ?? e.report_date,
      pay_cash: toNum(e.pay_cash),
      pay_upi: toNum(e.pay_upi),
      pay_card: toNum(e.pay_card),
      pay_bank: toNum(e.pay_bank),
      pay_advance: toNum(e.pay_advance),
      pay_balance: toNum(e.pay_balance),
      id_proof_type: e.id_proof_type ?? 'None',
      id_proof_number: e.id_proof_number ?? '',
      id_proof_verified: e.id_proof_verified ?? false,
      arrival_time: e.arrival_time ?? '',
      checkout_time: e.checkout_time ?? '',
      checked_in_at: e.checked_in_at ?? null,
      checked_out_at: e.checked_out_at ?? null,
      reservation_id: e.reservation_id ?? null,
    });
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingId(null);
    setPanelRow(null);
    setAddRoomRows([]);
    setDefaultRoomRate(0);
    setRoomSearch('');
    setRoomPickerOpen(false);
  };

  useEffect(() => {
    if (!panelOpen || panelMode !== 'add' || !panelRow?.arrival || !panelRow.departure) return;
    let cancelled = false;
    setAvailabilityLoading(true);
    Promise.all(rooms.filter((room) => room.is_active && !UNAVAILABLE_HOUSEKEEPING.has(room.housekeeping_status)).map(async (room) => {
      const available = await checkRoomAvailability(room.room_no, panelRow.arrival ?? '', panelRow.departure ?? '');
      return available ? room.room_no.trim().toLowerCase() : null;
    })).then((roomNos) => {
      if (!cancelled) setAvailableRoomNos(new Set(roomNos.filter((roomNo): roomNo is string => Boolean(roomNo))));
    }).catch(() => {
      if (!cancelled) setAvailableRoomNos(new Set());
    }).finally(() => {
      if (!cancelled) setAvailabilityLoading(false);
    });
    return () => { cancelled = true; };
  }, [panelOpen, panelMode, panelRow?.arrival, panelRow?.departure, rooms]);

  const availableRooms = useMemo(() => rooms
    .filter((room) => {
      const category = categories.find((item) => item.id === room.category_id);
      return room.is_active && !UNAVAILABLE_HOUSEKEEPING.has(room.housekeeping_status)
        && availableRoomNos.has(room.room_no.trim().toLowerCase())
        && (!roomSearch || room.room_no.toLowerCase().includes(roomSearch.toLowerCase()))
        && Boolean(category);
    })
    .sort((a, b) => compareRoomNo(a.room_no, b.room_no)),
  [rooms, categories, availableRoomNos, roomSearch]);

  const addRoomAmount = useMemo(() => addRoomRows.reduce((sum, row) => sum + toNum(row.rate) * toNum(panelRow?.nights), 0), [addRoomRows, panelRow?.nights]);
  const addRoomFinance = useMemo(() => {
    if (!panelRow) return { taxable: 0, gst: 0, invoiceTotal: 0 };
    return calcGstFull(addRoomAmount, panelRow.gst_type, panelRow.gst_slab);
  }, [addRoomAmount, panelRow?.gst_type, panelRow?.gst_slab, panelRow]);
  const financeRow = panelRow && panelMode === 'add'
    ? { ...panelRow, total: addRoomAmount, taxable_amount: addRoomFinance.taxable, gst_amount: addRoomFinance.gst, invoice_total: addRoomFinance.invoiceTotal }
    : panelRow;

  const handlePanelSave = async () => {
    if (!panelRow) return;
    setError(null);
    const rows = panelMode === 'add' ? addRoomRows : [{ roomNo: panelRow.room_no, category: panelRow.room_category, rate: panelRow.room_rate }];
    if (panelMode === 'add' && rows.length === 0) {
      setError('Select at least one available room.');
      return;
    }
    if (!panelRow.guest_name.trim() && rows.some((row) => !row.roomNo.trim())) {
      setError('Enter a guest name or select a room for every room row.');
      return;
    }
    if (rows.some((row) => !row.roomNo.trim())) { setError('Select a room for every room row.'); return; }
    if (new Set(rows.map((row) => row.roomNo.trim().toLowerCase())).size !== rows.length) { setError('The same room cannot be selected twice.'); return; }
    try {
      setSaving(true);
      if (panelMode === 'edit' && editingId) {
        const saved = await saveRoomChartRow(panelRow, sources, editingId);
        setEntries((prev) => prev.map((e) => (e.id === editingId ? saved : e)));
      } else {
        const savedRows: RoomChartEntry[] = [];
        for (const [index, row] of rows.entries()) {
          const next = { ...panelRow, room_no: row.roomNo, room_category: row.category || 'Standard', room_rate: toNum(row.rate), total: toNum(row.rate) * toNum(panelRow.nights) };
          const { taxable, gst, invoiceTotal } = calcGstFull(next.total, next.gst_type, next.gst_slab);
          next.taxable_amount = taxable;
          next.gst_amount = gst;
          next.invoice_total = invoiceTotal;
          if (index > 0) {
            next.pay_cash = 0; next.pay_upi = 0; next.pay_card = 0; next.pay_bank = 0; next.pay_advance = 0;
            next.pay_balance = invoiceTotal;
          }
          savedRows.push(await saveRoomChartRow(next, sources));
        }
        setEntries((prev) => [...prev, ...savedRows]);
      }
      closePanel();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this room entry?')) return;
    try {
      await deleteRoomChartRow(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (editingId === id) closePanel();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const updatePanelRow = <K extends keyof RoomChartEntryInput>(key: K, v: RoomChartEntryInput[K]) => {
    setPanelRow((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: v };
      if (key === 'company') {
        next.source_category = classifyCompany(v as string, sources);
      }
      if (key === 'room_rate' || key === 'nights') {
        next.total = toNum(next.room_rate) * toNum(next.nights);
      }
      if (key === 'gst_type') {
        const newType = v as GstType;
        if (newType === 'No Scope') {
          next.gst_slab = 0;
          next.gst_mode = 'Exclusive';
        } else {
          next.gst_mode = newType as GstMode;
        }
      }
      if (key === 'total' || key === 'room_rate' || key === 'nights' || key === 'gst_type' || key === 'gst_mode' || key === 'gst_slab') {
        const { taxable, gst, invoiceTotal } = calcGstFull(next.total, next.gst_type, next.gst_slab);
        next.taxable_amount = taxable;
        next.gst_amount = gst;
        next.invoice_total = invoiceTotal;
      }
      // Auto-calculate advance (= total received) and balance whenever payment or amount changes
      if (key === 'pay_cash' || key === 'pay_upi' || key === 'pay_card' || key === 'pay_bank' ||
          key === 'total' || key === 'room_rate' || key === 'nights' || key === 'gst_type' ||
          key === 'gst_mode' || key === 'gst_slab' || key === 'invoice_total') {
        const received = toNum(next.pay_cash) + toNum(next.pay_upi) + toNum(next.pay_card) + toNum(next.pay_bank);
        const final = toNum(next.invoice_total) || (toNum(next.total) + toNum(next.gst_amount));
        next.pay_advance = received;
        next.pay_balance = Math.max(0, final - received);
      }
      return next;
    });
  };

  const handleDateChange = (newDate: string) => {
    if (!newDate) return;
    setSelectedDate(newDate);
    setNewExpense(emptyExpense(newDate));
    setNewRevenue(emptyRevenue(newDate));
    load(newDate);
  };

  // ── Expense handlers ──
  const handleAddExpense = async () => {
    setError(null);
    if (toNum(newExpense.amount) <= 0) { setError('Enter an expense amount.'); return; }
    try {
      setSaving(true);
      const saved = await saveExpenseEntry(newExpense);
      setExpenses((prev) => [...prev, saved]);
      setNewExpense(emptyExpense(selectedDate));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add expense');
    } finally {
      setSaving(false);
    }
  };
  const handleDeleteExpense = async (id: string) => {
    try { await deleteExpenseEntry(id); setExpenses((prev) => prev.filter((e) => e.id !== id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete expense'); }
  };

  // ── Revenue handlers ──
  const handleAddRevenue = async () => {
    setError(null);
    if (toNum(newRevenue.amount) <= 0) { setError('Enter a revenue amount.'); return; }
    try {
      setSaving(true);
      const saved = await saveRevenueEntry(newRevenue);
      setRevenues((prev) => [...prev, saved]);
      setNewRevenue(emptyRevenue(selectedDate));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add revenue');
    } finally {
      setSaving(false);
    }
  };
  const handleDeleteRevenue = async (id: string) => {
    try { await deleteRevenueEntry(id); setRevenues((prev) => prev.filter((e) => e.id !== id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete revenue'); }
  };

  // Load derived report when switching to review tab
  useEffect(() => {
    if (tab === 'review' && !derived && !derivedLoading) {
      loadDerived(selectedDate);
    }
  }, [tab, derived, derivedLoading, selectedDate, loadDerived]);

  const totalReceived = panelRow
    ? toNum(panelRow.pay_cash) + toNum(panelRow.pay_upi) + toNum(panelRow.pay_card) + toNum(panelRow.pay_bank)
    : 0;
  const finalAmount = financeRow ? toNum(financeRow.invoice_total) || (toNum(financeRow.total) + toNum(financeRow.gst_amount)) : 0;
  const autoAdvance = totalReceived;
  const autoBalance = Math.max(0, finalAmount - totalReceived);
  const splitMatch = Math.abs(totalReceived + autoBalance - finalAmount) < 0.01;

  const isOtaBooking = panelRow ? ['OTA', 'Corporate/Agent'].includes(panelRow.source_category) : false;

  // Status counts for legend
  const statusCounts = useMemo(() => {
    const counts: Record<RoomStatus, number> = { occupied: 0, vacant: 0, complimentary: 0, house_use: 0, day_use: 0, ooo: 0 };
    for (const c of roomCards) counts[c.status]++;
    return counts;
  }, [roomCards]);

  return (
    <div className="min-h-screen bg-slate-50 pb-28 lg:pb-6">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 text-white px-4 lg:px-6 py-3 flex items-center gap-3 shadow-lg" style={{ background: brand.navy }}>
        <button onClick={onBack} className="p-1.5 -ml-1.5 hover:bg-white/10 rounded-lg transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold leading-tight">Daily Entry</h1>
          <p className="text-sky-200 text-xs">{displayDate}</p>
        </div>
        <div className="hidden lg:flex items-center gap-2">
          <button onClick={openAddPanel} disabled={saving}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 disabled:opacity-60 text-white font-semibold py-2 px-4 rounded-lg text-sm transition border border-white/20">
            <Plus className="w-4 h-4" /> Add Room Entry
          </button>
          <button onClick={onSaved}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-2 px-4 rounded-lg text-sm transition">
            <Check className="w-4 h-4" /> Done
          </button>
        </div>
        <BedDouble className="w-5 h-5 text-sky-300 lg:hidden" />
      </header>

      {/* ── Top Dashboard ── */}
      <div className="px-4 lg:px-6 pt-4 w-full space-y-3">
        {/* Date + Occupancy bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 sm:w-48 transition-colors ${isHotSeasonDate(selectedDate, hotSeasons) ? 'bg-rose-50 border-rose-300' : 'bg-white border-slate-200'}`}>
            <Clock className={`w-4 h-4 ${isHotSeasonDate(selectedDate, hotSeasons) ? 'text-rose-500' : 'text-slate-400'}`} />
            <div className="flex-1">
              <input type="date" value={selectedDate} max={initialDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className={`bg-transparent text-sm font-medium focus:outline-none w-full ${isHotSeasonDate(selectedDate, hotSeasons) ? 'text-rose-700' : 'text-slate-900'}`} />
              {isHotSeasonDate(selectedDate, hotSeasons) && (
                <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider mt-0.5">Hot Season</p>
              )}
            </div>
          </div>
          {/* Occupancy progress bar */}
          <div className="flex-1 bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Occupancy</span>
                <span className="text-sm font-bold text-slate-800">{occupiedTotal}/{totalRooms} · {occ.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, occ)}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard icon={<Bed className="w-4 h-4" />} label="Occupied" value={`${fmtInt(occupiedTotal)}`} sub={`${fmtInt(closingRooms)} vacant`} color="emerald" />
            <KpiCard icon={<BedDouble className="w-4 h-4" />} label="Vacant" value={fmtInt(closingRooms)} sub="Available" color="slate" />
            <KpiCard icon={<DollarSign className="w-4 h-4" />} label="Room Revenue" value={`₹${fmtMoney(roomRevenue)}`} sub={`ARR ₹${fmtMoney(agg.roomsOccupied > 0 ? roomRevenue / agg.roomsOccupied : 0)}`} color="sky" />
            <KpiCard icon={<Wallet className="w-4 h-4" />} label="Collection" value={`₹${fmtMoney(totalCollection)}`} sub="Today" color="amber" />
            <KpiCard icon={<TrendingUp className="w-4 h-4" />} label="Other Rev" value={`₹${fmtMoney(otherRevenueTotal)}`} sub={`${revenues.length} entries`} color="violet" />
          </div>
        )}

        {/* Collection breakdown bar */}
        {!loading && totalCollection > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Collection Breakdown</span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <CollChip icon={<Banknote className="w-3 h-3" />} label="Cash" amount={agg.cash} color="text-emerald-600" />
              <CollChip icon={<Smartphone className="w-3 h-3" />} label="UPI" amount={agg.payUpi} color="text-sky-600" />
              <CollChip icon={<CreditCard className="w-3 h-3" />} label="Card" amount={agg.payCard} color="text-violet-600" />
              <CollChip icon={<Building2 className="w-3 h-3" />} label="Bank" amount={agg.bank} color="text-amber-600" />
              <CollChip icon={<Building2 className="w-3 h-3" />} label="OTA" amount={agg.ota} color="text-orange-600" />
            </div>
          </div>
        )}
      </div>

      {/* ── Tab Bar ── */}
      <div className="px-4 lg:px-6 pt-4 w-full">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          <TabButton active={tab === 'rooms'} onClick={() => setTab('rooms')} icon={<BedDouble className="w-4 h-4" />} label="Rooms" count={entries.length} />
          <TabButton active={tab === 'expenses'} onClick={() => setTab('expenses')} icon={<Receipt className="w-4 h-4" />} label="Expenses" count={expenses.length} />
          <TabButton active={tab === 'review'} onClick={() => setTab('review')} icon={<Calculator className="w-4 h-4" />} label="Review" />
        </div>
      </div>

      <main className="px-4 lg:px-6 py-4 w-full">
        {error && (
          <div className="mb-3 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* ── TAB: ROOMS ── */}
        {tab === 'rooms' && (
          <div className="space-y-3">
            {/* Status legend */}
            {!loading && roomCards.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(Object.entries(statusCounts) as [RoomStatus, number][]).filter(([, c]) => c > 0).map(([status, count]) => {
                  const cfg = STATUS_CONFIG[status];
                  return (
                    <div key={status} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label} <span className="font-bold">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {entries.length === 0 && roomCards.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                <BedDouble className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm font-medium">No rooms configured</p>
                <p className="text-slate-400 text-xs mt-1">Add rooms in Property Master to see the room chart here.</p>
              </div>
            )}
            {entries.length === 0 && roomCards.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
                <BedDouble className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm font-medium">All rooms vacant</p>
                <p className="text-slate-400 text-xs mt-1">Tap any room card to check in a guest.</p>
              </div>
            )}

            {/* Room cards grid grouped by category */}
            {!loading && (() => {
              const sortedCards = [...roomCards].sort((a, b) => compareRoomNo(a.roomNo, b.roomNo));
              const grouped = groupRoomsByCategory(
                sortedCards.map((c) => ({ ...c, category_id: c.category_id ?? null })),
                categories,
              );
              return (
                <div className="space-y-5">
                  {grouped.map((group) => (
                    <div key={group.cat?.id ?? '__uncategorized'}>
                      {/* Category header */}
                      <div className="flex items-center justify-between mb-2 px-1">
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-1 rounded-full bg-sky-500" />
                          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                            {group.cat?.name ?? 'Uncategorized'}
                          </h3>
                        </div>
                        <span className="text-[10px] font-semibold text-slate-400 tabular-nums">
                          {group.rooms.length} room{group.rooms.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {/* Room cards */}
                      <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
                        {group.rooms.map((card) => {
                          const cfg = STATUS_CONFIG[card.status];
                          const e = card.entry;
                          const hasPayment = e && (toNum(e.pay_cash) > 0 || toNum(e.pay_upi) > 0 || toNum(e.pay_card) > 0 || toNum(e.pay_bank) > 0);
                          return (
                            <button
                              key={`${card.roomNo}-${card.roomNo}`}
                              onClick={() => e ? openEditPanel(e) : openAddPanelForRoom(card.roomNo, card.category)}
                              className={`text-left bg-white rounded-2xl border ${cfg.border} shadow-sm hover:shadow-md hover:border-sky-300 transition-all p-3.5 relative overflow-hidden group`}
                            >
                              {/* Top accent bar */}
                              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${cfg.accent}`} />

                              {/* Status + meal plan */}
                              <div className="flex items-center justify-between mb-2 mt-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                                  <span className={`text-[10px] font-bold uppercase tracking-wide ${cfg.text}`}>{cfg.label}</span>
                                </div>
                                {e && (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${MEAL_COLOR[(e.meal_plan ?? 'EP') as MealPlan]}`}>
                                    {MEAL_LABEL[(e.meal_plan ?? 'EP') as MealPlan]}
                                  </span>
                                )}
                              </div>

                              {/* Room number */}
                              <p className="text-xl font-bold text-slate-900 leading-none">{card.roomNo}</p>
                              {(card.category || (e?.room_category && e.room_category !== 'Standard')) && (
                                <p className="text-[10px] font-semibold text-violet-600 mt-1 truncate">{card.category ?? e?.room_category}</p>
                              )}
                              {card.floor && !e && (
                                <p className="text-[10px] text-slate-400 mt-1">{card.floor} Floor</p>
                              )}

                              {/* Guest info */}
                              {e ? (
                                <div className="mt-2 space-y-1">
                                  <p className="text-xs font-semibold text-slate-700 truncate">{e.guest_name || '—'}</p>
                                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                                    <span className="font-semibold">₹{fmtMoney(e.total > 0 ? e.total : e.room_rate)}</span>
                                    <span className="flex items-center gap-0.5 truncate">
                                      {e.pay_mode === 'Cash' && <Wallet className="w-2.5 h-2.5" />}
                                      {e.pay_mode === 'Bank' && <Building2 className="w-2.5 h-2.5" />}
                                      {e.company || 'Direct'}
                                    </span>
                                  </div>
                                  {/* Payment indicator */}
                                  {hasPayment && (
                                    <div className="flex items-center gap-0.5">
                                      {toNum(e.pay_cash) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Cash" />}
                                      {toNum(e.pay_upi) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-sky-500" title="UPI" />}
                                      {toNum(e.pay_card) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-violet-500" title="Card" />}
                                      {toNum(e.pay_bank) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Bank" />}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="mt-2.5 space-y-0.5">
                                  {card.tariff ? (
                                    <p className="text-[10px] text-slate-400">₹{fmtMoney(card.tariff)} tariff</p>
                                  ) : null}
                                  <div className="flex items-center gap-1 text-[10px] text-slate-400 group-hover:text-sky-600 transition">
                                    <Plus className="w-2.5 h-2.5" /> Check In
                                  </div>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Meal plan summary */}
            {!loading && entries.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-3 mt-2">
                <div className="flex items-center gap-2 mb-2">
                  <UtensilsCrossed className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Meal Plan</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(Object.entries(
                    entries.reduce((acc, e) => {
                      const mp = (e.meal_plan ?? 'EP') as MealPlan;
                      acc[mp] = (acc[mp] ?? 0) + 1;
                      return acc;
                    }, {} as Record<MealPlan, number>)
                  ) as [MealPlan, number][]).map(([plan, count]) => (
                    <div key={plan} className={`rounded-lg px-2 py-2 text-center ${MEAL_COLOR[plan]}`}>
                      <p className="text-sm font-bold">{count}</p>
                      <p className="text-[10px] font-semibold">{plan}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: EXPENSES ── */}
        {tab === 'expenses' && (
          <div className="space-y-4">
            {/* Other Revenue section */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-emerald-50 px-4 py-3 flex items-center gap-2 border-b border-emerald-100">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-emerald-800">Other Revenue</h2>
              </div>
              {revenues.length > 0 && (
                <div className="divide-y divide-slate-100">
                  {revenues.map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700">{r.revenue_head}</p>
                        <p className="text-xs text-slate-400 truncate">{r.description || r.payment_mode}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold tabular-nums text-slate-800">₹{fmtMoney(toNum(r.amount))}</span>
                        <button onClick={() => handleDeleteRevenue(r.id)}
                          className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="p-4 space-y-3 border-t border-slate-100 bg-slate-50/50">
                <div className="grid grid-cols-2 gap-3">
                  <SelectField label="Revenue Head" value={newRevenue.revenue_head}
                    options={REVENUE_HEADS as unknown as string[]}
                    onChange={(v) => setNewRevenue((p) => ({ ...p, revenue_head: v }))} />
                  <SelectField label="Payment Mode" value={newRevenue.payment_mode}
                    options={['Cash', 'Bank', 'UPI', 'Card']}
                    onChange={(v) => setNewRevenue((p) => ({ ...p, payment_mode: v as RevenuePaymentMode }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Description" value={newRevenue.description}
                    onChange={(v) => setNewRevenue((p) => ({ ...p, description: v }))} />
                  <NumField label="Amount" prefix="₹" value={toNum(newRevenue.amount)}
                    onChange={(v) => setNewRevenue((p) => ({ ...p, amount: v }))} />
                </div>
                <button onClick={handleAddRevenue} disabled={saving}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl text-sm transition shadow-sm">
                  <Plus className="w-4 h-4" /> Add Revenue
                </button>
              </div>
            </div>

            {/* Expense section */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-rose-50 px-4 py-3 flex items-center gap-2 border-b border-rose-100">
                <Receipt className="w-4 h-4 text-rose-600" />
                <h2 className="text-sm font-bold text-rose-800">Today's Expenses</h2>
              </div>
              {expenses.length > 0 && (
                <div className="divide-y divide-slate-100">
                  {expenses.map((e) => (
                    <div key={e.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700">{e.category_name}</p>
                        <p className="text-xs text-slate-400 truncate">{e.description || e.payment_mode}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold tabular-nums text-rose-600">- ₹{fmtMoney(toNum(e.amount))}</span>
                        <button onClick={() => handleDeleteExpense(e.id)}
                          className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="p-4 space-y-3 border-t border-slate-100 bg-slate-50/50">
                <div className="grid grid-cols-2 gap-3">
                  <SelectField label="Category" value={newExpense.category_name}
                    options={EXPENSE_HEADS as unknown as string[]}
                    onChange={(v) => setNewExpense((p) => ({ ...p, category_name: v }))} />
                  <SelectField label="Payment Mode" value={newExpense.payment_mode}
                    options={['Cash', 'Bank', 'UPI', 'Credit']}
                    onChange={(v) => setNewExpense((p) => ({ ...p, payment_mode: v as ExpenseEntry['payment_mode'] }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Description" value={newExpense.description}
                    onChange={(v) => setNewExpense((p) => ({ ...p, description: v }))} />
                  <NumField label="Amount" prefix="₹" value={toNum(newExpense.amount)}
                    onChange={(v) => setNewExpense((p) => ({ ...p, amount: v }))} />
                </div>
                <TextField label="Notes" value={newExpense.notes ?? ''}
                  onChange={(v) => setNewExpense((p) => ({ ...p, notes: v }))} />
                <button onClick={handleAddExpense} disabled={saving}
                  className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl text-sm transition shadow-sm">
                  <Plus className="w-4 h-4" /> Add Expense
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: REVIEW ── */}
        {tab === 'review' && (
          <div className="space-y-4">
            {/* Summary card */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-sky-50 px-4 py-3 flex items-center gap-2 border-b border-sky-100">
                <Calculator className="w-4 h-4 text-sky-600" />
                <h2 className="text-sm font-bold text-sky-800">Daily Summary</h2>
              </div>
              <div className="p-4 space-y-3">
                <ReviewRow label="Rooms Sold" value={`${fmtInt(occupiedTotal)} / ${totalRooms}`} />
                <ReviewRow label="Occupancy" value={`${occ.toFixed(0)}%`} />
                <ReviewRow label="Room Revenue" value={`₹${fmtMoney(roomRevenue)}`} />
                {gstEnabled && agg.gstCollected > 0 && (
                  <ReviewRow label="GST Collected" value={`₹${fmtMoney(agg.gstCollected)}`} />
                )}
                <ReviewRow label="Other Revenue" value={`₹${fmtMoney(otherRevenueTotal)}`} />
                <div className="border-t border-slate-100 pt-3">
                  <ReviewRow label="Gross Revenue" value={`₹${fmtMoney(grossRevenue + (gstEnabled ? agg.gstCollected : 0))}`} bold />
                </div>
                <ReviewRow label="Total Expenses" value={`- ₹${fmtMoney(todayExpensesTotal)}`} negative />
                <div className="border-t-2 border-slate-200 pt-3">
                  <ReviewRow label="Net Operating Profit" value={`₹${fmtMoney(netOperatingProfit + (gstEnabled ? agg.gstCollected : 0))}`} bold />
                </div>
              </div>
            </div>

            {/* Cash Collection Breakdown */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-amber-50 px-4 py-3 flex items-center gap-2 border-b border-amber-100">
                <Wallet className="w-4 h-4 text-amber-600" />
                <h2 className="text-sm font-bold text-amber-800">Cash Collection</h2>
              </div>
              <div className="p-4 space-y-2">
                <ReviewRow label="Cash" value={`₹${fmtMoney(agg.cash)}`} />
                <ReviewRow label="Bank" value={`₹${fmtMoney(agg.bank)}`} />
                {gstEnabled && (
                  <>
                    <ReviewRow label="UPI" value={`₹${fmtMoney(agg.payUpi)}`} />
                    <ReviewRow label="Card" value={`₹${fmtMoney(agg.payCard)}`} />
                  </>
                )}
                <div className="border-t border-slate-100 pt-2">
                  <ReviewRow label="Total Collection" value={`₹${fmtMoney(totalCollection)}`} bold />
                </div>
              </div>
            </div>

            {/* Expected Cash Closing */}
            <div className="bg-gradient-to-br from-sky-700 to-sky-900 text-white rounded-2xl p-5 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-4 h-4 text-sky-300" />
                <p className="text-sky-200 text-xs uppercase tracking-wide font-medium">Expected Cash Closing</p>
              </div>
              {derivedLoading ? (
                <p className="text-sky-300 text-sm animate-pulse">Calculating…</p>
              ) : derived ? (
                <p className="text-3xl font-bold tabular-nums">₹{fmtMoney(derived.cash_closing)}</p>
              ) : (
                <p className="text-sky-300 text-sm">Unable to calculate</p>
              )}
              <p className="text-sky-300 text-xs mt-2">
                Previous closing + cash + other revenue − expenses
              </p>
            </div>

            {/* ── Close Day / Reopen Day Section ── */}
            <div className="space-y-3">
              {/* Status badge */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600">Day Status:</span>
                {dayCloseRecord?.status === 'closed' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Closed
                  </span>
                ) : dayCloseRecord?.status === 'reopened' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> Reopened — Correction Pending
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-sky-500" /> Open
                  </span>
                )}
                {dayCloseRecord && dayCloseRecord.report_version > 0 && (
                  <span className="text-xs text-slate-400">v{dayCloseRecord.report_version}</span>
                )}
              </div>

              {/* Close Day / Reopen Day buttons */}
              <div className="flex gap-3">
                {dayCloseRecord?.status !== 'closed' ? (
                  <button onClick={handleCloseDayClick} disabled={closeDayLoading}
                    className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-4 rounded-2xl shadow-lg transition text-base">
                    {closeDayLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                    Close Day & Lock
                  </button>
                ) : (
                  <button onClick={() => { setShowReopenModal(true); setReopenError(null); }}
                    className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold py-4 rounded-2xl shadow-lg transition text-base">
                    <Unlock className="w-5 h-5" /> Reopen Day
                  </button>
                )}
                <button onClick={onSaved}
                  className="flex items-center justify-center gap-2 bg-slate-600 hover:bg-slate-700 text-white font-semibold py-4 px-6 rounded-2xl shadow transition text-base">
                  Done
                </button>
              </div>

              {/* Audit log display */}
              {auditLog.length > 0 && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Audit Trail</div>
                  {auditLog.slice(0, 5).map((log) => (
                    <div key={log.id} className="flex items-start gap-2 text-xs py-1.5 border-b border-slate-100 last:border-0">
                      {log.action === 'close' ? (
                        <Lock className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                      ) : (
                        <Unlock className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <span className="font-medium text-slate-700">{log.action === 'close' ? 'Closed' : 'Reopened'}</span>
                        {' '}by <span className="font-medium text-slate-700">{log.performed_by || 'Unknown'}</span>
                        {' '}on <span className="text-slate-500">{new Date(log.created_at).toLocaleString('en-IN')}</span>
                        {log.reason && <p className="text-slate-500 mt-0.5">Reason: {log.reason}</p>}
                        <span className="text-slate-400"> · v{log.report_version}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* ── Close Day Modal ── */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                {closeError ? (
                  <AlertCircle className="w-6 h-6 text-rose-500" />
                ) : (
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                )}
                <h3 className="text-lg font-bold text-slate-800">
                  {closeError ? 'Close Day Failed' : 'Day Closed Successfully'}
                </h3>
              </div>
              {closeError && (
                <p className="text-sm text-rose-600 bg-rose-50 rounded-lg p-3 mb-3">{closeError}</p>
              )}
              {closeSuccess && closeWarnings.length > 0 && (
                <div className="mb-3">
                  <p className="text-sm font-medium text-amber-600 mb-1.5">Warnings ({closeWarnings.length}):</p>
                  <ul className="space-y-1">
                    {closeWarnings.map((w, i) => (
                      <li key={i} className="text-xs text-amber-700 bg-amber-50 rounded p-2 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {closeSuccess && closeWarnings.length === 0 && !closeError && (
                <p className="text-sm text-emerald-600 bg-emerald-50 rounded-lg p-3 mb-3">
                  All entries validated. No missing data. Report generated and locked.
                </p>
              )}
              <button onClick={() => setShowCloseModal(false)}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3 rounded-xl transition">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reopen Day Modal ── */}
      {showReopenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <Unlock className="w-6 h-6 text-amber-500" />
                <h3 className="text-lg font-bold text-slate-800">Reopen Closed Day</h3>
              </div>
              <p className="text-sm text-slate-500 mb-3">
                Reopening will unlock the business date {selectedDate} for corrections.
                A new report version will be generated. This action is audited.
              </p>
              {dayCloseRecord && (
                <div className="bg-slate-50 rounded-lg p-3 mb-3 text-xs text-slate-600">
                  <div>Current version: v{dayCloseRecord.report_version}</div>
                  <div>Closed by: {dayCloseRecord.closed_by || 'Unknown'}</div>
                  <div>Closed at: {dayCloseRecord.closed_at ? new Date(dayCloseRecord.closed_at).toLocaleString('en-IN') : '—'}</div>
                </div>
              )}
              <label className="block mb-3">
                <span className="block text-sm font-medium text-slate-700 mb-1">Reason for reopening <span className="text-rose-500">*</span></span>
                <textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="e.g., Missing entry discovered, wrong rate entered, etc."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </label>
              {reopenError && (
                <p className="text-sm text-rose-600 bg-rose-50 rounded-lg p-2 mb-3">{reopenError}</p>
              )}
              <div className="flex gap-3">
                <button onClick={() => { setShowReopenModal(false); setReopenReason(''); setReopenError(null); }}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-xl transition">
                  Cancel
                </button>
                <button onClick={handleReopenDayClick} disabled={closeDayLoading || !reopenReason.trim()}
                  className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition">
                  {closeDayLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                  Confirm Reopen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky bottom bar (mobile only) ── */}
      {tab === 'rooms' && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 w-full bg-white border-t border-slate-200 p-3 flex gap-2.5">
          <button onClick={openAddPanel} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl shadow-sm transition">
            <Plus className="w-5 h-5" /> Add Room Entry
          </button>
          <button onClick={onSaved}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 px-4 rounded-xl shadow-sm transition">
            <Check className="w-5 h-5" /> Done
          </button>
        </div>
      )}

      {/* ── SIDE PANEL (Room Entry) ── */}
      {panelOpen && panelRow && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 z-30 backdrop-blur-sm"
            onClick={closePanel}
          />
          {/* Panel — bottom sheet on mobile, centered modal on desktop */}
          <div className="fixed bottom-0 inset-x-0 w-full lg:inset-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:w-[640px] lg:max-w-[90vw] max-w-2xl mx-auto lg:mx-0 bg-white rounded-t-3xl lg:rounded-2xl shadow-2xl z-40 max-h-[88vh] overflow-y-auto animate-in">
            {/* Handle (mobile only) */}
            <div className="sticky top-0 bg-white pt-2 pb-1 z-10 lg:hidden">
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto" />
            </div>

            {/* Panel header */}
            <div className="sticky top-3 bg-white px-5 py-3 flex items-center justify-between border-b border-slate-100 z-10">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {panelMode === 'add' ? 'New Check-In' : `Edit Room ${panelRow.room_no || ''}`}
                </h3>
                <p className="text-xs text-slate-400">{displayDate}</p>
              </div>
              <button onClick={closePanel} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Panel body */}
            <div className="px-5 py-4 space-y-4">
              {panelMode === 'add' ? (
                <div className="space-y-3">
                  <div className="relative">
                    <button type="button" onClick={() => setRoomPickerOpen((open) => !open)}
                      className="w-full flex items-center justify-between px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-left focus:outline-none focus:ring-2 focus:ring-sky-500">
                      <span className={addRoomRows.length ? 'text-slate-900' : 'text-slate-400'}>{addRoomRows.length ? `${addRoomRows.length} room${addRoomRows.length === 1 ? '' : 's'} selected` : 'Select Rooms'}</span>
                      <span className="text-xs text-slate-400">{roomPickerOpen ? 'Close' : 'Choose'}</span>
                    </button>
                    {roomPickerOpen && (
                      <div className="absolute left-0 right-0 top-full mt-2 z-20 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                        <div className="p-2 border-b border-slate-100">
                          <input autoFocus type="search" value={roomSearch} onChange={(e) => setRoomSearch(e.target.value)} placeholder="Search room number or category"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                        </div>
                        <div className="max-h-56 overflow-y-auto p-2">
                          {availableRooms.filter((room) => {
                            const category = categories.find((item) => item.id === room.category_id)?.name ?? 'Uncategorized';
                            const query = roomSearch.trim().toLowerCase();
                            return !query || room.room_no.toLowerCase().includes(query) || category.toLowerCase().includes(query);
                          }).map((room) => {
                            const category = categories.find((item) => item.id === room.category_id);
                            const selected = addRoomRows.some((row) => row.roomNo === room.room_no);
                            return (
                              <label key={room.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sky-50 cursor-pointer">
                                <input type="checkbox" checked={selected} onChange={() => setAddRoomRows((prev) => selected ? prev.filter((row) => row.roomNo !== room.room_no) : [...prev, { roomNo: room.room_no, category: category?.name ?? 'Uncategorized', rate: defaultRoomRate || toNum(category?.default_tariff) }])}
                                  className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                                <span className="text-sm font-semibold text-slate-800">Room {room.room_no}</span>
                                <span className="text-xs text-slate-500">{category?.name ?? 'Uncategorized'}</span>
                              </label>
                            );
                          })}
                          {!availabilityLoading && availableRooms.length === 0 && <p className="p-3 text-sm text-slate-400">No rooms available for these dates.</p>}
                        </div>
                      </div>
                    )}
                  </div>
                  {availabilityLoading && <p className="text-xs text-slate-400">Checking room availability…</p>}
                  <div className="flex items-end gap-2">
                    <NumField label="Default Room Rate" prefix="₹" value={defaultRoomRate} onChange={setDefaultRoomRate} />
                    <button type="button" onClick={() => setAddRoomRows((prev) => prev.map((row) => ({ ...row, rate: defaultRoomRate })))} disabled={!addRoomRows.length}
                      className="shrink-0 px-3 py-2.5 rounded-xl border border-sky-200 bg-sky-50 text-sky-700 text-sm font-semibold hover:bg-sky-100 disabled:opacity-50 transition">Apply to All</button>
                  </div>
                  {addRoomRows.length > 0 && (
                    <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                      {addRoomRows.map((row) => (
                        <div key={row.roomNo} className="grid grid-cols-[1fr_1fr_112px_auto] gap-2 items-center px-3 py-2 bg-white">
                          <span className="text-sm font-semibold text-slate-800">{row.roomNo}</span>
                          <span className="text-xs text-slate-500">{row.category}</span>
                          <input type="number" min={0} value={row.rate} onChange={(e) => setAddRoomRows((prev) => prev.map((item) => item.roomNo === row.roomNo ? { ...item, rate: Math.max(0, Number(e.target.value)) } : item))}
                            aria-label={`Room rate for ${row.roomNo}`} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500" />
                          <button type="button" onClick={() => setAddRoomRows((prev) => prev.filter((item) => item.roomNo !== row.roomNo))} aria-label={`Remove room ${row.roomNo}`} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Room No." value={panelRow.room_no} onChange={(v) => updatePanelRow('room_no', v)} />
                  <SelectField label="Room Category" value={panelRow.room_category}
                    options={categories.length > 0 ? categories.filter((c) => c.is_active).map((c) => c.name) : ['Standard', 'Deluxe', 'Super Deluxe', 'Executive', 'Suite', 'Family Room']}
                    onChange={(v) => updatePanelRow('room_category', v)} />
                </div>
              )}

              {/* Guest Name */}
              <TextField label="Guest Name" value={panelRow.guest_name} onChange={(v) => updatePanelRow('guest_name', v)} />

              {/* Check In / Out */}
              <div className="grid grid-cols-2 gap-3">
                <DateField label="Check In" value={panelRow.arrival ?? ''} onChange={(v) => updatePanelRow('arrival', v)} />
                <DateField label="Check Out" value={panelRow.departure ?? ''} onChange={(v) => updatePanelRow('departure', v)} />
              </div>

              {/* Nights */}
              <div className={panelMode === 'edit' ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3'}>
                <NumField label="Nights" value={panelRow.nights} allowDecimal={false} onChange={(v) => updatePanelRow('nights', v)} />
                {panelMode === 'edit' && <NumField label="Room Rate" prefix="₹" value={panelRow.room_rate} onChange={(v) => updatePanelRow('room_rate', v)} />}
              </div>

              {/* Live summary */}
              {panelMode === 'add' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-xl border border-sky-100 bg-sky-50 p-3">
                  <SummaryMetric label="Rooms Count" value={String(addRoomRows.length)} />
                  <SummaryMetric label="Nights" value={String(panelRow.nights)} />
                  <SummaryMetric label="Room Amount" value={`₹${fmtMoney(addRoomAmount)}`} />
                  <SummaryMetric label="Tax" value={`₹${fmtMoney(addRoomFinance.gst)}`} />
                  <SummaryMetric label="Discount" value="₹0.00" />
                  <SummaryMetric label="Grand Total" value={`₹${fmtMoney(addRoomFinance.invoiceTotal)}`} strong />
                </div>
              ) : (
                <div className="bg-gradient-to-r from-sky-50 to-sky-100 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-sky-700">Total Amount</span>
                  <span className="text-xl font-bold tabular-nums text-sky-900">₹{fmtMoney(panelRow.total)}</span>
                </div>
              )}

              {/* Booking Source */}
              <div>
                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 mb-1">Booking Source</span>
                  <input type="text" list="company-list-panel" value={panelRow.company}
                    onChange={(e) => updatePanelRow('company', e.target.value)}
                    placeholder="e.g. MakeMyTrip, Walk In"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
                  <datalist id="company-list-panel">
                    {sources.map((s) => <option key={s.id} value={s.name} />)}
                  </datalist>
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-xs text-slate-400">Category:</span>
                  <span className="text-xs font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded">
                    {classifyCompany(panelRow.company, sources)}
                  </span>
                </div>
              </div>

              {/* Source Category + Meal Plan */}
              <div className="grid grid-cols-2 gap-3">
                <SelectField label="Source Category" value={panelRow.source_category}
                  options={['OTA', 'Direct/Walking', 'Corporate/Agent', 'Phonebook'].map((o) => ({ value: o, label: o }))}
                  onChange={(v) => updatePanelRow('source_category', v as SourceCategory)} />
                <SelectField label="Meal Plan"
                  value={panelRow.meal_plan}
                  options={MEAL_PLANS.map((p) => ({ value: p.value, label: p.label }))}
                  onChange={(v) => updatePanelRow('meal_plan', v as MealPlan)} />
              </div>

              {/* Pay Mode */}
              <SelectField label="Pay Mode" value={panelRow.pay_mode}
                options={[{ value: 'Cash', label: 'Cash' }, { value: 'Bank', label: 'Bank' }]}
                onChange={(v) => updatePanelRow('pay_mode', v as PayMode)} />

              {/* Description / Remarks */}
              <TextField label="Remarks" value={panelRow.description} onChange={(v) => updatePanelRow('description', v)} />

              {/* Complimentary toggle */}
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={panelRow.is_complimentary}
                  onChange={(e) => updatePanelRow('is_complimentary', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                Complimentary room (no revenue)
              </label>

              {/* GST + Split Payment */}
              <GstSplitFields row={financeRow ?? panelRow} update={updatePanelRow} enabled={true} />

              {/* Split payment validation indicator */}
              {gstEnabled && (totalReceived > 0 || finalAmount > 0) && (
                <div className={`rounded-xl px-3 py-2.5 text-xs font-medium flex items-center justify-between ${
                  splitMatch ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  <span>Received: ₹{fmtMoney(totalReceived)}</span>
                  <span>Final: ₹{fmtMoney(finalAmount)}</span>
                  <span className="font-bold">{splitMatch ? '✓ Match' : '⚠ Mismatch'}</span>
                </div>
              )}

              {/* OTA notice */}
              {isOtaBooking && (
                <div className="bg-sky-50 border border-sky-200 rounded-xl px-3 py-2.5 text-xs text-sky-700 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>OTA / Agent booking — payment collection may be settled later by the agent.</span>
                </div>
              )}

              {/* Walk-in payment focus notice */}
              {!isOtaBooking && panelRow.source_category === 'Direct/Walking' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-xs text-emerald-700 flex items-start gap-2">
                  <Wallet className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Walk-in booking — collect payment now using split payment fields below.</span>
                </div>
              )}

              {/* Delete button (edit mode) */}
              {panelMode === 'edit' && editingId && (
                <button onClick={() => handleDelete(editingId)}
                  className="w-full flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 font-medium py-2.5 rounded-xl text-sm transition border border-red-200">
                  <Trash2 className="w-4 h-4" /> Delete Entry
                </button>
              )}
            </div>

            {/* Panel footer (sticky save) */}
            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 py-3">
              {panelMode === 'add' && (
                <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                  <SummaryMetric label="Rooms" value={String(addRoomRows.length)} />
                  <SummaryMetric label="Room Amount" value={`₹${fmtMoney(addRoomAmount)}`} />
                  <SummaryMetric label="Grand Total" value={`₹${fmtMoney(addRoomFinance.invoiceTotal)}`} strong />
                </div>
              )}
              <button onClick={handlePanelSave} disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl shadow-sm transition">
                <Check className="w-5 h-5" /> {saving ? 'Saving…' : panelMode === 'add' ? 'Check In Guest' : 'Save Changes'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ── Sub-components ──

const KpiCard = ({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
}) => {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    slate: 'bg-slate-100 text-slate-500',
    sky: 'bg-sky-50 text-sky-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color] ?? colors.slate}`}>{icon}</div>
      </div>
      <p className="text-lg font-bold text-slate-900 tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
};

const SummaryMetric = ({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 truncate">{label}</p>
    <p className={`text-sm tabular-nums truncate ${strong ? 'font-bold text-sky-800' : 'font-semibold text-slate-800'}`}>{value}</p>
  </div>
);

const CollChip = ({ icon, label, amount, color }: { icon: React.ReactNode; label: string; amount: number; color: string }) => (
  <div className="flex items-center gap-1.5">
    <span className={color}>{icon}</span>
    <span className="text-slate-500">{label}:</span>
    <span className={`font-bold tabular-nums ${color}`}>₹{fmtMoney(amount)}</span>
  </div>
);

const TabButton = ({ active, onClick, icon, label, count }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number;
}) => (
  <button onClick={onClick}
    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition ${
      active ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
    }`}>
    {icon}
    {label}
    {count !== undefined && count > 0 && (
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-500'}`}>
        {count}
      </span>
    )}
  </button>
);

const ReviewRow = ({ label, value, bold, negative }: { label: string; value: string; bold?: boolean; negative?: boolean }) => (
  <div className="flex items-center justify-between">
    <span className={`text-sm ${bold ? 'font-bold text-slate-800' : 'font-medium text-slate-600'}`}>{label}</span>
    <span className={`text-sm tabular-nums font-semibold ${
      bold ? 'text-slate-900 text-base font-bold' : negative ? 'text-rose-600' : 'text-slate-800'
    }`}>{value}</span>
  </div>
);

const TextField = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <label className="block">
    <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
  </label>
);

const DateField = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <label className="block">
    <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
    <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
  </label>
);

const NumField = ({ label, value, onChange, prefix, allowDecimal = true }: {
  label: string; value: number; onChange: (v: number) => void; prefix?: string; allowDecimal?: boolean;
}) => {
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') { onChange(0); return; }
    const n = allowDecimal ? parseFloat(raw) : parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return;
    onChange(n);
  };
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <div className="relative flex items-stretch">
        {prefix && <span className="inline-flex items-center px-3 bg-slate-100 border border-r-0 border-slate-300 rounded-l-xl text-slate-500 text-sm">{prefix}</span>}
        <input type="number" inputMode={allowDecimal ? 'decimal' : 'numeric'} min={0} step={allowDecimal ? '0.01' : '1'}
          value={value === 0 ? '' : value} onChange={handle} placeholder="0"
          className={`flex-1 min-w-0 px-3 py-2.5 text-base border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 ${prefix ? 'rounded-r-xl' : 'rounded-xl'}`} />
      </div>
    </label>
  );
};

const SelectField = ({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: string[] | { value: string; label: string }[];
  onChange: (v: string) => void;
}) => {
  const normalized = options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o
  );
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500">
        {normalized.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
};

const GstSplitFields = ({ row, update, enabled }: {
  row: RoomChartEntryInput;
  update: <K extends keyof RoomChartEntryInput>(key: K, v: RoomChartEntryInput[K]) => void;
  enabled: boolean;
}) => {
  if (!enabled) return null;
  const enteredAmount = toNum(row.total);
  const gstRate = toNum(row.gst_slab);
  const taxableAmount = toNum(row.taxable_amount);
  const gstAmount = toNum(row.gst_amount);
  const finalAmount = toNum(row.invoice_total) || (enteredAmount + gstAmount);
  const totalReceived = toNum(row.pay_cash) + toNum(row.pay_upi) + toNum(row.pay_card) + toNum(row.pay_bank);
  const autoBalance = Math.max(0, finalAmount - totalReceived);
  const splitMatch = Math.abs(totalReceived + autoBalance - finalAmount) < 1;
  return (
    <div className="space-y-3 border-t border-slate-100 pt-3">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">GST Details</div>
      {/* GST Type dropdown - always visible */}
      <label className="block">
        <span className="block text-sm font-medium text-slate-700 mb-1">GST Type <span className="text-rose-500">*</span></span>
        <select value={row.gst_type} onChange={(e) => update('gst_type', e.target.value as GstType)}
          className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500">
          {GST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>
      {/* GST Slab - only shown when not No Scope */}
      {row.gst_type !== 'No Scope' && (
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">GST Rate</span>
          <select value={String(row.gst_slab)} onChange={(e) => update('gst_slab', Number(e.target.value) as GstSlab)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500">
            {GST_SLABS.map((s) => <option key={s} value={String(s)}>{s}%</option>)}
          </select>
        </label>
      )}
      {/* Live calculation display - always visible */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-sky-50 rounded-lg p-2.5 border border-sky-100">
          <span className="text-sky-600 font-medium">Entered Amount</span>
          <p className="font-bold text-slate-800 text-sm mt-0.5">₹{fmtMoney(enteredAmount)}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
          <span className="text-slate-500 font-medium">GST Rate</span>
          <p className="font-bold text-slate-800 text-sm mt-0.5">{row.gst_type === 'No Scope' ? '0% (No Scope)' : `${gstRate}%`}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
          <span className="text-slate-500 font-medium">Taxable Amount</span>
          <p className="font-bold text-slate-800 text-sm mt-0.5">₹{fmtMoney(taxableAmount)}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
          <span className="text-slate-500 font-medium">GST Amount</span>
          <p className="font-bold text-slate-800 text-sm mt-0.5">₹{fmtMoney(gstAmount)}</p>
        </div>
      </div>
      {/* Final Room Amount - highlighted */}
      <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
        <div className="flex items-center justify-between">
          <span className="text-emerald-700 font-semibold text-sm">Final Room Amount</span>
          <p className="font-bold text-emerald-800 text-lg">₹{fmtMoney(finalAmount)}</p>
        </div>
      </div>
      {/* Split Payment */}
      <div className="text-xs font-medium text-slate-500 pt-1">Payment Received (advance = sum of all modes)</div>
      <div className="grid grid-cols-2 gap-3">
        {SPLIT_PAY_MODE_KEYS.map((key) => (
          <NumField key={key} label={SPLIT_PAYMENT_LABELS[key]} prefix="₹"
            value={toNum(row[key])}
            onChange={(v) => update(key, v)} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200">
          <span className="block text-sm font-medium text-slate-500 mb-0.5">Advance (auto)</span>
          <p className="font-bold text-slate-800 text-base">₹{fmtMoney(totalReceived)}</p>
        </div>
        <div className="bg-amber-50 rounded-xl px-3 py-2.5 border border-amber-200">
          <span className="block text-sm font-medium text-amber-600 mb-0.5">Balance (auto)</span>
          <p className="font-bold text-amber-700 text-base">₹{fmtMoney(autoBalance)}</p>
        </div>
      </div>
      <div className={`text-xs font-medium ${splitMatch ? 'text-emerald-600' : 'text-rose-500'}`}>
        {splitMatch ? '✓ Total received + balance matches final amount' : `⚠ Received (₹${fmtMoney(totalReceived)}) + Balance (₹${fmtMoney(autoBalance)}) does not match final (₹${fmtMoney(finalAmount)})`}
      </div>
    </div>
  );
};
