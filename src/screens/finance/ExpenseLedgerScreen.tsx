import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  BookOpen, Download, Plus, Search, Calendar, Filter, Trash2, Edit3,
  CheckCircle2, AlertCircle, ArrowUpDown, FileSpreadsheet, FileText, Check,
  Wallet, CreditCard, X, Sparkles, RefreshCw, Layers, DollarSign, Clock,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { ExpenseEntry, ExpenseEntryInput, ExpenseCategory, PaymentMode } from '@/lib/types-finance';
import { PAYMENT_MODES } from '@/lib/types-finance';
import {
  getExpenseEntries, getExpenseCategories, saveExpenseEntry,
  deleteExpenseEntry, toggleExpensePaidStatus, saveExpenseCategory,
} from '@/lib/api-finance';
import { buildExpenseLedgerPDF } from '@/lib/pdf-finance';
import { fmtMoney } from '@/components/finance-ui';
import type { HotelSettings } from '@/lib/types';
import { getSettings } from '@/lib/api';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface ExpenseLedgerScreenProps {
  onBack: () => void;
}

type DatePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'this_fy' | 'custom';
type SortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'category_asc';

const todayIso = () => new Date().toISOString().slice(0, 10);

const getPresetDates = (preset: DatePreset): { from: string; to: string } => {
  const now = new Date();
  const today = todayIso();

  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().slice(0, 10);
      return { from: yStr, to: yStr };
    }
    case 'this_week': {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(d.setDate(diff));
      return { from: monday.toISOString().slice(0, 10), to: today };
    }
    case 'this_month': {
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      return { from: start, to: today };
    }
    case 'last_month': {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const start = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      const end = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return { from: start, to: end };
    }
    case 'this_fy': {
      // Indian Financial Year: April 1 to March 31
      const curYear = now.getFullYear();
      const fyStartYear = now.getMonth() >= 3 ? curYear : curYear - 1;
      const start = `${fyStartYear}-04-01`;
      return { from: start, to: today };
    }
    case 'custom':
    default:
      return {
        from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
        to: today,
      };
  }
};

