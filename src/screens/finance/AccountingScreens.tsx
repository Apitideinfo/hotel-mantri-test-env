import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, Clock, X, Plus, Wallet, Users, Building2, Plane } from 'lucide-react';
import { ScreenHeader, fmtMoney } from '@/components/finance-ui';
import { getTrialBalance, getVendors, saveVendor, getOTASettlements } from '@/lib/api-accounting';
import type { TrialBalanceRow, Vendor, VendorInput, OTASettlement } from '@/lib/types-accounting';
import { getAgeingBucket, AGEING_BUCKETS } from '@/lib/types-accounting';

const today = () => new Date().toISOString().slice(0, 10);

// ── Receivables ──
export const ReceivablesScreen = ({ onBack }: { onBack: () => void }) => {
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tb = await getTrialBalance('1900-01-01', today());
      setRows(tb.filter((r) => ['1004', '1005', '1006', '1007'].includes(r.account_code) && (r.closing_debit > 0 || r.closing_credit > 0)));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = rows.reduce((s, r) => s + r.closing_debit - r.closing_credit, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title="Accounts Receivable" subtitle={`Total: ${fmtMoney(total)}`} onBack={onBack} icon={<Clock className="w-5 h-5 text-sky-300" />} />
      {error && <div className="mx-4 my-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}<button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button></div>}
      {loading ? <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…</div> : (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b text-left text-[10px] font-bold text-slate-400 uppercase">
                <th className="px-4 py-2">Code</th><th className="px-4 py-2">Receivable Type</th><th className="px-4 py-2 text-right">Outstanding</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">No receivables.</td></tr> : rows.map((r) => (
                  <tr key={r.account_id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono font-bold text-slate-600">{r.account_code}</td>
                    <td className="px-4 py-2 font-semibold text-slate-700">{r.account_name}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-bold text-amber-600">{fmtMoney(r.closing_debit - r.closing_credit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-slate-50 border-t-2 font-bold"><td colSpan={2} className="px-4 py-2 text-slate-700">Total Receivables</td><td className="px-4 py-2 text-right tabular-nums text-slate-800">{fmtMoney(total)}</td></tr></tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Payables ──
export const PayablesScreen = ({ onBack }: { onBack: () => void }) => {
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tb = await getTrialBalance('1900-01-01', today());
      setRows(tb.filter((r) => ['2001', '2002', '2003', '2004'].includes(r.account_code) && (r.closing_debit > 0 || r.closing_credit > 0)));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = rows.reduce((s, r) => s + r.closing_credit - r.closing_debit, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title="Accounts Payable" subtitle={`Total: ${fmtMoney(total)}`} onBack={onBack} icon={<Clock className="w-5 h-5 text-sky-300" />} />
      {error && <div className="mx-4 my-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}<button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button></div>}
      {loading ? <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…</div> : (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b text-left text-[10px] font-bold text-slate-400 uppercase">
                <th className="px-4 py-2">Code</th><th className="px-4 py-2">Payable Type</th><th className="px-4 py-2 text-right">Outstanding</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">No payables.</td></tr> : rows.map((r) => (
                  <tr key={r.account_id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono font-bold text-slate-600">{r.account_code}</td>
                    <td className="px-4 py-2 font-semibold text-slate-700">{r.account_name}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-bold text-red-600">{fmtMoney(r.closing_credit - r.closing_debit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-slate-50 border-t-2 font-bold"><td colSpan={2} className="px-4 py-2 text-slate-700">Total Payables</td><td className="px-4 py-2 text-right tabular-nums text-slate-800">{fmtMoney(total)}</td></tr></tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Vendor Ledger ──
export const VendorLedgerScreen = ({ onBack }: { onBack: () => void }) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<VendorInput>({ vendor_name: '', contact_person: '', mobile: '', email: '', address: '', gstin: '', pan: '', payment_terms: '', opening_balance: 0, is_active: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getVendors(true);
      setVendors(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.vendor_name.trim()) { setError('Vendor name is required.'); return; }
    try { await saveVendor(form); setShowForm(false); setForm({ vendor_name: '', contact_person: '', mobile: '', email: '', address: '', gstin: '', pan: '', payment_terms: '', opening_balance: 0, is_active: true }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title="Vendor Ledger" subtitle={`${vendors.length} vendors`} onBack={onBack} icon={<Users className="w-5 h-5 text-sky-300" />} />
      <div className="px-4 py-3">
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl"><Plus className="w-4 h-4" /> Add Vendor</button>
      </div>
      {error && <div className="mx-4 mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}<button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button></div>}
      {showForm && (
        <div className="mx-4 mb-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Vendor Name *</label><input type="text" value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Contact Person</label><input type="text" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Mobile</label><input type="text" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            <div><label className="text-xs font-semibold text-slate-500 mb-1 block">GSTIN</label><input type="text" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            <div><label className="text-xs font-semibold text-slate-500 mb-1 block">PAN</label><input type="text" value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Payment Terms</label><input type="text" value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Opening Balance (₹)</label><input type="number" value={form.opening_balance || ''} onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
          </div>
          <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Address</label><input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
          <div className="flex gap-2"><button onClick={handleSave} className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 rounded-xl text-sm">Save</button><button onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-200 rounded-xl">Cancel</button></div>
        </div>
      )}
      {loading ? <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…</div> : (
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {vendors.map((v) => (
            <div key={v.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-sm font-bold text-slate-800">{v.vendor_name}</p>
              <p className="text-xs text-slate-400">{v.contact_person || 'No contact'} · {v.mobile || 'No phone'}</p>
              {v.gstin && <p className="text-xs text-slate-500 mt-1">GSTIN: {v.gstin}</p>}
              {v.payment_terms && <p className="text-xs text-slate-500">Terms: {v.payment_terms}</p>}
              <p className="text-sm font-bold text-slate-700 mt-2">Opening: {fmtMoney(v.opening_balance)}</p>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${v.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{v.is_active ? 'Active' : 'Inactive'}</span>
            </div>
          ))}
          {vendors.length === 0 && <div className="col-span-full text-center py-16 text-slate-400"><Users className="w-12 h-12 mx-auto mb-3 opacity-40" /><p className="text-sm">No vendors yet.</p></div>}
        </div>
      )}
    </div>
  );
};

// ── OTA Settlement Reconciliation ──
export const ReconciliationScreen = ({ onBack }: { onBack: () => void }) => {
  const [settlements, setSettlements] = useState<OTASettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSettlements(await getOTASettlements()); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const matched = settlements.filter((s) => s.match_status === 'matched').length;
  const unmatched = settlements.filter((s) => s.match_status === 'unmatched').length;
  const shortSettle = settlements.filter((s) => s.match_status === 'short').length;

  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title="Reconciliation" subtitle="Bank & OTA Settlement" onBack={onBack} icon={<Wallet className="w-5 h-5 text-sky-300" />} />
      <div className="px-4 py-3 grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 text-center"><p className="text-lg font-bold text-emerald-600">{matched}</p><p className="text-[10px] text-slate-400 uppercase">Matched</p></div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 text-center"><p className="text-lg font-bold text-amber-600">{unmatched}</p><p className="text-[10px] text-slate-400 uppercase">Unmatched</p></div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 text-center"><p className="text-lg font-bold text-red-600">{shortSettle}</p><p className="text-[10px] text-slate-400 uppercase">Short</p></div>
      </div>
      {error && <div className="mx-4 mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}<button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button></div>}
      {loading ? <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…</div> : (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b text-left text-[10px] font-bold text-slate-400 uppercase">
                <th className="px-4 py-2">OTA</th><th className="px-4 py-2">Booking ID</th><th className="px-4 py-2">Guest</th>
                <th className="px-4 py-2 text-right">Gross</th><th className="px-4 py-2 text-right">Commission</th><th className="px-4 py-2 text-right">Net Expected</th>
                <th className="px-4 py-2 text-right">Settled</th><th className="px-4 py-2 text-right">Diff</th><th className="px-4 py-2">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {settlements.length === 0 ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No OTA settlements recorded.</td></tr> : settlements.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-700">{s.ota_name}</td>
                    <td className="px-4 py-2 font-mono text-xs">{s.ota_booking_id || '—'}</td>
                    <td className="px-4 py-2 text-slate-600">{s.guest_name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(s.gross_amount)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-red-600">{fmtMoney(s.commission_amount)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmtMoney(s.net_expected)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmtMoney(s.actual_settled)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${s.difference < 0 ? 'text-red-600' : s.difference > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{fmtMoney(s.difference)}</td>
                    <td className="px-4 py-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${s.match_status === 'matched' ? 'bg-emerald-100 text-emerald-700' : s.match_status === 'unmatched' ? 'bg-slate-100 text-slate-500' : s.match_status === 'short' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{s.match_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Finance Exceptions ──
export const FinanceExceptionsScreen = ({ onBack }: { onBack: () => void }) => {
  const [exceptions, setExceptions] = useState<import('@/lib/types-accounting').FinanceException[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { getFinanceExceptions } = await import('@/lib/api-accounting');
      setExceptions(await getFinanceExceptions());
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title="Finance Exceptions" subtitle="Posting issues & mismatches" onBack={onBack} icon={<AlertCircle className="w-5 h-5 text-sky-300" />} />
      {error && <div className="mx-4 my-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}<button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button></div>}
      {loading ? <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…</div> : (
        <div className="px-4 pb-4 space-y-2">
          {exceptions.length === 0 ? <div className="text-center py-16 text-slate-400"><AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-40" /><p className="text-sm">No exceptions. All postings are clean.</p></div> : exceptions.map((ex) => (
            <div key={ex.id} className={`bg-white rounded-xl border shadow-sm p-3 ${ex.status === 'open' ? 'border-amber-200' : 'border-slate-200 opacity-60'}`}>
              <div className="flex items-start gap-3">
                <AlertCircle className={`w-4 h-4 mt-0.5 shrink-0 ${ex.status === 'open' ? 'text-amber-500' : 'text-slate-400'}`} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{ex.description}</p>
                  <p className="text-xs text-slate-400">{ex.source_type} · {ex.source_id}</p>
                  {ex.amount != null && <p className="text-xs text-slate-500 mt-0.5">Amount: {fmtMoney(ex.amount)}</p>}
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ex.status === 'open' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{ex.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
