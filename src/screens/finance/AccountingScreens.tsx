import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2, AlertCircle, Clock, X, Plus, Wallet, Users,
  Building2, Plane, Search, Edit3, Trash2, CheckCircle2,
  FileSpreadsheet, Phone, Mail, FileText, Check, Filter,
  ArrowRight, ExternalLink, RefreshCw, ChevronRight, Landmark,
  CreditCard, ShieldAlert, ArrowDownLeft, ArrowUpRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ScreenHeader, fmtMoney } from '@/components/finance-ui';
import {
  getTrialBalance, getVendors, saveVendor, deleteVendor,
  getOTASettlements, getFinanceExceptions, resolveFinanceException
} from '@/lib/api-accounting';
import type {
  TrialBalanceRow, Vendor, VendorInput, OTASettlement,
  FinanceException, ExceptionStatus
} from '@/lib/types-accounting';

const today = () => new Date().toISOString().slice(0, 10);

// ─────────────────────────────────────────────────────────────
// 1. RECEIVABLES SCREEN (Accounts Receivable - AR)
// ─────────────────────────────────────────────────────────────
export const ReceivablesScreen = ({
  onBack,
  onNavigate,
}: {
  onBack: () => void;
  onNavigate?: (screen: string) => void;
}) => {
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tb = await getTrialBalance('1900-01-01', today());
      setRows(
        tb.filter(
          (r) =>
            ['1004', '1005', '1006', '1007'].includes(r.account_code) &&
            (r.closing_debit > 0 || r.closing_credit > 0)
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load receivables');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(
    () => rows.reduce((s, r) => s + r.closing_debit - r.closing_credit, 0),
    [rows]
  );

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(
      (r) =>
        r.account_name.toLowerCase().includes(q) ||
        r.account_code.toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  const handleExportExcel = () => {
    if (rows.length === 0) return;
    const data = rows.map((r) => ({
      'Account Code': r.account_code,
      'Account Name / Type': r.account_name,
      'Group': r.account_group as string,
      'Closing Debit (₹)': r.closing_debit,
      'Closing Credit (₹)': r.closing_credit,
      'Net Outstanding Receivable (₹)': r.closing_debit - r.closing_credit,
    }));
    data.push({
      'Account Code': 'TOTAL',
      'Account Name / Type': 'Total Accounts Receivable',
      'Group': '',
      'Closing Debit (₹)': 0,
      'Closing Credit (₹)': 0,
      'Net Outstanding Receivable (₹)': total,
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Accounts Receivable');
    XLSX.writeFile(wb, `Accounts_Receivable_${today()}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-900/[0.02] text-slate-800 pb-20">
      <ScreenHeader
        title="Accounts Receivable (AR)"
        subtitle={`Total Outstanding: ₹${fmtMoney(total)} · Guest, Corporate & OTA Ledgers`}
        onBack={onBack}
        icon={<Clock className="w-5 h-5 text-sky-400" />}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Top KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-400">Total Receivables</span>
            <p className="text-xl font-bold text-amber-600 mt-1 tabular-nums">
              ₹{fmtMoney(total)}
            </p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Net pending collections</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-400">Guest City Ledger</span>
            <p className="text-xl font-bold text-slate-800 mt-1 tabular-nums">
              ₹{fmtMoney(
                rows.find((r) => r.account_code === '1004')
                  ? (rows.find((r) => r.account_code === '1004')!.closing_debit -
                     rows.find((r) => r.account_code === '1004')!.closing_credit)
                  : 0
              )}
            </p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Guest credit balances</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-400">Corporate & Agents</span>
            <p className="text-xl font-bold text-slate-800 mt-1 tabular-nums">
              ₹{fmtMoney(
                rows.find((r) => r.account_code === '1005')
                  ? (rows.find((r) => r.account_code === '1005')!.closing_debit -
                     rows.find((r) => r.account_code === '1005')!.closing_credit)
                  : 0
              )}
            </p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">B2B client invoices</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-400">OTA Receivables</span>
            <p className="text-xl font-bold text-slate-800 mt-1 tabular-nums">
              ₹{fmtMoney(
                rows.find((r) => r.account_code === '1006')
                  ? (rows.find((r) => r.account_code === '1006')!.closing_debit -
                     rows.find((r) => r.account_code === '1006')!.closing_credit)
                  : 0
              )}
            </p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">MMT, Agoda, Booking</span>
          </div>
        </div>

        {/* Action & Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search receivable account..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Excel
            </button>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('ledgers')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 transition cursor-pointer"
              >
                <Wallet className="w-3.5 h-3.5" />
                City Ledgers
              </button>
            )}
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

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-56 text-slate-400 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-sky-600 mr-2" />
              Loading receivables ledger...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-16 text-slate-400 space-y-2">
              <Clock className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">No Outstanding Receivables</p>
              <p className="text-xs text-slate-400">All guest and corporate dues are fully collected.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Receivable Account Type</th>
                    <th className="px-4 py-3 text-right">Debit (₹)</th>
                    <th className="px-4 py-3 text-right">Credit (₹)</th>
                    <th className="px-4 py-3 text-right">Net Outstanding</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((r) => {
                    const net = r.closing_debit - r.closing_credit;
                    return (
                      <tr key={r.account_id} className="hover:bg-slate-50/70 transition">
                        <td className="px-4 py-3 font-mono font-bold text-slate-600">
                          {r.account_code}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {r.account_name}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                          ₹{fmtMoney(r.closing_debit)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                          ₹{fmtMoney(r.closing_credit)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-amber-600">
                          ₹{fmtMoney(net)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Outstanding
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs">
                    <td colSpan={4} className="px-4 py-3 text-slate-700">
                      Total Accounts Receivable
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-700 font-black">
                      ₹{fmtMoney(total)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 2. PAYABLES SCREEN (Accounts Payable - AP)
// ─────────────────────────────────────────────────────────────
export const PayablesScreen = ({
  onBack,
  onNavigate,
}: {
  onBack: () => void;
  onNavigate?: (screen: string) => void;
}) => {
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tb = await getTrialBalance('1900-01-01', today());
      setRows(
        tb.filter(
          (r) =>
            ['2001', '2002', '2003', '2004'].includes(r.account_code) &&
            (r.closing_debit > 0 || r.closing_credit > 0)
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payables');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(
    () => rows.reduce((s, r) => s + r.closing_credit - r.closing_debit, 0),
    [rows]
  );

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(
      (r) =>
        r.account_name.toLowerCase().includes(q) ||
        r.account_code.toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  const handleExportExcel = () => {
    if (rows.length === 0) return;
    const data = rows.map((r) => ({
      'Account Code': r.account_code,
      'Payable Head': r.account_name,
      'Group': r.account_group as string,
      'Closing Debit (₹)': r.closing_debit,
      'Closing Credit (₹)': r.closing_credit,
      'Outstanding Liability (₹)': r.closing_credit - r.closing_debit,
    }));
    data.push({
      'Account Code': 'TOTAL',
      'Payable Head': 'Total Accounts Payable',
      'Group': '',
      'Closing Debit (₹)': 0,
      'Closing Credit (₹)': 0,
      'Outstanding Liability (₹)': total,
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Accounts Payable');
    XLSX.writeFile(wb, `Accounts_Payable_${today()}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-900/[0.02] text-slate-800 pb-20">
      <ScreenHeader
        title="Accounts Payable (AP)"
        subtitle={`Total Outstanding: ₹${fmtMoney(total)} · Vendor dues, utility liabilities & tax obligations`}
        onBack={onBack}
        icon={<CreditCard className="w-5 h-5 text-rose-400" />}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Top KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-400">Total Payables</span>
            <p className="text-xl font-bold text-rose-600 mt-1 tabular-nums">
              ₹{fmtMoney(total)}
            </p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Total liability to clear</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-400">Trade Creditors (Vendors)</span>
            <p className="text-xl font-bold text-slate-800 mt-1 tabular-nums">
              ₹{fmtMoney(
                rows.find((r) => r.account_code === '2001')
                  ? (rows.find((r) => r.account_code === '2001')!.closing_credit -
                     rows.find((r) => r.account_code === '2001')!.closing_debit)
                  : 0
              )}
            </p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Suppliers & contractors</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-400">Accrued Expenses & Salaries</span>
            <p className="text-xl font-bold text-slate-800 mt-1 tabular-nums">
              ₹{fmtMoney(
                rows.find((r) => r.account_code === '2002')
                  ? (rows.find((r) => r.account_code === '2002')!.closing_credit -
                     rows.find((r) => r.account_code === '2002')!.closing_debit)
                  : 0
              )}
            </p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Staff & monthly dues</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-400">Statutory & GST Payables</span>
            <p className="text-xl font-bold text-slate-800 mt-1 tabular-nums">
              ₹{fmtMoney(
                rows.find((r) => r.account_code === '2003')
                  ? (rows.find((r) => r.account_code === '2003')!.closing_credit -
                     rows.find((r) => r.account_code === '2003')!.closing_debit)
                  : 0
              )}
            </p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Tax liabilities</span>
          </div>
        </div>

        {/* Action & Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search payable account..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Excel
            </button>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('vendor-ledger')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-xl border border-sky-200 transition cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                Vendor Ledger
              </button>
            )}
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

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-56 text-slate-400 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-sky-600 mr-2" />
              Loading payables ledger...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-16 text-slate-400 space-y-2">
              <CreditCard className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">No Payables Pending</p>
              <p className="text-xs text-slate-400">All vendor dues and operating liabilities are paid up to date.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Payable Account Type</th>
                    <th className="px-4 py-3 text-right">Debit / Cleared (₹)</th>
                    <th className="px-4 py-3 text-right">Credit / Billed (₹)</th>
                    <th className="px-4 py-3 text-right">Outstanding Payable</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((r) => {
                    const net = r.closing_credit - r.closing_debit;
                    return (
                      <tr key={r.account_id} className="hover:bg-slate-50/70 transition">
                        <td className="px-4 py-3 font-mono font-bold text-slate-600">
                          {r.account_code}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {r.account_name}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                          ₹{fmtMoney(r.closing_debit)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                          ₹{fmtMoney(r.closing_credit)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-rose-600">
                          ₹{fmtMoney(net)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            Liability
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs">
                    <td colSpan={4} className="px-4 py-3 text-slate-700">
                      Total Accounts Payable
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-700 font-black">
                      ₹{fmtMoney(total)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 3. VENDOR LEDGER SCREEN
// ─────────────────────────────────────────────────────────────
export const VendorLedgerScreen = ({ onBack }: { onBack: () => void }) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Form modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<VendorInput>({
    vendor_name: '',
    contact_person: '',
    mobile: '',
    email: '',
    address: '',
    gstin: '',
    pan: '',
    payment_terms: '',
    opening_balance: 0,
    is_active: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getVendors(true);
      setVendors(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setForm({
      vendor_name: '',
      contact_person: '',
      mobile: '',
      email: '',
      address: '',
      gstin: '',
      pan: '',
      payment_terms: '',
      opening_balance: 0,
      is_active: true,
    });
    setShowModal(true);
  };

  const handleOpenEdit = (v: Vendor) => {
    setEditingId(v.id);
    setForm({
      vendor_name: v.vendor_name,
      contact_person: v.contact_person || '',
      mobile: v.mobile || '',
      email: v.email || '',
      address: v.address || '',
      gstin: v.gstin || '',
      pan: v.pan || '',
      payment_terms: v.payment_terms || '',
      opening_balance: v.opening_balance || 0,
      is_active: v.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vendor_name.trim()) {
      setError('Vendor Name is required.');
      return;
    }
    setSaving(true);
    try {
      await saveVendor(form, editingId || undefined);
      setShowModal(false);
      setSuccess(editingId ? 'Vendor details updated successfully.' : 'New vendor registered.');
      setTimeout(() => setSuccess(null), 3000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save vendor');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove vendor "${name}"?`)) return;
    try {
      await deleteVendor(id);
      setVendors((prev) => prev.filter((v) => v.id !== id));
      setSuccess(`Vendor "${name}" removed.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete vendor');
    }
  };

  const filteredVendors = useMemo(() => {
    return vendors.filter((v) => {
      if (statusFilter === 'active' && !v.is_active) return false;
      if (statusFilter === 'inactive' && v.is_active) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        v.vendor_name.toLowerCase().includes(q) ||
        (v.contact_person && v.contact_person.toLowerCase().includes(q)) ||
        (v.mobile && v.mobile.toLowerCase().includes(q)) ||
        (v.gstin && v.gstin.toLowerCase().includes(q)) ||
        (v.address && v.address.toLowerCase().includes(q))
      );
    });
  }, [vendors, searchQuery, statusFilter]);

  const totalOpening = useMemo(
    () => vendors.reduce((s, v) => s + (v.opening_balance || 0), 0),
    [vendors]
  );

  const activeCount = useMemo(() => vendors.filter((v) => v.is_active).length, [vendors]);

  const handleExportExcel = () => {
    if (vendors.length === 0) return;
    const data = filteredVendors.map((v) => ({
      'Vendor Name': v.vendor_name,
      'Contact Person': v.contact_person || '—',
      'Mobile': v.mobile || '—',
      'Email': v.email || '—',
      'GSTIN': v.gstin || '—',
      'PAN': v.pan || '—',
      'Payment Terms': v.payment_terms || '—',
      'Opening Balance (₹)': v.opening_balance || 0,
      'Status': v.is_active ? 'Active' : 'Inactive',
      'Address': v.address || '—',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vendor Directory');
    XLSX.writeFile(wb, `Hotel_Vendors_${today()}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-900/[0.02] text-slate-800 pb-20">
      <ScreenHeader
        title="Vendor Ledger & Directory"
        subtitle={`${vendors.length} registered vendors · Suppliers, repair contracts & utilities`}
        onBack={onBack}
        icon={<Users className="w-5 h-5 text-sky-400" />}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-400">Total Vendors</span>
            <p className="text-xl font-bold text-slate-900 mt-1">{vendors.length}</p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">{activeCount} actively engaged</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-400">Total Opening Payable</span>
            <p className="text-xl font-bold text-rose-600 mt-1 tabular-nums">
              ₹{fmtMoney(totalOpening)}
            </p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Aggregated opening dues</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-400">GST Registered</span>
            <p className="text-xl font-bold text-sky-600 mt-1">
              {vendors.filter((v) => !!v.gstin).length}
            </p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Input tax credit eligible</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-400">Active Accounts</span>
            <p className="text-xl font-bold text-emerald-600 mt-1">
              {Math.round((activeCount / (vendors.length || 1)) * 100)}%
            </p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Operational vendor ratio</span>
          </div>
        </div>

        {/* Action & Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search vendor name, mobile, GSTIN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  statusFilter === 'all' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  statusFilter === 'active' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('inactive')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  statusFilter === 'inactive' ? 'bg-white text-slate-700 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Inactive
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Vendor
            </button>
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

        {/* Vendors Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-56 text-slate-400 text-xs">
            <Loader2 className="w-6 h-6 animate-spin text-sky-600 mr-2" />
            Loading vendor directory...
          </div>
        ) : filteredVendors.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 space-y-2">
            <Users className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">No vendors found</p>
            <p className="text-xs text-slate-400">
              {searchQuery ? 'Try matching a different keyword or reset filters.' : 'Click "+ Add Vendor" to register your first supplier.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVendors.map((v) => (
              <div
                key={v.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-sm transition p-4 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{v.vendor_name}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {v.contact_person ? `Contact: ${v.contact_person}` : 'No contact specified'}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ${
                        v.is_active
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {v.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* Contact pills */}
                  <div className="flex flex-wrap items-center gap-2 mt-2.5 text-xs text-slate-600">
                    {v.mobile && (
                      <a
                        href={`tel:${v.mobile}`}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:text-sky-800 bg-sky-50 px-2 py-0.5 rounded-md"
                      >
                        <Phone className="w-3 h-3" />
                        {v.mobile}
                      </a>
                    )}
                    {v.email && (
                      <a
                        href={`mailto:${v.email}`}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md"
                      >
                        <Mail className="w-3 h-3" />
                        {v.email}
                      </a>
                    )}
                  </div>

                  {/* Tax & Terms details */}
                  <div className="mt-3 space-y-1 text-[11px] text-slate-500 border-t border-slate-100 pt-2.5">
                    {v.gstin && (
                      <div className="flex justify-between">
                        <span>GSTIN:</span>
                        <span className="font-mono font-semibold text-slate-700">{v.gstin}</span>
                      </div>
                    )}
                    {v.pan && (
                      <div className="flex justify-between">
                        <span>PAN:</span>
                        <span className="font-mono font-semibold text-slate-700">{v.pan}</span>
                      </div>
                    )}
                    {v.payment_terms && (
                      <div className="flex justify-between">
                        <span>Terms:</span>
                        <span className="font-medium text-slate-700">{v.payment_terms}</span>
                      </div>
                    )}
                    {v.address && (
                      <p className="text-[11px] text-slate-400 italic truncate mt-1">
                        {v.address}
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer Balance & Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Opening Due</span>
                    <span className="text-sm font-bold text-slate-800 tabular-nums">
                      ₹{fmtMoney(v.opening_balance || 0)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(v)}
                      className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition"
                      title="Edit Vendor Details"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(v.id, v.vendor_name)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Delete Vendor"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add / Edit Vendor Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-sky-600" />
                {editingId ? 'Edit Vendor Profile' : 'Add New Vendor'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    Vendor / Firm Name *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={form.vendor_name}
                    onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
                    placeholder="e.g. Mahavir Grocers & Provisions"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={form.contact_person || ''}
                    onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                    placeholder="e.g. Rajesh Kumar"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    Mobile / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={form.mobile || ''}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                    placeholder="e.g. 9876543210"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={form.email || ''}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="e.g. vendor@gmail.com"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    GSTIN Number
                  </label>
                  <input
                    type="text"
                    value={form.gstin || ''}
                    onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    PAN Number
                  </label>
                  <input
                    type="text"
                    value={form.pan || ''}
                    onChange={(e) => setForm({ ...form, pan: e.target.value })}
                    placeholder="e.g. ABCDE1234F"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    Payment Terms
                  </label>
                  <input
                    type="text"
                    value={form.payment_terms || ''}
                    onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}
                    placeholder="e.g. Net 15 Days / Cash on Delivery"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    Opening Payable Balance (₹)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={form.opening_balance || ''}
                    onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 tabular-nums"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    Postal / Shop Address
                  </label>
                  <input
                    type="text"
                    value={form.address || ''}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Shop #, Street, City"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="w-4 h-4 rounded text-sky-600 border-slate-300"
                  />
                  <span className="text-xs font-semibold text-slate-700">Vendor Active</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? 'Saving...' : editingId ? 'Update Vendor' : 'Save Vendor'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 4. RECONCILIATION SCREEN (Bank & OTA Settlements)
// ─────────────────────────────────────────────────────────────
export const ReconciliationScreen = ({ onBack }: { onBack: () => void }) => {
  const [settlements, setSettlements] = useState<OTASettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'matched' | 'unmatched' | 'short' | 'excess'>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettlements(await getOTASettlements());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load OTA settlements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const channels = useMemo(() => {
    const set = new Set<string>();
    settlements.forEach((s) => {
      if (s.ota_name) set.add(s.ota_name);
    });
    return Array.from(set);
  }, [settlements]);

  const filteredSettlements = useMemo(() => {
    return settlements.filter((s) => {
      if (statusFilter !== 'all' && s.match_status !== statusFilter) return false;
      if (channelFilter !== 'all' && s.ota_name !== channelFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        s.ota_name.toLowerCase().includes(q) ||
        (s.ota_booking_id && s.ota_booking_id.toLowerCase().includes(q)) ||
        (s.guest_name && s.guest_name.toLowerCase().includes(q))
      );
    });
  }, [settlements, statusFilter, channelFilter, searchQuery]);

  const matchedCount = settlements.filter((s) => s.match_status === 'matched').length;
  const unmatchedCount = settlements.filter((s) => s.match_status === 'unmatched').length;
  const shortCount = settlements.filter((s) => s.match_status === 'short').length;

  const totalGross = useMemo(() => settlements.reduce((s, r) => s + r.gross_amount, 0), [settlements]);
  const totalExpected = useMemo(() => settlements.reduce((s, r) => s + r.net_expected, 0), [settlements]);
  const totalSettled = useMemo(() => settlements.reduce((s, r) => s + r.actual_settled, 0), [settlements]);
  const totalDiff = totalSettled - totalExpected;

  const handleExportExcel = () => {
    if (settlements.length === 0) return;
    const data = filteredSettlements.map((s) => ({
      'OTA Channel': s.ota_name,
      'Booking ID': s.ota_booking_id || '—',
      'Guest Name': s.guest_name || '—',
      'Gross Amount (₹)': s.gross_amount,
      'Commission (₹)': s.commission_amount,
      'Net Expected (₹)': s.net_expected,
      'Actual Settled (₹)': s.actual_settled,
      'Difference (₹)': s.difference,
      'Reconciliation Status': s.match_status,
      'Settlement Date': s.settlement_date || '—',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'OTA Reconciliation');
    XLSX.writeFile(wb, `OTA_Settlement_Reconciliation_${today()}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-900/[0.02] text-slate-800 pb-20">
      <ScreenHeader
        title="Reconciliation"
        subtitle="OTA settlements, commissions & bank payout audit"
        onBack={onBack}
        icon={<Wallet className="w-5 h-5 text-sky-400" />}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-400">Total Expected Net</span>
            <p className="text-xl font-bold text-slate-800 mt-1 tabular-nums">
              ₹{fmtMoney(totalExpected)}
            </p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">After OTA commission</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-emerald-600">Actual Bank Settled</span>
            <p className="text-xl font-bold text-emerald-600 mt-1 tabular-nums">
              ₹{fmtMoney(totalSettled)}
            </p>
            <span className="text-[10px] text-emerald-600/70 mt-0.5 block">{matchedCount} bookings matched</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-rose-600">Shortfall / Deductions</span>
            <p className="text-xl font-bold text-rose-600 mt-1 tabular-nums">
              {totalDiff < 0 ? `-₹${fmtMoney(Math.abs(totalDiff))}` : '₹0'}
            </p>
            <span className="text-[10px] text-rose-600/70 mt-0.5 block">{shortCount} short settlements</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-amber-600">Pending / Unmatched</span>
            <p className="text-xl font-bold text-amber-600 mt-1">
              {unmatchedCount}
            </p>
            <span className="text-[10px] text-amber-600/70 mt-0.5 block">Awaiting bank credit</span>
          </div>
        </div>

        {/* Action & Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search booking ID, guest, OTA..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            {/* Channels dropdown */}
            {channels.length > 0 && (
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-700"
              >
                <option value="all">All OTAs</option>
                {channels.map((ch) => (
                  <option key={ch} value={ch}>
                    {ch}
                  </option>
                ))}
              </select>
            )}

            {/* Status pills */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2 py-1 rounded-lg transition ${
                  statusFilter === 'all' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('matched')}
                className={`px-2 py-1 rounded-lg transition ${
                  statusFilter === 'matched' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Matched
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('short')}
                className={`px-2 py-1 rounded-lg transition ${
                  statusFilter === 'short' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Short
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Excel
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

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-56 text-slate-400 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-sky-600 mr-2" />
              Loading settlement records...
            </div>
          ) : filteredSettlements.length === 0 ? (
            <div className="text-center py-16 text-slate-400 space-y-2">
              <Wallet className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">No OTA Settlements Found</p>
              <p className="text-xs text-slate-400">OTA bank payouts will appear here once imported or reconciled.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3">OTA</th>
                    <th className="px-4 py-3">Booking ID</th>
                    <th className="px-4 py-3">Guest</th>
                    <th className="px-4 py-3 text-right">Gross (₹)</th>
                    <th className="px-4 py-3 text-right">Commission (₹)</th>
                    <th className="px-4 py-3 text-right">Net Expected</th>
                    <th className="px-4 py-3 text-right">Actual Settled</th>
                    <th className="px-4 py-3 text-right">Diff</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSettlements.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {s.ota_name}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {s.ota_booking_id || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {s.guest_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        ₹{fmtMoney(s.gross_amount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-rose-600">
                        -₹{fmtMoney(s.commission_amount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-800">
                        ₹{fmtMoney(s.net_expected)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-600">
                        ₹{fmtMoney(s.actual_settled)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums font-semibold ${
                          s.difference < 0
                            ? 'text-rose-600'
                            : s.difference > 0
                            ? 'text-amber-600'
                            : 'text-slate-400'
                        }`}
                      >
                        {s.difference === 0 ? '₹0' : `${s.difference > 0 ? '+' : ''}₹${fmtMoney(s.difference)}`}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                            s.match_status === 'matched'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : s.match_status === 'short'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : s.match_status === 'excess'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {s.match_status}
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
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 5. FINANCE EXCEPTIONS SCREEN
// ─────────────────────────────────────────────────────────────
export const FinanceExceptionsScreen = ({ onBack }: { onBack: () => void }) => {
  const [exceptions, setExceptions] = useState<FinanceException[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Resolve action modal
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolving, setResolving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setExceptions(await getFinanceExceptions());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load exceptions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingId) return;
    setResolving(true);
    try {
      await resolveFinanceException(resolvingId, 'hotel_admin', resolveNotes || 'Manually resolved by user');
      setExceptions((prev) =>
        prev.map((ex) =>
          ex.id === resolvingId
            ? { ...ex, status: 'resolved', resolution_notes: resolveNotes }
            : ex
        )
      );
      setResolvingId(null);
      setResolveNotes('');
      setSuccess('Exception marked as resolved.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve exception');
    } finally {
      setResolving(false);
    }
  };

  const filteredExceptions = useMemo(() => {
    return exceptions.filter((ex) => {
      if (statusFilter === 'open' && ex.status !== 'open') return false;
      if (statusFilter === 'resolved' && ex.status !== 'resolved') return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        ex.description.toLowerCase().includes(q) ||
        ex.source_type.toLowerCase().includes(q) ||
        (ex.source_id && ex.source_id.toLowerCase().includes(q))
      );
    });
  }, [exceptions, statusFilter, searchQuery]);

  const openCount = exceptions.filter((e) => e.status === 'open').length;

  return (
    <div className="min-h-screen bg-slate-900/[0.02] text-slate-800 pb-20">
      <ScreenHeader
        title="Finance Exceptions Audit"
        subtitle={`${openCount} open posting exceptions · Imbalanced vouchers & unmapped ledger entries`}
        onBack={onBack}
        icon={<AlertCircle className="w-5 h-5 text-amber-400" />}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Top Control Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search exceptions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  statusFilter === 'all' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500'
                }`}
              >
                All ({exceptions.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('open')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  statusFilter === 'open' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Open ({openCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('resolved')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  statusFilter === 'resolved' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Resolved
              </button>
            </div>

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

        {/* Exceptions List */}
        {loading ? (
          <div className="flex items-center justify-center h-56 text-slate-400 text-xs">
            <Loader2 className="w-6 h-6 animate-spin text-sky-600 mr-2" />
            Auditing finance exceptions...
          </div>
        ) : filteredExceptions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400" />
            <p className="text-sm font-semibold text-slate-700">No Accounting Exceptions</p>
            <p className="text-xs text-slate-400">All journal entries and ledger balances are completely balanced.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredExceptions.map((ex) => (
              <div
                key={ex.id}
                className={`bg-white rounded-2xl border p-4 shadow-2xs transition space-y-2 ${
                  ex.status === 'open' ? 'border-amber-200' : 'border-slate-200 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        ex.status === 'open'
                          ? 'bg-amber-50 text-amber-600'
                          : 'bg-emerald-50 text-emerald-600'
                      }`}
                    >
                      <AlertCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{ex.description}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Source: <span className="font-semibold text-slate-600">{ex.source_type}</span>
                        {ex.source_id && ` · Ref #${ex.source_id}`}
                      </p>
                      {ex.amount != null && ex.amount > 0 && (
                        <p className="text-xs font-bold text-slate-700 mt-1">
                          Discrepancy Amount: ₹{fmtMoney(ex.amount)}
                        </p>
                      )}
                      {ex.resolution_notes && (
                        <p className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg mt-2 inline-block">
                          Resolved: {ex.resolution_notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        ex.status === 'open'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {ex.status}
                    </span>
                    {ex.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => {
                          setResolvingId(ex.id);
                          setResolveNotes('');
                        }}
                        className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition cursor-pointer"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Resolve Exception Modal */}
      {resolvingId && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Resolve Exception
              </h4>
              <button
                type="button"
                onClick={() => setResolvingId(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleResolve} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">
                  Resolution Notes / Action Taken
                </label>
                <textarea
                  rows={3}
                  required
                  autoFocus
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  placeholder="e.g. Adjusted manual voucher #104, matched with bank passbook..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setResolvingId(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resolving}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-2xs transition disabled:opacity-50 cursor-pointer"
                >
                  {resolving ? 'Resolving...' : 'Confirm Resolved'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
