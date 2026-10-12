import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, X, Loader2, AlertCircle, CreditCard, Search,
  Calendar, FileSpreadsheet, RefreshCw, CheckCircle2,
  ArrowDownLeft, ArrowUpRight, ArrowRightLeft, FileText,
  Building2, Users, IndianRupee
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ScreenHeader, fmtMoney } from '@/components/finance-ui';
import { getVouchers, saveVoucher, getChartOfAccounts } from '@/lib/api-accounting';
import type { Voucher, VoucherType, VoucherInput, ChartOfAccount } from '@/lib/types-accounting';
import { VOUCHER_TYPE_LABELS } from '@/lib/types-accounting';

const today = () => new Date().toISOString().slice(0, 10);

type DatePreset = 'today' | 'week' | 'month' | 'all';

export const VouchersScreen = ({ onBack }: { onBack: () => void }) => {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<VoucherType | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('month');
  const [fromDate, setFromDate] = useState(() => `${today().slice(0, 7)}-01`);
  const [toDate, setToDate] = useState(today());

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<VoucherInput>({
    voucher_type: 'receipt',
    voucher_date: today(),
    amount: 0,
    party_name: '',
    party_type: '',
    narration: '',
  });

  const applyDatePreset = (p: DatePreset) => {
    setDatePreset(p);
    const now = new Date();
    if (p === 'today') {
      const t = today();
      setFromDate(t);
      setToDate(t);
    } else if (p === 'week') {
      const w = new Date();
      w.setDate(w.getDate() - 7);
      setFromDate(w.toISOString().slice(0, 10));
      setToDate(today());
    } else if (p === 'month') {
      setFromDate(`${now.toISOString().slice(0, 7)}-01`);
      setToDate(today());
    } else if (p === 'all') {
      setFromDate('2020-01-01');
      setToDate(today());
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [v, a] = await Promise.all([
        getVouchers(fromDate, toDate, filterType || undefined),
        getChartOfAccounts(),
      ]);
      setVouchers(v);
      setAccounts(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load vouchers');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, filterType]);

  useEffect(() => {
    load();
  }, [load]);

  // Handle Voucher Type change with intelligent default accounts
  const handleTypeChange = (newType: VoucherType) => {
    const cashAcct = accounts.find((a) => a.account_code === '1001')?.id;
    const bankAcct = accounts.find((a) => a.account_code === '1002')?.id;
    const guestAcct = accounts.find((a) => a.account_code === '1004')?.id;
    const vendorAcct = accounts.find((a) => a.account_code === '2001')?.id;
    const expAcct = accounts.find((a) => a.account_code === '5001')?.id;

    let deb = form.debit_account_id;
    let cred = form.credit_account_id;

    if (newType === 'receipt') {
      deb = deb || cashAcct || bankAcct;
      cred = cred || guestAcct;
    } else if (newType === 'payment') {
      cred = cred || cashAcct || bankAcct;
      deb = deb || vendorAcct || expAcct;
    } else if (newType === 'contra') {
      deb = bankAcct;
      cred = cashAcct;
    }

    setForm({
      ...form,
      voucher_type: newType,
      debit_account_id: deb,
      credit_account_id: cred,
    });
  };

  const handleOpenNewVoucher = () => {
    const cashAcct = accounts.find((a) => a.account_code === '1001')?.id;
    const guestAcct = accounts.find((a) => a.account_code === '1004')?.id;
    setForm({
      voucher_type: 'receipt',
      voucher_date: today(),
      amount: 0,
      party_name: '',
      party_type: 'guest',
      narration: '',
      debit_account_id: cashAcct,
      credit_account_id: guestAcct,
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.amount <= 0) {
      setError('Voucher amount must be greater than ₹0.');
      return;
    }
    if (!form.debit_account_id || !form.credit_account_id) {
      setError('Both Debit and Credit accounts are required.');
      return;
    }
    if (form.debit_account_id === form.credit_account_id) {
      setError('Debit and Credit cannot be the same account.');
      return;
    }

    setSaving(true);
    try {
      await saveVoucher(form);
      setShowForm(false);
      setSuccess(`Created ${VOUCHER_TYPE_LABELS[form.voucher_type]} voucher for ₹${fmtMoney(form.amount)}`);
      setTimeout(() => setSuccess(null), 3000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const filteredVouchers = useMemo(() => {
    return vouchers.filter((v) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        v.voucher_number.toLowerCase().includes(q) ||
        (v.party_name && v.party_name.toLowerCase().includes(q)) ||
        (v.narration && v.narration.toLowerCase().includes(q)) ||
        v.amount.toString().includes(q)
      );
    });
  }, [vouchers, searchQuery]);

  // Aggregate Metrics
  const totalReceipts = useMemo(
    () => vouchers.filter((v) => v.voucher_type === 'receipt').reduce((s, v) => s + v.amount, 0),
    [vouchers]
  );
  const totalPayments = useMemo(
    () => vouchers.filter((v) => v.voucher_type === 'payment').reduce((s, v) => s + v.amount, 0),
    [vouchers]
  );
  const totalContras = useMemo(
    () => vouchers.filter((v) => v.voucher_type === 'contra').reduce((s, v) => s + v.amount, 0),
    [vouchers]
  );

  const handleExportExcel = () => {
    if (vouchers.length === 0) return;
    const data = filteredVouchers.map((v) => ({
      'Voucher No': v.voucher_number,
      'Type': VOUCHER_TYPE_LABELS[v.voucher_type],
      'Date': v.voucher_date,
      'Party Name': v.party_name || '—',
      'Party Type': v.party_type || '—',
      'Amount (₹)': v.amount,
      'Status': v.status,
      'Narration': v.narration || '—',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Accounting Vouchers');
    XLSX.writeFile(wb, `Vouchers_Register_${today()}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-900/[0.02] text-slate-800 pb-20">
      <ScreenHeader
        title="Accounting Vouchers"
        subtitle="Receipts, Payments, Contra Transfers, Journals & Credit Notes"
        onBack={onBack}
        icon={<CreditCard className="w-5 h-5 text-sky-400" />}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-emerald-600 text-xs font-semibold">
              <span>Receipt Vouchers</span>
              <ArrowDownLeft className="w-3.5 h-3.5" />
            </div>
            <p className="text-xl font-bold text-emerald-600 mt-1 tabular-nums">
              ₹{fmtMoney(totalReceipts)}
            </p>
            <span className="text-[10px] text-emerald-600/70 mt-0.5 block">Guest & client collections</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-rose-600 text-xs font-semibold">
              <span>Payment Vouchers</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
            <p className="text-xl font-bold text-rose-600 mt-1 tabular-nums">
              ₹{fmtMoney(totalPayments)}
            </p>
            <span className="text-[10px] text-rose-600/70 mt-0.5 block">Vendor & expense disbursements</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-sky-600 text-xs font-semibold">
              <span>Contra Transfers</span>
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </div>
            <p className="text-xl font-bold text-sky-600 mt-1 tabular-nums">
              ₹{fmtMoney(totalContras)}
            </p>
            <span className="text-[10px] text-sky-600/70 mt-0.5 block">Cash & bank fund transfers</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-400">Total Vouchers</span>
            <p className="text-xl font-bold text-slate-900 mt-1">{vouchers.length}</p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Double-entry audit slips</span>
          </div>
        </div>

        {/* Action & Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Date preset pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'Last 7 Days' },
                { id: 'month', label: 'This Month' },
                { id: 'all', label: 'All History' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyDatePreset(p.id as DatePreset)}
                  className={`text-xs px-2.5 py-1.5 rounded-xl font-medium transition cursor-pointer ${
                    datePreset === p.id
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export
              </button>
              <button
                type="button"
                onClick={handleOpenNewVoucher}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                New Voucher
              </button>
              <button
                type="button"
                onClick={load}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-600' : ''}`} />
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search voucher #, party, narration..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              {/* Type filter */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as VoucherType | '')}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-700"
              >
                <option value="">All Voucher Types</option>
                {(Object.keys(VOUCHER_TYPE_LABELS) as VoucherType[]).map((t) => (
                  <option key={t} value={t}>
                    {VOUCHER_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Main Vouchers Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-56 text-slate-400 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-sky-600 mr-2" />
              Loading vouchers...
            </div>
          ) : filteredVouchers.length === 0 ? (
            <div className="text-center py-16 text-slate-400 space-y-2">
              <CreditCard className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">No Vouchers Found</p>
              <p className="text-xs text-slate-400">
                {searchQuery ? 'No vouchers match your filter.' : 'Click "+ New Voucher" to record an entry.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Voucher #</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Party Name</th>
                    <th className="px-4 py-3">Narration / Remarks</th>
                    <th className="px-4 py-3 text-right">Amount (₹)</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVouchers.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-4 py-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                        <span className="bg-slate-100 px-2 py-0.5 rounded-md text-slate-800">
                          {v.voucher_number}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                            v.voucher_type === 'receipt'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : v.voucher_type === 'payment'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : v.voucher_type === 'contra'
                              ? 'bg-sky-50 text-sky-700 border border-sky-200'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          {VOUCHER_TYPE_LABELS[v.voucher_type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {v.voucher_date}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {v.party_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 italic max-w-xs truncate">
                        {v.narration || '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
                        ₹{fmtMoney(v.amount)}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            v.status === 'posted'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {v.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* New Voucher Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-sky-600" />
                Record Accounting Voucher
              </h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    Voucher Type *
                  </label>
                  <select
                    value={form.voucher_type}
                    onChange={(e) => handleTypeChange(e.target.value as VoucherType)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                  >
                    {(Object.keys(VOUCHER_TYPE_LABELS) as VoucherType[]).map((t) => (
                      <option key={t} value={t}>
                        {VOUCHER_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    Voucher Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.voucher_date}
                    onChange={(e) => setForm({ ...form, voucher_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    Amount (₹) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-500">₹</span>
                    <input
                      type="number"
                      required
                      min="1"
                      step="any"
                      value={form.amount || ''}
                      onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                      placeholder="0.00"
                      className="w-full pl-8 pr-3 py-2.5 text-base font-bold text-slate-900 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 tabular-nums"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    Party / Beneficiary Name
                  </label>
                  <input
                    type="text"
                    value={form.party_name}
                    onChange={(e) => setForm({ ...form, party_name: e.target.value })}
                    placeholder="Guest Name, Vendor, or Staff Member"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    Debit Account (Dr) *
                  </label>
                  <select
                    required
                    value={form.debit_account_id ?? ''}
                    onChange={(e) => setForm({ ...form, debit_account_id: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">Select Debit Account...</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.account_code} — {a.account_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    Credit Account (Cr) *
                  </label>
                  <select
                    required
                    value={form.credit_account_id ?? ''}
                    onChange={(e) => setForm({ ...form, credit_account_id: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">Select Credit Account...</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.account_code} — {a.account_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    Narration / Purpose
                  </label>
                  <input
                    type="text"
                    value={form.narration}
                    onChange={(e) => setForm({ ...form, narration: e.target.value })}
                    placeholder="e.g. Paid plumber for Room 204 pipe repairs"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Posting Voucher...' : 'Post Voucher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
