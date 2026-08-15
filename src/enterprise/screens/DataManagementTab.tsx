import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Download, RotateCcw, Archive, Trash2, AlertTriangle, Shield, FileJson,
  CheckCircle2, Loader2, X, Info, Lock,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  getHotelRecordCounts, exportHotelData, resetHotelOperationalData,
  deleteHotelPermanently, deleteHotelStorageFiles,
  type HotelRecordCounts, type DeletionSummary,
} from '../api';
import { Card, Badge } from '../ui';

interface Props {
  hotelId: string;
  hotelName: string;
  propertyCode: string | null;
  adminEmail: string;
  onHotelDeleted: () => void;
  onHotelReset: () => void;
  onArchive: () => void;
  isImpersonating: boolean;
  canDelete: boolean;
  canReset: boolean;
}

type Phase = 'idle' | 'confirming' | 'executing' | 'done' | 'error';

const RESET_REASONS = [
  'End of trial period — clearing test data',
  'Data entry errors — starting fresh',
  'New financial year reset',
  'Change of management — clearing old data',
  'Demo/testing cleanup',
  'Other (specify in notes)',
];

const DELETE_REASONS = [
  'Hotel closed permanently',
  'Duplicate hotel account',
  'Customer cancelled subscription',
  'Test/demo hotel — no longer needed',
  'Data privacy request — right to erasure',
  'Other (specify in notes)',
];

const PRETTY_TABLE: Record<string, string> = {
  daily_reports: 'Daily Reports',
  daily_revenue_entries: 'Daily Revenue Entries',
  room_chart_entries: 'Room Chart / Booking Transactions',
  expense_entries: 'Daily Expenses',
  expense_categories: 'Expense Categories',
  other_daily_entries: 'Other Revenue Entries',
  electricity_readings: 'Electricity Readings',
  laundry_entries: 'Laundry Transactions',
  monthly_bills: 'Monthly Bills',
  salary_advances: 'Salary Advances',
  salary_settlements: 'Salary Settlements',
  utility_bills: 'Utility Bills',
  staff: 'Staff Records',
  company_sources: 'Booking Sources',
  room_categories: 'Room Categories',
  rooms: 'Room Numbers',
  hotel_features: 'Feature Assignments',
  hotel_admins: 'Hotel Admins / Users',
  subscription_payments: 'Subscription Payments',
  support_tickets: 'Support Tickets',
  notifications: 'Notifications',
  audit_logs: 'Audit Logs',
  impersonation_sessions: 'Impersonation Sessions',
  hotel_invitations: 'Hotel Invitations',
  hotel_settings: 'Hotel Settings',
  hotels: 'Hotel Record',
};

