import { useState, useMemo } from 'react';
import {
  X, Loader2, AlertCircle, CheckCircle2, CalendarPlus, Calendar, IndianRupee,
} from 'lucide-react';
import type { RoomChartEntry, FrontOfficeRole } from '@/lib/types';
import { fmtMoney, toNum, calcGstFull } from '@/lib/calc';
import { extendStay, validateExtendStay } from '@/lib/api-frontoffice';
import { brand } from '@/lib/theme';

interface ExtendStayModalProps {
  entry: RoomChartEntry;
  role: FrontOfficeRole | null;
  onClose: () => void;
  onExtended: () => void;
}

const addDays = (d: string, n: number): string => {
  const dt = new Date(d + 'T00:00:00');
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};

export const ExtendStayModal = ({ entry, role, onClose, onExtended }: ExtendStayModalProps) => {
  const currentCheckIn = entry.arrival ?? entry.report_date;
  const currentCheckOut = entry.departure ?? entry.report_date;
  const [newCheckOut, setNewCheckOut] = useState(addDays(currentCheckOut, 1));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const currentNights = toNum(entry.nights);
  const newNights = useMemo(() => {
    if (!newCheckOut) return currentNights;
    return Math.max(1, Math.round(
      (new Date(newCheckOut + 'T00:00:00').getTime() - new Date(currentCheckIn + 'T00:00:00').getTime()) / 86400000,
    ));
  }, [newCheckOut, currentCheckIn, currentNights]);

  const newSubtotal = toNum(entry.room_rate) * newNights;
  const { invoiceTotal, gst } = calcGstFull(newSubtotal, entry.gst_type, entry.gst_slab);
  const alreadyReceived = toNum(entry.pay_cash) + toNum(entry.pay_upi) + toNum(entry.pay_card) + toNum(entry.pay_bank);
  const newBalance = Math.max(0, invoiceTotal - alreadyReceived);
  const extraNights = newNights - currentNights;
  const extraCost = Math.max(0, invoiceTotal - toNum(entry.invoice_total));

  const handleExtend = async () => {
    setError(null);
    const validationError = validateExtendStay(currentCheckIn, newCheckOut);
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    try {
      await extendStay({ entryId: entry.id, newCheckOut });
      setSuccess(true);
      setTimeout(() => { onExtended(); }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extend stay failed');
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <>
        <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm pointer-events-auto">
            <div className="px-6 py-8 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Stay Extended!</h2>
              <p className="text-sm text-slate-400 mt-1">
                {entry.guest_name} · Room {entry.room_no} → {newCheckOut}
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col pointer-events-auto">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between" style={{ background: brand.navy }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <CalendarPlus className="w-5 h-5 text-brand-gold-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Extend Stay</h2>
                <p className="text-xs text-brand-navy-300">{entry.guest_name} · Room {entry.room_no}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-brand-navy-300">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            {/* Current stay */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Current Check-in</span>
                <span className="font-medium text-slate-800">{currentCheckIn}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Current Check-out</span>
                <span className="font-medium text-slate-800">{currentCheckOut}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Current Nights</span>
                <span className="font-medium text-slate-800">{currentNights}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Current Total</span>
                <span className="font-medium text-slate-800">₹{fmtMoney(toNum(entry.invoice_total))}</span>
              </div>
            </div>

            {/* New checkout */}
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">New Check-out Date *</span>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="date" value={newCheckOut} min={addDays(currentCheckOut, 1)}
                  onChange={(e) => setNewCheckOut(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
              </div>
            </label>

            {/* Updated billing */}
            <div className="bg-brand-50 rounded-xl p-3 border border-brand-100 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">New Nights</span>
                <span className="font-semibold text-slate-800">{newNights} {extraNights > 0 && <span className="text-brand-600 text-xs">(+{extraNights})</span>}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">New Subtotal</span>
                <span className="font-semibold text-slate-800">₹{fmtMoney(newSubtotal)}</span>
              </div>
              {gst > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">GST</span>
                  <span className="font-semibold text-slate-800">₹{fmtMoney(gst)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm pt-2 border-t border-brand-200">
                <span className="font-bold text-brand-navy-800">New Invoice Total</span>
                <span className="font-bold text-brand-navy-800 text-base">₹{fmtMoney(invoiceTotal)}</span>
              </div>
              {extraCost > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-amber-600 font-medium">Additional Cost</span>
                  <span className="font-bold text-amber-700">+ ₹{fmtMoney(extraCost)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Already Received</span>
                <span className="font-medium text-emerald-600">₹{fmtMoney(alreadyReceived)}</span>
              </div>
              <div className="flex items-center justify-between bg-amber-100 rounded-lg px-3 py-1.5">
                <span className="text-sm font-semibold text-amber-700">New Balance</span>
                <span className="text-sm font-bold text-amber-700">₹{fmtMoney(newBalance)}</span>
              </div>
            </div>
          </div>

          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50">
            <button onClick={handleExtend} disabled={saving}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-lg disabled:opacity-60 transition shadow-soft-blue">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}
              Extend Stay to {newCheckOut}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