export const ExpenseLedgerScreen = ({ onBack }: ExpenseLedgerScreenProps) => {
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Filters & Search
  const [activePreset, setActivePreset] = useState<DatePreset>('this_month');
  const initialDates = getPresetDates('this_month');
  const [fromDate, setFromDate] = useState(initialDates.from);
  const [toDate, setToDate] = useState(initialDates.to);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [sortOption, setSortOption] = useState<SortOption>('date_desc');

  // Manual Add / Edit Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ExpenseEntry | null>(null);
  const [savingEntry, setSavingEntry] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; amount: number; head: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [modalForm, setModalForm] = useState<{
    entry_date: string;
    category_name: string;
    amount: number;
    payment_mode: PaymentMode;
    vendor_name: string;
    description: string;
    bill_no: string;
    is_paid: boolean;
    paid_date: string;
  }>({
    entry_date: todayIso(),
    category_name: '',
    amount: 0,
    payment_mode: 'Cash',
    vendor_name: '',
    description: '',
    bill_no: '',
    is_paid: true,
    paid_date: todayIso(),
  });

  // Inline New Category creation state
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [ents, cats, s] = await Promise.all([
        getExpenseEntries(fromDate, toDate),
        getExpenseCategories(true),
        getSettings().catch(() => null),
      ]);
      setEntries(ents);
      setCategories(cats);
      setSettings(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load expense ledger');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Preset change
  const handlePresetSelect = (preset: DatePreset) => {
    setActivePreset(preset);
    if (preset !== 'custom') {
      const dates = getPresetDates(preset);
      setFromDate(dates.from);
      setToDate(dates.to);
    }
  };

  // Open Modal for Add
  const handleOpenAdd = () => {
    setEditingEntry(null);
    setShowNewCatInput(false);
    setNewCatName('');
    const defaultCat = categories.length > 0 ? categories[0].name : '';
    setModalForm({
      entry_date: todayIso(),
      category_name: defaultCat,
      amount: 0,
      payment_mode: 'Cash',
      vendor_name: '',
      description: '',
      bill_no: '',
      is_paid: true,
      paid_date: todayIso(),
    });
    setShowModal(true);
  };

  // Open Modal for Edit
  const handleOpenEdit = (entry: ExpenseEntry) => {
    setEditingEntry(entry);
    setShowNewCatInput(false);
    setNewCatName('');

    // Try to parse vendor from description if formatted as "Vendor: XYZ | Description"
    let vendor = '';
    let desc = entry.description || '';
    if (desc.startsWith('Vendor: ')) {
      const parts = desc.split(' | ');
      vendor = parts[0].replace('Vendor: ', '').trim();
      desc = parts.slice(1).join(' | ').trim();
    }

    setModalForm({
      entry_date: entry.entry_date || todayIso(),
      category_name: entry.category_name || '',
      amount: entry.amount || 0,
      payment_mode: entry.payment_mode || 'Cash',
      vendor_name: vendor,
      description: desc,
      bill_no: entry.bill_no || '',
      is_paid: entry.is_paid ?? true,
      paid_date: entry.paid_date || entry.entry_date || todayIso(),
    });
    setShowModal(true);
  };

  // Save manual expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalForm.category_name.trim()) {
      setError('Please select or create an Expense Head.');
      return;
    }
    if (modalForm.amount <= 0) {
      setError('Amount must be greater than ₹0.');
      return;
    }

    try {
      setSavingEntry(true);
      setError(null);
      const cat = categories.find((c) => c.name.toLowerCase() === modalForm.category_name.toLowerCase());

      // Format description with vendor if provided
      let finalDescription = modalForm.description.trim();
      if (modalForm.vendor_name.trim()) {
        finalDescription = `Vendor: ${modalForm.vendor_name.trim()}${finalDescription ? ` | ${finalDescription}` : ''}`;
      }

      const input: ExpenseEntryInput = {
        entry_date: modalForm.entry_date,
        category_id: cat?.id ?? null,
        category_name: modalForm.category_name.trim(),
        amount: modalForm.amount,
        payment_mode: modalForm.payment_mode,
        description: finalDescription,
        bill_no: modalForm.bill_no.trim(),
        is_paid: modalForm.is_paid,
        paid_date: modalForm.is_paid ? modalForm.paid_date : null,
      };

      if (editingEntry) {
        await saveExpenseEntry(input, editingEntry.id);
        showToast(`Expense voucher updated successfully.`);
      } else {
        await saveExpenseEntry(input);
        showToast(`New expense of ₹${fmtMoney(modalForm.amount)} recorded.`);
      }

      setShowModal(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense');
    } finally {
      setSavingEntry(false);
    }
  };

  // Create new category inline
  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      setSavingCat(true);
      const created = await saveExpenseCategory(newCatName.trim());
      setCategories((prev) => [...prev, created]);
      setModalForm((prev) => ({ ...prev, category_name: created.name }));
      setNewCatName('');
      setShowNewCatInput(false);
      showToast(`Expense head "${created.name}" created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category');
    } finally {
      setSavingCat(false);
    }
  };

  // Delete expense
  const handleDeleteExpense = (id: string, amount: number, head: string) => {
    setDeleteTarget({ id, amount, head });
  };

  const confirmDeleteExpense = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteExpenseEntry(deleteTarget.id);
      setEntries((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      showToast('Expense entry deleted.');
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete expense');
    } finally {
      setIsDeleting(false);
    }
  };

  // Toggle paid status
  const handleTogglePaid = async (entry: ExpenseEntry) => {
    const newStatus = !entry.is_paid;
    try {
      await toggleExpensePaidStatus(entry.id, newStatus, newStatus ? todayIso() : null);
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? { ...e, is_paid: newStatus, paid_date: newStatus ? todayIso() : null }
            : e,
        ),
      );
      showToast(newStatus ? 'Marked as Paid' : 'Marked as Unpaid / Credit');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update payment status');
    }
  };

  // Filtered & Sorted Entries
  const filtered = useMemo(() => {
    let result = entries.filter((e) => {
      if (filterCat && e.category_name !== filterCat) return false;
      if (filterMode && e.payment_mode !== filterMode) return false;
      if (filterStatus === 'paid' && !e.is_paid) return false;
      if (filterStatus === 'unpaid' && e.is_paid) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const inCat = e.category_name.toLowerCase().includes(q);
        const inDesc = (e.description || '').toLowerCase().includes(q);
        const inBill = (e.bill_no || '').toLowerCase().includes(q);
        const inMode = e.payment_mode.toLowerCase().includes(q);
        const inAmt = String(e.amount).includes(q);
        if (!inCat && !inDesc && !inBill && !inMode && !inAmt) return false;
      }
      return true;
    });

    // Sorting
    result.sort((a, b) => {
      if (sortOption === 'date_desc') return b.entry_date.localeCompare(a.entry_date) || b.amount - a.amount;
      if (sortOption === 'date_asc') return a.entry_date.localeCompare(b.entry_date) || a.amount - b.amount;
      if (sortOption === 'amount_desc') return b.amount - a.amount;
      if (sortOption === 'amount_asc') return a.amount - b.amount;
      if (sortOption === 'category_asc') return a.category_name.localeCompare(b.category_name);
      return 0;
    });

    return result;
  }, [entries, filterCat, filterMode, filterStatus, searchQuery, sortOption]);

  // Executive Totals & Analytics
  const totals = useMemo(() => {
    let total = 0;
    let cash = 0;
    let bank = 0;
    let upi = 0;
    let credit = 0;
    let paidTotal = 0;
    let unpaidTotal = 0;
    let unpaidCount = 0;

    const catMap = new Map<string, number>();

    for (const e of filtered) {
      const amt = Number(e.amount) || 0;
      total += amt;
      if (e.payment_mode === 'Cash') cash += amt;
      else if (e.payment_mode === 'Bank') bank += amt;
      else if (e.payment_mode === 'UPI') upi += amt;
      else if (e.payment_mode === 'Credit') credit += amt;

      if (e.is_paid) {
        paidTotal += amt;
      } else {
        unpaidTotal += amt;
        unpaidCount++;
      }

      catMap.set(e.category_name, (catMap.get(e.category_name) ?? 0) + amt);
    }

    const byCategory = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]);
    const topCategory = byCategory.length > 0 ? byCategory[0] : null;

    return {
      total,
      cash,
      bank,
      upi,
      credit,
      paidTotal,
      unpaidTotal,
      unpaidCount,
      byCategory,
      topCategory,
      count: filtered.length,
    };
  }, [filtered]);

  // Export to PDF
  const handleExportPDF = async () => {
    if (!settings) return;
    const doc = await buildExpenseLedgerPDF({
      settings,
      entries: filtered,
      fromDate,
      toDate,
    });
    doc.save(`Hotel-Expense-Ledger-${fromDate}-to-${toDate}.pdf`);
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    const dataRows = filtered.map((e, idx) => ({
      'Sr. No': idx + 1,
      'Date': e.entry_date,
      'Expense Head': e.category_name,
      'Amount (INR)': e.amount,
      'Payment Mode': e.payment_mode,
      'Status': e.is_paid ? 'Paid' : 'Unpaid / Credit',
      'Paid Date': e.paid_date || '—',
      'Bill / Voucher No': e.bill_no || '—',
      'Description / Particulars': e.description || '—',
    }));

    const ws = XLSX.utils.json_to_sheet(dataRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
    XLSX.writeFile(wb, `Hotel-Expense-Ledger-${fromDate}-to-${toDate}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-900/[0.02] text-slate-800 pb-20">
      {/* ── Top Sticky Header ── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-slate-200/80 shadow-xs px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 -ml-2 hover:bg-slate-100 rounded-xl text-slate-600 transition cursor-pointer"
              title="Back to Finance Hub"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-600 to-blue-500 text-white flex items-center justify-center shadow-md shadow-sky-500/20 shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  Expense Audit Ledger
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold">
                  {totals.count} Vouchers
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Detailed hotel expenditure, payment modes & voucher audits
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              disabled={filtered.length === 0}
              className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Download Excel Spreadsheet"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden md:inline">Excel</span>
            </button>
            <button
              onClick={handleExportPDF}
              disabled={!settings || filtered.length === 0}
              className="px-3 py-2 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Export PDF Report"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden md:inline">PDF</span>
            </button>
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-sky-500/20 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add Expense</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Content Container ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        {/* Error / Success Toast alerts */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3.5 flex items-center justify-between shadow-2xs animate-fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg text-red-600 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successToast && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-3.5 flex items-center gap-2 shadow-2xs animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{successToast}</span>
          </div>
        )}

        {/* ── Executive KPI Metric Strip ── */}
        <section className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* KPI 1: Total Spent */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Expenses</span>
              <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                ₹{fmtMoney(totals.total)}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                {totals.count} entries across {totals.byCategory.length} heads
              </p>
            </div>
          </div>

          {/* KPI 2: Cash Outflow */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cash Disbursed</span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <h3 className="text-xl sm:text-2xl font-black text-amber-700 tracking-tight">
                ₹{fmtMoney(totals.cash)}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                {totals.total > 0 ? `${Math.round((totals.cash / totals.total) * 100)}% of total` : '0%'}
              </p>
            </div>
          </div>

          {/* KPI 3: Bank & UPI */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Bank & UPI</span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <h3 className="text-xl sm:text-2xl font-black text-blue-700 tracking-tight">
                ₹{fmtMoney(totals.bank + totals.upi)}
              </h3>
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium mt-0.5">
                <span>Bank: ₹{fmtMoney(totals.bank)}</span>
                <span>UPI: ₹{fmtMoney(totals.upi)}</span>
              </div>
            </div>
          </div>

          {/* KPI 4: Pending / Credit */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pending Credit</span>
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <h3 className="text-xl sm:text-2xl font-black text-rose-700 tracking-tight">
                ₹{fmtMoney(totals.unpaidTotal)}
              </h3>
              <p className="text-[11px] text-rose-500 font-semibold mt-0.5">
                {totals.unpaidCount > 0 ? `${totals.unpaidCount} unpaid bills` : 'All cleared'}
              </p>
            </div>
          </div>

          {/* KPI 5: Top Category */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Top Head</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <h3 className="text-base sm:text-lg font-black text-slate-800 truncate" title={totals.topCategory ? totals.topCategory[0] : 'None'}>
                {totals.topCategory ? totals.topCategory[0] : 'None'}
              </h3>
              <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                ₹{fmtMoney(totals.topCategory ? totals.topCategory[1] : 0)}
              </p>
            </div>
          </div>
        </section>

        {/* ── Search, Date Presets & Filter Bar ── */}
        <section className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3.5">
          {/* Top Row: Date Presets */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide mr-1">Period:</span>
              {(
                [
                  { id: 'today', label: 'Today' },
                  { id: 'yesterday', label: 'Yesterday' },
                  { id: 'this_week', label: 'This Week' },
                  { id: 'this_month', label: 'This Month' },
                  { id: 'last_month', label: 'Last Month' },
                  { id: 'this_fy', label: 'This FY' },
                  { id: 'custom', label: 'Custom' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetSelect(preset.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    activePreset === preset.id
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <button
              onClick={loadData}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer ml-auto"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Bottom Row: Date Pickers + Search + Head & Mode Dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1 border-t border-slate-100">
            {/* Search Box */}
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search payee, bill #, note, head..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Expense Head Selector */}
            <div>
              <select
                value={filterCat}
                onChange={(e) => setFilterCat(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 transition cursor-pointer"
              >
                <option value="">All Expense Heads</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Mode Selector */}
            <div>
              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 transition cursor-pointer"
              >
                <option value="">All Payment Modes</option>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m === 'Credit' ? 'Credit / Pay Later' : m}
                  </option>
                ))}
              </select>
            </div>

            {/* Status & Sort */}
            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | 'paid' | 'unpaid')}
                className="w-1/2 px-2.5 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 transition cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>

              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="w-1/2 px-2.5 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 transition cursor-pointer"
              >
                <option value="date_desc">Newest</option>
                <option value="date_asc">Oldest</option>
                <option value="amount_desc">Highest ₹</option>
                <option value="amount_asc">Lowest ₹</option>
                <option value="category_asc">Head A-Z</option>
              </select>
            </div>
          </div>

          {/* Custom Date Pickers when 'custom' is active */}
          {activePreset === 'custom' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 items-center">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                />
              </div>
              <div className="col-span-2 flex items-end">
                <span className="text-xs text-slate-500 font-medium">
                  Showing {filtered.length} vouchers between {fromDate} and {toDate}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* ── Category Breakdown Pills / Mini-bars ── */}
        {totals.byCategory.length > 0 && (
          <section className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-600" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-600">
                  Head-Wise Spend Breakdown ({totals.byCategory.length} Categories)
                </h3>
              </div>
              <span className="text-xs font-bold text-slate-400">
                Total ₹{fmtMoney(totals.total)}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {totals.byCategory.slice(0, 6).map(([cat, amt]) => {
                const pct = totals.total > 0 ? Math.round((amt / totals.total) * 100) : 0;
                const isSelected = filterCat === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setFilterCat(isSelected ? '' : cat)}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-sky-500 bg-sky-50/70 shadow-xs'
                        : 'border-slate-100 bg-slate-50/50 hover:bg-slate-100/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-slate-800 truncate" title={cat}>
                        {cat}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">{pct}%</span>
                    </div>
                    <div className="mt-1.5">
                      <p className="text-sm font-black text-slate-900 tabular-nums">
                        ₹{fmtMoney(amt)}
                      </p>
                      <div className="w-full bg-slate-200 h-1 rounded-full mt-1 overflow-hidden">
                        <div
                          className="bg-sky-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Main Ledger Table & Cards ── */}
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-700">
                Expenditure Register
              </h2>
              <span className="text-xs font-semibold text-slate-400">
                ({filtered.length} {filtered.length === 1 ? 'entry' : 'entries'})
              </span>
            </div>
            {filtered.length > 0 && (
              <span className="text-xs font-bold text-slate-900">
                Sum: ₹{fmtMoney(totals.total)}
              </span>
            )}
          </div>

          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-sky-500" />
              <p className="text-sm font-semibold">Loading expense ledger...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 px-4 text-center max-w-md mx-auto space-y-4">
              <div className="w-14 h-14 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                <BookOpen className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">No Expenses Found</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {searchQuery || filterCat || filterMode || filterStatus !== 'all'
                    ? 'No records match your active filters or search terms. Try clearing filters.'
                    : `No operational expenses have been recorded between ${fromDate} and ${toDate}.`}
                </p>
              </div>
              <button
                onClick={handleOpenAdd}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-sky-500/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Manual Expense
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200/70 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-3 sm:px-4">Date</th>
                    <th className="py-3 px-3 sm:px-4">Expense Head</th>
                    <th className="py-3 px-3 sm:px-4">Particulars & Payee</th>
                    <th className="py-3 px-3 sm:px-4">Bill / Voucher</th>
                    <th className="py-3 px-3 sm:px-4">Payment Mode</th>
                    <th className="py-3 px-3 sm:px-4">Status</th>
                    <th className="py-3 px-3 sm:px-4 text-right">Amount</th>
                    <th className="py-3 px-3 sm:px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((entry) => {
                    return (
                      <tr
                        key={entry.id}
                        className="hover:bg-slate-50/70 transition-colors group"
                      >
                        {/* Date */}
                        <td className="py-3 px-3 sm:px-4 font-medium text-slate-600 whitespace-nowrap">
                          {entry.entry_date}
                        </td>

                        {/* Head */}
                        <td className="py-3 px-3 sm:px-4 font-bold text-slate-900 whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-100 text-xs font-bold inline-block">
                            {entry.category_name}
                          </span>
                        </td>

                        {/* Particulars & Payee */}
                        <td className="py-3 px-3 sm:px-4 text-slate-700 max-w-xs truncate font-medium">
                          {entry.description || <span className="text-slate-400 italic">No notes</span>}
                        </td>

                        {/* Bill No */}
                        <td className="py-3 px-3 sm:px-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                          {entry.bill_no ? (
                            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                              #{entry.bill_no}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        {/* Payment Mode */}
                        <td className="py-3 px-3 sm:px-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              entry.payment_mode === 'Cash'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : entry.payment_mode === 'UPI'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : entry.payment_mode === 'Bank'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {entry.payment_mode}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 sm:px-4 whitespace-nowrap">
                          {entry.is_paid ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                              <Check className="w-3 h-3 text-emerald-600" /> Paid
                            </span>
                          ) : (
                            <button
                              onClick={() => handleTogglePaid(entry)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-full cursor-pointer transition"
                              title="Click to mark as Paid"
                            >
                              <Clock className="w-3 h-3 text-rose-500" /> Pending (Pay)
                            </button>
                          )}
                        </td>

                        {/* Amount */}
                        <td className="py-3 px-3 sm:px-4 text-right font-black text-slate-900 tabular-nums whitespace-nowrap">
                          ₹{fmtMoney(entry.amount)}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 sm:px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleOpenEdit(entry)}
                              className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition cursor-pointer"
                              title="Edit Expense Entry"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteExpense(entry.id, entry.amount, entry.category_name)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Delete Expense Entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-800">
                    <td colSpan={6} className="py-3.5 px-4 text-slate-600 uppercase text-xs tracking-wider">
                      Ledger Total ({filtered.length} Entries)
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-slate-900 text-sm sm:text-base tabular-nums">
                      ₹{fmtMoney(totals.total)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* ── Manual Add / Edit Expense Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh] animate-scale-up">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-sky-900 via-blue-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white">
                  {editingEntry ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">
                    {editingEntry ? 'Edit Expense Voucher' : 'Record Manual Expense'}
                  </h3>
                  <p className="text-[11px] text-sky-200 font-medium">
                    {editingEntry ? 'Update expenditure voucher details' : 'Post cash, bank, or vendor payment'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 hover:bg-white/10 rounded-xl text-sky-200 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveExpense} className="p-5 overflow-y-auto space-y-4">
              {/* Row 1: Date & Head */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide block mb-1">
                    Expense Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={modalForm.entry_date}
                    onChange={(e) => setModalForm({ ...modalForm, entry_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                      Expense Head *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowNewCatInput(!showNewCatInput)}
                      className="text-[11px] text-sky-600 hover:text-sky-700 font-bold cursor-pointer"
                    >
                      {showNewCatInput ? 'Cancel' : '+ New Head'}
                    </button>
                  </div>

                  {!showNewCatInput ? (
                    <select
                      required
                      value={modalForm.category_name}
                      onChange={(e) => setModalForm({ ...modalForm, category_name: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                    >
                      <option value="">— Select Category —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="e.g. Linen Laundry"
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <button
                        type="button"
                        onClick={handleCreateCategory}
                        disabled={savingCat || !newCatName.trim()}
                        className="px-3 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold cursor-pointer"
                      >
                        {savingCat ? '...' : 'Add'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: Amount & Payment Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide block mb-1">
                    Amount (₹) *
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-slate-400 font-bold text-sm">₹</span>
                    <input
                      type="number"
                      required
                      min={1}
                      step="0.01"
                      placeholder="0.00"
                      value={modalForm.amount || ''}
                      onChange={(e) => setModalForm({ ...modalForm, amount: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-8 pr-3 py-2 text-base font-black text-slate-900 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide block mb-1">
                    Payment Mode *
                  </label>
                  <select
                    value={modalForm.payment_mode}
                    onChange={(e) => setModalForm({ ...modalForm, payment_mode: e.target.value as PaymentMode })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                  >
                    {PAYMENT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m === 'Credit' ? 'Credit (Pay Later / Pending)' : m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Vendor / Payee & Bill No */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide block mb-1">
                    Payee / Vendor Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Metro Wholesale / Local Electrician"
                    value={modalForm.vendor_name}
                    onChange={(e) => setModalForm({ ...modalForm, vendor_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide block mb-1">
                    Bill / Voucher / Invoice No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2026-089"
                    value={modalForm.bill_no}
                    onChange={(e) => setModalForm({ ...modalForm, bill_no: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Row 4: Description / Particulars */}
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide block mb-1">
                  Description / Remarks
                </label>
                <textarea
                  rows={2}
                  placeholder="Purpose of expense, quantity, item details..."
                  value={modalForm.description}
                  onChange={(e) => setModalForm({ ...modalForm, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                />
              </div>

              {/* Row 5: Payment Clearance Status */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modalForm.is_paid}
                    onChange={(e) => setModalForm({ ...modalForm, is_paid: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    Expense Paid & Cleared
                  </span>
                </label>

                {modalForm.is_paid && (
                  <div className="pt-2 border-t border-slate-200/70 flex items-center gap-3">
                    <span className="text-[11px] font-semibold text-slate-500">Paid On:</span>
                    <input
                      type="date"
                      value={modalForm.paid_date}
                      onChange={(e) => setModalForm({ ...modalForm, paid_date: e.target.value })}
                      className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEntry}
                  className="flex-1 px-4 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 rounded-xl transition shadow-md shadow-sky-500/20 cursor-pointer disabled:opacity-50"
                >
                  {savingEntry ? 'Saving...' : editingEntry ? 'Update Voucher' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteExpense}
        title="Delete Expense Entry?"
        variant="danger"
        confirmText="Yes, Delete Expense"
        message={
          deleteTarget ? (
            <span>
              Are you sure you want to permanently delete this expense of{' '}
              <strong className="text-slate-900">₹{fmtMoney(deleteTarget.amount)}</strong> for{' '}
              <strong className="text-slate-900">{deleteTarget.head}</strong>?
            </span>
          ) : ''
        }
        loading={isDeleting}
      />
    </div>
  );
};