export const DataManagementTab = ({
  hotelId, hotelName, propertyCode, adminEmail,
  onHotelDeleted, onHotelReset, onArchive, isImpersonating, canDelete, canReset,
}: Props) => {
  const { user } = useAuth();
  const [counts, setCounts] = useState<HotelRecordCounts | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active modal: 'reset' | 'delete' | null
  const [activeModal, setActiveModal] = useState<'reset' | 'delete' | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  const loadCounts = useCallback(async () => {
    try {
      setLoadingCounts(true);
      const c = await getHotelRecordCounts(hotelId);
      setCounts(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load record counts');
    } finally {
      setLoadingCounts(false);
    }
  }, [hotelId]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);
      const data = await exportHotelData(hotelId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-${propertyCode || hotelId}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportDone(true);
      setTimeout(() => setExportDone(false), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const totalCount = (c: HotelRecordCounts | null): number => {
    if (!c) return 0;
    return Object.values(c).reduce((s, v) => s + v, 0);
  };

  const operationalCount = (c: HotelRecordCounts | null): number => {
    if (!c) return 0;
    const keys = ['daily_reports', 'daily_revenue_entries', 'room_chart_entries',
      'expense_entries', 'expense_categories', 'other_daily_entries',
      'electricity_readings', 'laundry_entries', 'monthly_bills',
      'salary_advances', 'salary_settlements', 'utility_bills', 'staff', 'company_sources'];
    return keys.reduce((s, k) => s + (c[k as keyof HotelRecordCounts] ?? 0), 0);
  };

  if (loadingCounts) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading data inventory…
      </div>
    );
  }

  if (error && !activeModal) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 text-red-600 mb-2">
          <AlertTriangle className="w-4 h-4" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
        <button onClick={loadCounts} className="text-sm text-sky-600 hover:underline">Retry</button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── Section 1: Export Hotel Data ── */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Export Hotel Data</h3>
            <p className="text-sm text-slate-500 mt-1">
              Download a complete JSON backup of this hotel's data, including all operational records,
              settings, rooms, and transactions. Recommended before any destructive action.
            </p>
            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
              <Info className="w-3.5 h-3.5" />
              This backup is for archival purposes. No automatic restore function exists.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold px-4 py-2.5 rounded-xl transition text-sm"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {exporting ? 'Exporting…' : 'Export Backup (JSON)'}
              </button>
              {exportDone && (
                <span className="flex items-center gap-1 text-sm text-emerald-600 font-medium">
                  <CheckCircle2 className="w-4 h-4" /> Downloaded
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Section 2: Reset Operational Data ── */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
            <RotateCcw className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Reset Operational Data</h3>
              {canReset ? <Badge color="amber">Founder / Super Admin</Badge> : <Badge color="slate">No Access</Badge>}
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Clears all entered operational and financial data — daily entries, expenses, room chart
              transactions, salary, laundry, utility bills, and more — while keeping the hotel account,
              Property Master, users, subscription, and settings intact.
            </p>

            {/* Data inventory */}
            <div className="mt-3 bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-600 mb-2">
                Operational records to be deleted: <span className="font-bold text-amber-700">{operationalCount(counts)} rows</span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {Object.entries(counts ?? {}).filter(([k, v]) => {
                  const opKeys = ['daily_reports', 'daily_revenue_entries', 'room_chart_entries',
                    'expense_entries', 'expense_categories', 'other_daily_entries',
                    'electricity_readings', 'laundry_entries', 'monthly_bills',
                    'salary_advances', 'salary_settlements', 'utility_bills', 'staff', 'company_sources'];
                  return opKeys.includes(k) && v > 0;
                }).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{PRETTY_TABLE[k] ?? k}</span>
                    <span className="font-semibold text-slate-700 tabular-nums">{v}</span>
                  </div>
                ))}
                {operationalCount(counts) === 0 && (
                  <p className="text-xs text-slate-400 col-span-full">No operational data to delete.</p>
                )}
              </div>
            </div>

            {/* What stays */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['Hotel Profile', 'Property Code', 'Owner Account', 'Users', 'Room Categories', 'Rooms', 'Subscription', 'Feature Access', 'Branding'].map((item) => (
                <span key={item} className="text-[10px] font-medium bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md border border-emerald-200">{item} ✓</span>
              ))}
            </div>

            <button
              onClick={() => canReset ? setActiveModal('reset') : undefined}
              disabled={!canReset || isImpersonating}
              className="mt-3 flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-4 py-2.5 rounded-xl transition text-sm"
            >
              <RotateCcw className="w-4 h-4" /> Reset Operational Data
            </button>
            {isImpersonating && (
              <p className="text-xs text-red-500 mt-2">Cannot reset while impersonating this hotel.</p>
            )}
          </div>
        </div>
      </Card>

      {/* ── Section 3: Archive Hotel ── */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
            <Archive className="w-5 h-5 text-slate-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Archive Hotel</h3>
            <p className="text-sm text-slate-500 mt-1">
              Marks the hotel as archived without deleting any data. The hotel account becomes inactive
              and is hidden from active lists, but all data remains preserved and can be reactivated later.
            </p>
            <button
              onClick={onArchive}
              className="mt-3 flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white font-semibold px-4 py-2.5 rounded-xl transition text-sm"
            >
              <Archive className="w-4 h-4" /> Archive Hotel
            </button>
          </div>
        </div>
      </Card>

      {/* ── Section 4: Danger Zone — Permanently Delete Hotel ── */}
      <div className="border-2 border-red-300 rounded-2xl overflow-hidden">
        <div className="bg-red-50 px-5 py-3 flex items-center gap-2 border-b border-red-200">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <h3 className="text-sm font-bold text-red-700 uppercase tracking-wide">Danger Zone</h3>
        </div>
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Permanently Delete Hotel</h4>
                {canDelete ? <Badge color="red">Founder Only</Badge> : <Badge color="slate">No Access</Badge>}
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Permanently removes the hotel and <span className="font-semibold text-red-600">every associated record</span> —
                including the hotel record, owner account, all users (if not linked to other hotels), Property Master,
                rooms, categories, operational data, finance data, subscriptions, features, support tickets, and storage files.
                This action <span className="font-bold text-red-600">cannot be undone</span>.
              </p>

              {/* Full data inventory */}
              <div className="mt-3 bg-red-50 rounded-xl p-3 border border-red-200">
                <p className="text-xs font-semibold text-red-700 mb-2">
                  Total records to be permanently deleted: <span className="font-bold">{totalCount(counts)} rows across {Object.values(counts ?? {}).filter(v => v > 0).length} tables</span>
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
                  {Object.entries(counts ?? {}).filter(([, v]) => v > 0).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">{PRETTY_TABLE[k] ?? k}</span>
                      <span className="font-semibold text-red-700 tabular-nums">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => canDelete ? setActiveModal('delete') : undefined}
                disabled={!canDelete || isImpersonating}
                className="mt-3 flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-4 py-2.5 rounded-xl transition text-sm"
              >
                <Trash2 className="w-4 h-4" /> Permanently Delete Hotel
              </button>
              {isImpersonating && (
                <p className="text-xs text-red-500 mt-2">Cannot delete while impersonating this hotel.</p>
              )}
              {!canDelete && (
                <p className="text-xs text-slate-400 mt-2">Only the Founder / Super Admin can perform this action.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {activeModal === 'reset' && (
        <ResetConfirmModal
          hotelId={hotelId}
          hotelName={hotelName}
          userEmail={user?.email ?? ''}
          counts={counts}
          onClose={() => setActiveModal(null)}
          onSuccess={() => { setActiveModal(null); onHotelReset(); loadCounts(); }}
          setError={setError}
        />
      )}
      {activeModal === 'delete' && (
        <DeleteConfirmModal
          hotelId={hotelId}
          hotelName={hotelName}
          propertyCode={propertyCode}
          adminEmail={adminEmail}
          userEmail={user?.email ?? ''}
          counts={counts}
          onClose={() => setActiveModal(null)}
          onSuccess={() => { setActiveModal(null); onHotelDeleted(); }}
          setError={setError}
        />
      )}
    </div>
  );
};

// ── Reset Confirmation Modal ──

const ResetConfirmModal = ({
  hotelId, hotelName, userEmail, counts, onClose, onSuccess, setError,
}: {
  hotelId: string;
  hotelName: string;
  userEmail: string;
  counts: HotelRecordCounts | null;
  onClose: () => void;
  onSuccess: () => void;
  setError: (e: string | null) => void;
}) => {
  const [phase, setPhase] = useState<Phase>('confirming');
  const [password, setPassword] = useState('');
  const [nameConfirm, setNameConfirm] = useState('');
  const [reason, setReason] = useState('');
  const [reasonNotes, setReasonNotes] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState<DeletionSummary | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [reauthedAt, setReauthedAt] = useState<number | null>(null);
  const [reauthing, setReauthing] = useState(false);
  const submittedRef = useRef(false);

  const opKeys = ['daily_reports', 'daily_revenue_entries', 'room_chart_entries',
    'expense_entries', 'expense_categories', 'other_daily_entries',
    'electricity_readings', 'laundry_entries', 'monthly_bills',
    'salary_advances', 'salary_settlements', 'utility_bills', 'staff', 'company_sources'];

  const opCount = counts ? opKeys.reduce((s, k) => s + (counts[k as keyof HotelRecordCounts] ?? 0), 0) : 0;

  const handleReauth = async () => {
    if (!password || password.length < 6) { setLocalError('Enter your password (min 6 characters)'); return; }
    try {
      setReauthing(true);
      setLocalError(null);
      const { error } = await supabase.auth.signInWithPassword({ email: userEmail, password });
      if (error) throw error;
      setReauthedAt(Date.now());
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Re-authentication failed');
    } finally {
      setReauthing(false);
    }
  };

  const canSubmit = reauthedAt !== null
    && (Date.now() - reauthedAt) < 5 * 60 * 1000
    && nameConfirm.trim() === hotelName.trim()
    && reason.trim().length > 0
    && acknowledged;

  const handleSubmit = async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setPhase('executing');
    setLocalError(null);
    try {
      const ip = 'client-side';
      const device = navigator.userAgent;
      const fullReason = reason === 'Other (specify in notes)' && reasonNotes.trim()
        ? `Other: ${reasonNotes.trim()}`
        : reason;
      const summary = await resetHotelOperationalData(hotelId, fullReason, userEmail, ip, device);
      setResult(summary);
      setPhase('done');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Reset failed';
      setLocalError(msg);
      setError(msg);
      setPhase('error');
      submittedRef.current = false;
    }
  };

  return (
    <ModalShell title="Reset Operational Data" onClose={onClose} danger>
      {phase === 'confirming' && (
        <div className="space-y-4">
          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">This will delete {opCount} operational records.</p>
                <p className="text-xs text-amber-700 mt-1">
                  Hotel profile, Property Master, users, subscription, and settings will be preserved.
                  The hotel will behave like a newly configured hotel with zero transactions.
                </p>
              </div>
            </div>
          </div>

          {/* Itemized list */}
          <div className="bg-slate-50 rounded-xl p-3 max-h-40 overflow-y-auto">
            <p className="text-xs font-semibold text-slate-600 mb-2">Records to be deleted:</p>
            <div className="grid grid-cols-2 gap-1">
              {counts && opKeys.filter(k => counts[k as keyof HotelRecordCounts] > 0).map(k => (
                <div key={k} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{PRETTY_TABLE[k] ?? k}</span>
                  <span className="font-semibold text-slate-700">{counts[k as keyof HotelRecordCounts]}</span>
                </div>
              ))}
              {opCount === 0 && <p className="text-xs text-slate-400">No operational data found.</p>}
            </div>
          </div>

          {/* Step 1: Re-authentication */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Step 1: Re-authenticate
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                disabled={reauthedAt !== null}
              />
              <button
                onClick={handleReauth}
                disabled={reauthedAt !== null || reauthing || password.length < 6}
                className="bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm whitespace-nowrap"
              >
                {reauthing ? <Loader2 className="w-4 h-4 animate-spin" /> : reauthedAt ? <CheckCircle2 className="w-4 h-4" /> : 'Verify'}
              </button>
            </div>
            {reauthedAt && <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Identity verified</p>}
          </div>

          {/* Step 2: Type hotel name */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Step 2: Type the hotel name to confirm</label>
            <input
              type="text"
              value={nameConfirm}
              onChange={(e) => setNameConfirm(e.target.value)}
              placeholder={`Type "${hotelName}" exactly`}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {nameConfirm && nameConfirm !== hotelName && (
              <p className="text-xs text-red-500">Hotel name does not match</p>
            )}
          </div>

          {/* Step 3: Select reason */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Step 3: Select a reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">— Select a reason —</option>
              {RESET_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {reason === 'Other (specify in notes)' && (
              <input
                type="text"
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                placeholder="Specify reason…"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            )}
          </div>

          {/* Step 4: Acknowledgement */}
          <label className="flex items-start gap-2 cursor-pointer p-2 hover:bg-slate-50 rounded-lg">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm text-slate-700">I understand this action cannot be undone.</span>
          </label>

          {localError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-sm text-red-700">{localError}</div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition text-sm"
            >
              Reset Operational Data
            </button>
            <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl transition text-sm">Cancel</button>
          </div>
        </div>
      )}

      {phase === 'executing' && (
        <div className="flex flex-col items-center py-8">
          <Loader2 className="w-8 h-8 text-amber-600 animate-spin mb-3" />
          <p className="text-sm font-semibold text-slate-700">Resetting operational data…</p>
          <p className="text-xs text-slate-400 mt-1">Do not close this window.</p>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
            <p className="text-sm font-bold">Operational data reset successfully</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 max-h-60 overflow-y-auto">
            <p className="text-xs font-semibold text-slate-600 mb-2">Deletion summary by table:</p>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(result.deleted_counts).filter(([, v]) => v > 0).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{PRETTY_TABLE[k] ?? k}</span>
                  <span className="font-semibold text-slate-700 tabular-nums">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-400">Audit log recorded. User: {userEmail}</p>
          <button onClick={onSuccess} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl transition text-sm">Done</button>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            <p className="text-sm font-bold">Reset failed</p>
          </div>
          <p className="text-sm text-red-600">{localError}</p>
          <button onClick={() => setPhase('confirming')} className="w-full bg-slate-700 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-xl transition text-sm">Back</button>
        </div>
      )}
    </ModalShell>
  );
};

// ── Delete Confirmation Modal ──

const DeleteConfirmModal = ({
  hotelId, hotelName, propertyCode, adminEmail, userEmail, counts, onClose, onSuccess, setError,
}: {
  hotelId: string;
  hotelName: string;
  propertyCode: string | null;
  adminEmail: string;
  userEmail: string;
  counts: HotelRecordCounts | null;
  onClose: () => void;
  onSuccess: () => void;
  setError: (e: string | null) => void;
}) => {
  const [phase, setPhase] = useState<Phase>('confirming');
  const [password, setPassword] = useState('');
  const [nameConfirm, setNameConfirm] = useState('');
  const [reason, setReason] = useState('');
  const [reasonNotes, setReasonNotes] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmCode, setConfirmCode] = useState('');
  const [result, setResult] = useState<DeletionSummary | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [reauthedAt, setReauthedAt] = useState<number | null>(null);
  const [reauthing, setReauthing] = useState(false);
  const submittedRef = useRef(false);

  const expectedCode = `DELETE ${propertyCode ?? ''}`.trim();
  const totalCount = counts ? Object.values(counts).reduce((s, v) => s + v, 0) : 0;

  const handleReauth = async () => {
    if (!password || password.length < 6) { setLocalError('Enter your password (min 6 characters)'); return; }
    try {
      setReauthing(true);
      setLocalError(null);
      const { error } = await supabase.auth.signInWithPassword({ email: userEmail, password });
      if (error) throw error;
      setReauthedAt(Date.now());
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Re-authentication failed');
    } finally {
      setReauthing(false);
    }
  };

  const canSubmit = reauthedAt !== null
    && (Date.now() - reauthedAt) < 5 * 60 * 1000
    && nameConfirm.trim() === hotelName.trim()
    && reason.trim().length > 0
    && acknowledged
    && confirmCode.trim().toUpperCase() === expectedCode.toUpperCase();

  const handleSubmit = async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setPhase('executing');
    setLocalError(null);
    try {
      const ip = 'client-side';
      const device = navigator.userAgent;
      const fullReason = reason === 'Other (specify in notes)' && reasonNotes.trim()
        ? `Other: ${reasonNotes.trim()}`
        : reason;
      const summary = await deleteHotelPermanently(hotelId, fullReason, userEmail, ip, device);
      setResult(summary);
      setPhase('done');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Deletion failed';
      setLocalError(msg);
      setError(msg);
      setPhase('error');
      submittedRef.current = false;
    }
  };

  return (
    <ModalShell title="Permanently Delete Hotel" onClose={onClose} danger>
      {phase === 'confirming' && (
        <div className="space-y-4">
          {/* Critical warning */}
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-800">This will permanently delete {totalCount} records.</p>
                <p className="text-xs text-red-700 mt-1">
                  The hotel record, owner account ({adminEmail}), all users (if not linked to other hotels),
                  Property Master, rooms, categories, operational data, finance data, subscriptions, features,
                  support tickets, storage files, and audit logs will be removed. This cannot be undone.
                </p>
              </div>
            </div>
          </div>

          {/* Itemized list */}
          <div className="bg-slate-50 rounded-xl p-3 max-h-40 overflow-y-auto">
            <p className="text-xs font-semibold text-slate-600 mb-2">All records to be deleted:</p>
            <div className="grid grid-cols-2 gap-1">
              {counts && Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{PRETTY_TABLE[k] ?? k}</span>
                  <span className="font-semibold text-red-700 tabular-nums">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Step 1: Re-authentication */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Step 1: Re-authenticate
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                disabled={reauthedAt !== null}
              />
              <button
                onClick={handleReauth}
                disabled={reauthedAt !== null || reauthing || password.length < 6}
                className="bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm whitespace-nowrap"
              >
                {reauthing ? <Loader2 className="w-4 h-4 animate-spin" /> : reauthedAt ? <CheckCircle2 className="w-4 h-4" /> : 'Verify'}
              </button>
            </div>
            {reauthedAt && <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Identity verified</p>}
          </div>

          {/* Step 2: Type hotel name */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Step 2: Type the hotel name to confirm</label>
            <input
              type="text"
              value={nameConfirm}
              onChange={(e) => setNameConfirm(e.target.value)}
              placeholder={`Type "${hotelName}" exactly`}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            {nameConfirm && nameConfirm !== hotelName && (
              <p className="text-xs text-red-500">Hotel name does not match</p>
            )}
          </div>

          {/* Step 3: Select reason */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Step 3: Select a reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">— Select a reason —</option>
              {DELETE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {reason === 'Other (specify in notes)' && (
              <input
                type="text"
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                placeholder="Specify reason…"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            )}
          </div>

          {/* Step 4: Confirmation code */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Step 4: Type the confirmation code</label>
            <div className="bg-slate-900 text-emerald-400 font-mono text-sm px-3 py-2 rounded-lg">{expectedCode}</div>
            <input
              type="text"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              placeholder={`Type "${expectedCode}"`}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            {confirmCode && confirmCode.trim().toUpperCase() !== expectedCode.toUpperCase() && (
              <p className="text-xs text-red-500">Confirmation code does not match</p>
            )}
          </div>

          {/* Step 5: Acknowledgement */}
          <label className="flex items-start gap-2 cursor-pointer p-2 hover:bg-red-50 rounded-lg">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-sm text-slate-700">I understand this action cannot be undone.</span>
          </label>

          {localError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-sm text-red-700">{localError}</div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition text-sm"
            >
              Permanently Delete Hotel
            </button>
            <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl transition text-sm">Cancel</button>
          </div>
        </div>
      )}

      {phase === 'executing' && (
        <div className="flex flex-col items-center py-8">
          <Loader2 className="w-8 h-8 text-red-600 animate-spin mb-3" />
          <p className="text-sm font-semibold text-slate-700">Permanently deleting hotel…</p>
          <p className="text-xs text-slate-400 mt-1">Do not close this window.</p>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
            <p className="text-sm font-bold">Hotel permanently deleted</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 max-h-60 overflow-y-auto">
            <p className="text-xs font-semibold text-slate-600 mb-2">Deletion summary by table:</p>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(result.deleted_counts).filter(([, v]) => v > 0).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{PRETTY_TABLE[k] ?? k}</span>
                  <span className="font-semibold text-slate-700 tabular-nums">{v}</span>
                </div>
              ))}
            </div>
          </div>
          {result.auth_user_ids_to_delete && result.auth_user_ids_to_delete.length > 0 && (
            <p className="text-xs text-slate-400">{result.auth_user_ids_to_delete.length} auth account(s) deleted.</p>
          )}
          <p className="text-xs text-slate-400">Audit log recorded. User: {userEmail}</p>
          <button onClick={onSuccess} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl transition text-sm">Return to Hotels List</button>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            <p className="text-sm font-bold">Deletion failed</p>
          </div>
          <p className="text-sm text-red-600">{localError}</p>
          <button onClick={() => setPhase('confirming')} className="w-full bg-slate-700 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-xl transition text-sm">Back</button>
        </div>
      )}
    </ModalShell>
  );
};

// ── Shared Modal Shell ──

const ModalShell = ({ title, onClose, danger, children }: { title: string; onClose: () => void; danger?: boolean; children: React.ReactNode }) => (
  <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
    <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto ${danger ? 'border-2 border-red-300' : ''}`}>
      <div className={`sticky top-0 px-5 py-4 flex items-center justify-between border-b z-10 ${danger ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
        <div className="flex items-center gap-2">
          {danger ? <Shield className="w-5 h-5 text-red-600" /> : <FileJson className="w-5 h-5 text-sky-600" />}
          <h3 className={`text-lg font-bold ${danger ? 'text-red-700' : 'text-slate-900'}`}>{title}</h3>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);
