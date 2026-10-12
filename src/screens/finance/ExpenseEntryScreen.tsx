import { useEffect, useState, useMemo } from 'react';
import {
  Wallet, Plus, Trash2, CheckCircle2, BookOpen, Clock,
  ArrowRight, Search, Edit3, X, Filter, Building2, CreditCard,
  IndianRupee, Tag, AlertCircle, RefreshCw
} from 'lucide-react';
import type { ExpenseCategory, ExpenseEntry, ExpenseEntryInput, PaymentMode } from '@/lib/types-finance';
import { PAYMENT_MODES } from '@/lib/types-finance';
import {
  getExpenseCategories, getExpenseEntries, saveExpenseEntry,
  deleteExpenseEntry, saveExpenseCategory, toggleExpensePaidStatus
} from '@/lib/api-finance';
import { ScreenHeader, Banner, fmtMoney } from '@/components/finance-ui';

interface ExpenseEntryScreenProps {
  onBack: () => void;
  onNavigate?: (screen: string) => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

// Preset quick categories for hotels
const COMMON_CATEGORIES = [
  'Kitchen & Food',
  'Housekeeping Supplies',
  'Maintenance & Repairs',
  'Linen & Laundry',
  'Electricity & DG Fuel',
  'Staff Wages & Advance',
  'Office & Stationery',
  'Other'
];

const PRESET_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

export const ExpenseEntryScreen = ({ onBack, onNavigate }: ExpenseEntryScreenProps) => {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(today());
  const [categoryName, setCategoryName] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [payeeName, setPayeeName] = useState('');
  const [description, setDescription] = useState('');
  const [billNo, setBillNo] = useState('');
  const [isPaid, setIsPaid] = useState(true);
  const [paidDate, setPaidDate] = useState(today());

  // Inline new category modal
  const [showNewCatModal, setShowNewCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatCreating, setNewCatCreating] = useState(false);

  // Recent entries search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPaid, setFilterPaid] = useState<'all' | 'paid' | 'unpaid'>('all');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [cats, ents] = await Promise.all([
        getExpenseCategories(),
        getExpenseEntries(`${today().slice(0, 8)}01`, today()),
      ]);
      setCategories(cats);
      setEntries(ents);
      if (cats.length > 0 && !categoryName) {
        setCategoryName(cats[0].name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load expense data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quick category selection
  const handleSelectCategory = (cat: string) => {
    setCategoryName(cat);
  };

  const handleAddAmount = (val: number) => {
    setAmount((prev) => (Number(prev) || 0) + val);
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      setNewCatCreating(true);
      const created = await saveExpenseCategory(newCatName.trim());
      setCategories((prev) => [...prev, created]);
      setCategoryName(created.name);
      setNewCatName('');
      setShowNewCatModal(false);
      setSuccess(`Created expense head "${created.name}"`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create category');
    } finally {
      setNewCatCreating(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setCategoryName(categories[0]?.name || '');
    setAmount(0);
    setPaymentMode('Cash');
    setPayeeName('');
    setDescription('');
    setBillNo('');
    setIsPaid(true);
    setPaidDate(today());
  };

  const handleStartEdit = (entry: ExpenseEntry) => {
    setEditingId(entry.id);
    setEntryDate(entry.entry_date);
    setCategoryName(entry.category_name);
    setAmount(entry.amount);
    setPaymentMode(entry.payment_mode);
    setBillNo(entry.bill_no || '');
    setIsPaid(entry.is_paid);
    setPaidDate(entry.paid_date || entry.entry_date);

    // Extract vendor and notes
    if (entry.description) {
      if (entry.description.startsWith('Vendor: ')) {
        const parts = entry.description.split(' | ');
        setPayeeName(parts[0].replace('Vendor: ', ''));
        setDescription(parts.slice(1).join(' | '));
      } else {
        setPayeeName('');
        setDescription(entry.description);
      }
    } else {
      setPayeeName('');
      setDescription('');
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!categoryName) {
      setError('Please select an Expense Head.');
      return;
    }
    if (amount <= 0) {
      setError('Please enter a valid amount greater than ₹0.');
      return;
    }

    try {
      setSaving(true);
      const cat = categories.find((c) => c.name === categoryName);
      
      let fullDescription = description.trim();
      if (payeeName.trim()) {
        fullDescription = `Vendor: ${payeeName.trim()}${fullDescription ? ' | ' + fullDescription : ''}`;
      }

      const input: ExpenseEntryInput = {
        entry_date: entryDate,
        category_id: cat?.id ?? null,
        category_name: categoryName,
        amount: Number(amount),
        payment_mode: paymentMode,
        description: fullDescription,
        bill_no: billNo.trim(),
        is_paid: isPaid,
        paid_date: isPaid ? paidDate : null,
      };

      const saved = await saveExpenseEntry(input, editingId || undefined);

      if (editingId) {
        setEntries((prev) => prev.map((item) => (item.id === editingId ? saved : item)));
        setSuccess(`Updated expense entry of ₹${fmtMoney(amount)} for ${categoryName}`);
      } else {
        setEntries((prev) => [saved, ...prev]);
        setSuccess(`Recorded expense of ₹${fmtMoney(amount)} for ${categoryName}`);
      }

      resetForm();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense entry?')) return;
    try {
      await deleteExpenseEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (editingId === id) resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const handleTogglePaid = async (entry: ExpenseEntry) => {
    const nextStatus = !entry.is_paid;
    try {
      await toggleExpensePaidStatus(entry.id, nextStatus, nextStatus ? today() : null);
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? { ...e, is_paid: nextStatus, paid_date: nextStatus ? today() : null }
            : e
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update payment status');
    }
  };

  // Recent entries filtering
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (filterPaid === 'paid' && !e.is_paid) return false;
      if (filterPaid === 'unpaid' && e.is_paid) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        e.category_name.toLowerCase().includes(q) ||
        (e.description && e.description.toLowerCase().includes(q)) ||
        (e.bill_no && e.bill_no.toLowerCase().includes(q)) ||
        e.payment_mode.toLowerCase().includes(q) ||
        e.amount.toString().includes(q)
      );
    });
  }, [entries, searchQuery, filterPaid]);

  // Aggregate stats
  const todayTotal = useMemo(() => {
    return entries
      .filter((e) => e.entry_date === today())
      .reduce((sum, e) => sum + e.amount, 0);
  }, [entries]);

  const mtdTotal = useMemo(() => {
    return entries.reduce((sum, e) => sum + e.amount, 0);
  }, [entries]);

  const unpaidTotal = useMemo(() => {
    return entries.filter((e) => !e.is_paid).reduce((sum, e) => sum + e.amount, 0);
  }, [entries]);

  return (
    <div className="min-h-screen bg-slate-900/[0.02] text-slate-800 pb-28">
      {/* ── Screen Header ── */}
      <ScreenHeader
        title={editingId ? 'Edit Expense Voucher' : 'Add Expense Voucher'}
        subtitle="Record petty cash, vendor payouts, supplies & repairs"
        onBack={onBack}
        icon={<Wallet className="w-5 h-5 text-sky-400" />}
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-6">
        {/* ── Top Executive Action Bar ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-600 font-bold shrink-0">
              <IndianRupee className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Direct Expense Entry</h2>
              <p className="text-xs text-slate-500">Record cash & credit vouchers directly into hotel ledger</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('expense-ledger')}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition border border-indigo-200 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                View Full Ledger
                <ArrowRight className="w-3 h-3 ml-0.5" />
              </button>
            )}
            <button
              type="button"
              onClick={loadData}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
              title="Refresh Entries"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── KPI Summary Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Today's Expenses</span>
              <Clock className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <p className="text-lg font-bold text-slate-900 mt-1 tabular-nums">
              ₹{fmtMoney(todayTotal)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Recorded for {today()}</p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>MTD Total</span>
              <Wallet className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <p className="text-lg font-bold text-indigo-600 mt-1 tabular-nums">
              ₹{fmtMoney(mtdTotal)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">{entries.length} vouchers this month</p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Unpaid / Due</span>
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <p className="text-lg font-bold text-amber-600 mt-1 tabular-nums">
              ₹{fmtMoney(unpaidTotal)}
            </p>
            <p className="text-[10px] text-amber-600/70 mt-0.5 font-medium">Credit / Pending payment</p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Active Heads</span>
              <Tag className="w-3.5 h-3.5 text-sky-500" />
            </div>
            <p className="text-lg font-bold text-slate-900 mt-1">
              {categories.length}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Categorized accounting heads</p>
          </div>
        </div>

        {error && <Banner kind="error">{error}</Banner>}
        {success && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium rounded-xl p-3 shadow-2xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ── LEFT: Expense Entry Form (7 cols) ── */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-sky-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  {editingId ? 'Update Expense Voucher' : 'Record New Expense'}
                </h3>
              </div>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              {/* Row 1: Date & Presets */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center justify-between">
                  <span>Entry Date *</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEntryDate(today())}
                      className={`text-[11px] px-2 py-0.5 rounded-md font-semibold transition cursor-pointer ${
                        entryDate === today()
                          ? 'bg-sky-100 text-sky-700'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setEntryDate(yesterday())}
                      className={`text-[11px] px-2 py-0.5 rounded-md font-semibold transition cursor-pointer ${
                        entryDate === yesterday()
                          ? 'bg-sky-100 text-sky-700'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Yesterday
                    </button>
                  </div>
                </label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>

              {/* Row 2: Expense Category / Head */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-600">
                    Expense Head / Category *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowNewCatModal(true)}
                    className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Head
                  </button>
                </div>

                {/* Quick selection chips */}
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {COMMON_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleSelectCategory(cat)}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition cursor-pointer ${
                        categoryName === cat
                          ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <select
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                >
                  <option value="">— Select from all categories —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Row 3: Amount with Quick Presets */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center justify-between">
                  <span>Expense Amount (₹) *</span>
                  <span className="text-[11px] text-slate-400">Add preset:</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-base">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={amount === 0 ? '' : amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2.5 text-base font-bold text-slate-900 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 tabular-nums"
                    required
                  />
                </div>
                {/* Preset amount pills */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {PRESET_AMOUNTS.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleAddAmount(val)}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                    >
                      +₹{val}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAmount(0)}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 hover:bg-rose-100 transition cursor-pointer ml-auto"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Row 4: Payment Mode & Payee */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                    Payment Mode *
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) => {
                      const mode = e.target.value as PaymentMode;
                      setPaymentMode(mode);
                      if (mode === 'Credit') setIsPaid(false);
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {PAYMENT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m === 'Credit' ? 'Credit / Pay Later (Udhaar)' : m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                    Payee / Vendor / Person
                  </label>
                  <input
                    type="text"
                    value={payeeName}
                    onChange={(e) => setPayeeName(e.target.value)}
                    placeholder="e.g. Ramesh Grocery, Shyam Plumber"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Row 5: Bill/Invoice Number */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                  Bill / Invoice / Voucher Number
                </label>
                <input
                  type="text"
                  value={billNo}
                  onChange={(e) => setBillNo(e.target.value)}
                  placeholder="e.g. INV-2024-001 or Cash Memo #"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-xs"
                />
              </div>

              {/* Row 6: Remarks / Description */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                  Remarks / Expense Details
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Notes on items purchased, room number, or purpose..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                />
              </div>

              {/* Row 7: Payment Status Toggle */}
              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isPaid}
                    onChange={(e) => setIsPaid(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300"
                  />
                  <div>
                    <span className="text-sm font-semibold text-slate-800">
                      Amount Paid Now
                    </span>
                    <span className="text-xs text-slate-400 block">
                      {isPaid ? 'Cash/Bank disbursed immediately' : 'Keep as pending liability / credit'}
                    </span>
                  </div>
                </label>

                {isPaid && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">Paid On:</span>
                    <input
                      type="date"
                      value={paidDate}
                      onChange={(e) => setPaidDate(e.target.value)}
                      className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? (
                    <>Saving Expense...</>
                  ) : editingId ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" /> Update Expense Voucher
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" /> Save Expense Entry (₹{fmtMoney(amount)})
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* ── RIGHT: Recent Expenses List (5 cols) ── */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col h-[680px]">
            {/* Header with Search */}
            <div className="p-4 border-b border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <h3 className="font-bold text-slate-800 text-sm">
                    Recent Expenses ({entries.length})
                  </h3>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setFilterPaid('all')}
                    className={`px-2 py-0.5 rounded-md transition ${
                      filterPaid === 'all' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterPaid('paid')}
                    className={`px-2 py-0.5 rounded-md transition ${
                      filterPaid === 'paid' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    Paid
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterPaid('unpaid')}
                    className={`px-2 py-0.5 rounded-md transition ${
                      filterPaid === 'unpaid' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    Unpaid
                  </button>
                </div>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search head, vendor, bill #, note..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* List Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 divide-y divide-slate-50">
              {loading ? (
                <div className="text-center py-12 text-slate-400 text-xs">Loading entries...</div>
              ) : filteredEntries.length === 0 ? (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <Wallet className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs">No matching expenses found.</p>
                </div>
              ) : (
                filteredEntries.map((e) => {
                  let payee = '';
                  let note = e.description || '';
                  if (note.startsWith('Vendor: ')) {
                    const spl = note.split(' | ');
                    payee = spl[0].replace('Vendor: ', '');
                    note = spl.slice(1).join(' | ');
                  }

                  return (
                    <div
                      key={e.id}
                      className="pt-2 first:pt-0 group hover:bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 transition space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-slate-900">
                              {e.category_name}
                            </span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {e.payment_mode}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleTogglePaid(e)}
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition ${
                                e.is_paid
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              }`}
                              title="Click to toggle paid/pending status"
                            >
                              {e.is_paid ? 'PAID' : 'PENDING'}
                            </button>
                          </div>
                          {payee && (
                            <p className="text-xs font-semibold text-slate-700 mt-0.5">
                              {payee}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-extrabold text-slate-900 tabular-nums">
                            ₹{fmtMoney(e.amount)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                        <div className="flex items-center gap-2 text-slate-400">
                          <span>{e.entry_date}</span>
                          {e.bill_no && <span className="font-mono">#{e.bill_no}</span>}
                        </div>
                        <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(e)}
                            className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded transition"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(e.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {note && (
                        <p className="text-[11px] text-slate-500 italic bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                          {note}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Footer */}
            {onNavigate && (
              <div className="p-3 border-t border-slate-100 bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => onNavigate('expense-ledger')}
                  className="w-full py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Open Detailed Expense Ledger & Audits
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Modal: Create New Expense Head ── */}
      {showNewCatModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-sky-600" />
                New Expense Head
              </h4>
              <button
                type="button"
                onClick={() => setShowNewCatModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateCategory} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">
                  Category / Head Name *
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g. Pest Control, Generator Fuel..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewCatModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={newCatCreating || !newCatName.trim()}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-2xs transition disabled:opacity-50 cursor-pointer"
                >
                  {newCatCreating ? 'Adding...' : 'Create Head'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
