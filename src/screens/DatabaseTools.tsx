import { useState } from 'react';
import {
  Shield, LogOut, ArrowLeft, AlertTriangle, Trash2, RefreshCw,
  CheckCircle2, X, FileText, BedDouble, Receipt, Wallet, Users, Building2, RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface DatabaseToolsProps {
  onBack: () => void;
  onSignOut: () => void;
}

interface ToolAction {
  key: string;
  label: string;
  description: string;
  icon: typeof FileText;
  color: string;
  iconColor: string;
}

const ACTIONS: ToolAction[] = [
  { key: 'delete_all_daily_reports', label: 'Delete All Daily Reports', description: 'Removes every daily report record across all hotels.', icon: FileText, color: 'border-sky-200 hover:bg-sky-50', iconColor: 'text-sky-600' },
  { key: 'delete_all_room_charts', label: 'Delete All Room Charts', description: 'Removes every room chart entry across all hotels.', icon: BedDouble, color: 'border-indigo-200 hover:bg-indigo-50', iconColor: 'text-indigo-600' },
  { key: 'delete_all_expenses', label: 'Delete All Expenses', description: 'Removes expense entries, utility bills, electricity readings, monthly bills, and other daily entries.', icon: Receipt, color: 'border-amber-200 hover:bg-amber-50', iconColor: 'text-amber-600' },
  { key: 'delete_all_salary_records', label: 'Delete All Salary Records', description: 'Removes all salary advances and salary settlements.', icon: Wallet, color: 'border-orange-200 hover:bg-orange-50', iconColor: 'text-orange-600' },
  { key: 'delete_all_staff', label: 'Delete All Staff', description: 'Removes all staff member records across all hotels.', icon: Users, color: 'border-teal-200 hover:bg-teal-50', iconColor: 'text-teal-600' },
  { key: 'delete_demo_hotels', label: 'Delete All Demo Hotels', description: 'Removes hotels that have no admin account linked. Protected hotels with real admins are never deleted.', icon: Building2, color: 'border-rose-200 hover:bg-rose-50', iconColor: 'text-rose-600' },
  { key: 'reset_demo_data', label: 'Reset Demo Data', description: 'Clears all transactional data (reports, charts, expenses, salary, staff, laundry) across all hotels. Keeps hotels, settings, plans, and admin accounts.', icon: RotateCcw, color: 'border-red-300 hover:bg-red-50', iconColor: 'text-red-600' },
];

export const DatabaseTools = ({ onBack, onSignOut }: DatabaseToolsProps) => {
  const { user } = useAuth();
  const [confirmAction, setConfirmAction] = useState<ToolAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callDbTools = async (action: string): Promise<{ deleted: number }> => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) throw new Error('No active session');

    const res = await fetch(`${SUPABASE_URL}/functions/v1/db-tools`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    try {
      setBusy(true);
      setError(null);
      setSuccess(null);
      const result = await callDbTools(confirmAction.key);
      setSuccess(`${confirmAction.label} completed successfully. ${result.deleted} record(s) removed.`);
      setConfirmAction(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-slate-200 text-slate-900 px-4 py-3 flex items-center gap-3 shadow-xs">
        <button onClick={onBack} className="p-1.5 text-slate-500 hover:text-slate-900 transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Shield className="w-5 h-5 text-sky-600" />
        <div className="flex-1">
          <h1 className="text-base font-bold leading-tight text-slate-900">Database Tools</h1>
          <p className="text-slate-400 text-xs">{user?.email}</p>
        </div>
        <button onClick={onSignOut} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-rose-600 transition">
          <LogOut className="w-4 h-4 text-rose-500" /> Sign Out
        </button>
      </header>

      <main className="px-4 py-4 space-y-4 w-full">
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-3">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> <span>{success}</span>
          </div>
        )}

        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-800">
            These actions permanently delete data and cannot be undone. Use with caution.
          </p>
        </div>

        <div className="space-y-2.5">
          {ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                onClick={() => { setConfirmAction(action); setError(null); setSuccess(null); }}
                disabled={busy}
                className={`w-full text-left bg-white rounded-xl border ${action.color} p-3.5 transition disabled:opacity-50`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg bg-slate-50 ${action.iconColor}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{action.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">{action.description}</p>
                  </div>
                  <Trash2 className="w-4 h-4 text-slate-300 shrink-0 mt-1" />
                </div>
              </button>
            );
          })}
        </div>
      </main>

      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h3 className="text-base font-bold text-slate-900">Confirm Deletion</h3>
            </div>
            <p className="text-sm text-slate-600">
              Are you sure you want to <span className="font-semibold text-slate-900">{confirmAction.label}</span>?
              This action cannot be undone.
            </p>
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">
              {confirmAction.description}
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleConfirm}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition"
              >
                {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {busy ? 'Deleting…' : 'Delete'}
              </button>
              <button
                onClick={() => { setConfirmAction(null); }}
                disabled={busy}
                className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-xl transition"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
