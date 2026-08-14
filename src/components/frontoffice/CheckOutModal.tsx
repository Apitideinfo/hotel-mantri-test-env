import { useState, useEffect, useMemo } from 'react';
import {
  X, Loader2, AlertCircle, CheckCircle2, LogOut, IndianRupee,
  Wallet, Smartphone, CreditCard, Banknote, FileText, Receipt,
  BedDouble, Clock, ShieldAlert, Plus, Trash2,
} from 'lucide-react';
import type {
  RoomChartEntry, FolioCharge, FolioChargeType, FrontOfficeRole,
} from '@/lib/types';
import { fmtMoney, toNum } from '@/lib/calc';
import {
  checkOutGuest, getFolioCharges, addFolioCharge, deleteFolioCharge,
} from '@/lib/api-frontoffice';
import { brand } from '@/lib/theme';

interface CheckOutModalProps {
  entry: RoomChartEntry;
  roomNo: string;
  role: FrontOfficeRole | null;
  onClose: () => void;
  onCheckedOut: () => void;
}

const CHARGE_TYPES: FolioChargeType[] = ['Laundry', 'Minibar', 'Extra Bed', 'Room Service', 'Other'];

export const CheckOutModal = ({ entry, roomNo, role, onClose, onCheckedOut }: CheckOutModalProps) => {
  const [charges, setCharges] = useState<FolioCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectCash, setCollectCash] = useState(0);
  const [collectUpi, setCollectUpi] = useState(0);
  const [collectCard, setCollectCard] = useState(0);
  const [collectBank, setCollectBank] = useState(0);
  const [checkoutAnyway, setCheckoutAnyway] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Add charge form
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [newChargeType, setNewChargeType] = useState<FolioChargeType>('Laundry');
  const [newChargeDesc, setNewChargeDesc] = useState('');
  const [newChargeAmount, setNewChargeAmount] = useState(0);
  const [newChargeQty, setNewChargeQty] = useState(1);

  const canAnyway = role === 'admin' || role === 'super_admin';

  useEffect(() => {
    getFolioCharges(entry.id).then((c) => {
      setCharges(c);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [entry.id]);

  const roomCharges = toNum(entry.total);
  const extraTotal = charges.reduce((s, c) => s + toNum(c.amount) * toNum(c.quantity), 0);
  const gstAmount = toNum(entry.gst_amount);
  const discount = toNum(entry.pay_balance) < 0 ? Math.abs(toNum(entry.pay_balance)) : 0;
  const grandTotal = toNum(entry.invoice_total) + extraTotal;
  const alreadyReceived = toNum(entry.pay_cash) + toNum(entry.pay_upi) + toNum(entry.pay_card) + toNum(entry.pay_bank);
  const balance = Math.max(0, grandTotal - alreadyReceived);
  const collectingNow = toNum(collectCash) + toNum(collectUpi) + toNum(collectCard) + toNum(collectBank);
  const remainingAfterCollect = Math.max(0, balance - collectingNow);

  const handleAddCharge = async () => {
    if (newChargeAmount <= 0) { setError('Charge amount must be greater than 0.'); return; }
    setSaving(true);
    setError(null);
    try {
      const newCharge = await addFolioCharge({
        entry_id: entry.id,
        charge_type: newChargeType,
        description: newChargeDesc,
        amount: newChargeAmount,
        quantity: newChargeQty,
      });
      setCharges((prev) => [...prev, newCharge]);
      setNewChargeType('Laundry');
      setNewChargeDesc('');
      setNewChargeAmount(0);
      setNewChargeQty(1);
      setShowAddCharge(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add charge');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCharge = async (id: string) => {
    setSaving(true);
    try {
      await deleteFolioCharge(id);
      setCharges((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete charge');
    } finally {
      setSaving(false);
    }
  };

  const handleCheckOut = async () => {
    setError(null);
    if (balance > 0 && collectingNow < balance && !checkoutAnyway) {
      setError(`Pending balance of ₹${fmtMoney(balance)}. Collect balance or use "Checkout Anyway" (requires Admin permission).`);
      return;
    }
    setSaving(true);
    try {
      await checkOutGuest({
        entryId: entry.id,
        roomNo,
        collectCash,
        collectUpi,
        collectCard,
        collectBank,
        checkoutAnyway,
      });
      setSuccess(true);
      setTimeout(() => { onCheckedOut(); }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
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
              <h2 className="text-lg font-bold text-slate-800">Checked Out!</h2>
              <p className="text-sm text-slate-400 mt-1">{entry.guest_name} · Room {roomNo}</p>
              <p className="text-xs text-slate-400 mt-2">Room is now Vacant Dirty</p>
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
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col pointer-events-auto">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between" style={{ background: brand.navy }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <LogOut className="w-5 h-5 text-brand-gold-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Check-Out</h2>
                <p className="text-xs text-brand-navy-300">{entry.guest_name} · Room {roomNo}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-brand-navy-300">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            {/* Guest Folio */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="bg-brand-navy-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-bold text-brand-navy-800 uppercase tracking-wide">Guest Folio</h3>
                <FileText className="w-4 h-4 text-brand-navy-400" />
              </div>
              <div className="p-4 space-y-2">
                <FolioRow icon={BedDouble} label="Room Charges" value={`₹${fmtMoney(roomCharges)}`} />
                {loading ? (
                  <p className="text-xs text-slate-400">Loading extra charges…</p>
                ) : charges.length === 0 ? (
                  <p className="text-xs text-slate-400">No extra charges</p>
                ) : (
                  charges.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-sm group">
                      <span className="flex items-center gap-1.5 text-slate-600">
                        <Receipt className="w-3.5 h-3.5 text-slate-400" />
                        {c.charge_type}{c.description ? ` · ${c.description}` : ''}
                        {c.quantity > 1 && <span className="text-xs text-slate-400">×{c.quantity}</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">₹{fmtMoney(toNum(c.amount) * toNum(c.quantity))}</span>
                        <button onClick={() => handleDeleteCharge(c.id)}
                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    </div>
                  ))
                )}
                {gstAmount > 0 && <FolioRow icon={Receipt} label="GST" value={`₹${fmtMoney(gstAmount)}`} />}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <span className="text-sm font-bold text-brand-navy-800">Grand Total</span>
                  <span className="text-sm font-bold text-brand-navy-800 text-base">₹{fmtMoney(grandTotal)}</span>
                </div>
                <FolioRow icon={Wallet} label="Already Received" value={`₹${fmtMoney(alreadyReceived)}`} />
                <div className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2">
                  <span className="text-sm font-semibold text-amber-700">Pending Balance</span>
                  <span className="text-sm font-bold text-amber-700">₹{fmtMoney(balance)}</span>
                </div>
              </div>
            </div>

            {/* Add extra charge */}
            {showAddCharge ? (
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select value={newChargeType} onChange={(e) => setNewChargeType(e.target.value as FolioChargeType)}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                    {CHARGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="number" placeholder="Amount" value={newChargeAmount === 0 ? '' : newChargeAmount}
                    onChange={(e) => setNewChargeAmount(Math.max(0, Number(e.target.value)))}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input placeholder="Description" value={newChargeDesc}
                    onChange={(e) => setNewChargeDesc(e.target.value)}
                    className="col-span-2 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                  <input type="number" placeholder="Qty" min={1} value={newChargeQty}
                    onChange={(e) => setNewChargeQty(Math.max(1, Number(e.target.value)))}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddCharge} disabled={saving}
                    className="flex-1 px-3 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50">
                    {saving ? 'Adding…' : 'Add Charge'}
                  </button>
                  <button onClick={() => setShowAddCharge(false)}
                    className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddCharge(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition">
                <Plus className="w-4 h-4" /> Add Extra Charge
              </button>
            )}

            {/* Collect balance */}
            {balance > 0 && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">Collect Balance</p>
                  <div className="grid grid-cols-2 gap-3">
                    <CollectField icon={Wallet} label="Cash" value={collectCash} onChange={setCollectCash} />
                    <CollectField icon={Smartphone} label="UPI" value={collectUpi} onChange={setCollectUpi} />
                    <CollectField icon={CreditCard} label="Card" value={collectCard} onChange={setCollectCard} />
                    <CollectField icon={Banknote} label="Bank" value={collectBank} onChange={setCollectBank} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-50 rounded-xl px-3 py-2.5 border border-emerald-200">
                    <span className="block text-xs font-medium text-emerald-600 mb-0.5">Collecting Now</span>
                    <p className="font-bold text-emerald-700 text-base">₹{fmtMoney(collectingNow)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl px-3 py-2.5 border border-amber-200">
                    <span className="block text-xs font-medium text-amber-600 mb-0.5">Remaining</span>
                    <p className="font-bold text-amber-700 text-base">₹{fmtMoney(remainingAfterCollect)}</p>
                  </div>
                </div>

                {/* Checkout Anyway (permission based) */}
                {canAnyway && remainingAfterCollect > 0 && (
                  <button onClick={() => setCheckoutAnyway((v) => !v)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition ${
                      checkoutAnyway
                        ? 'border-red-500 bg-red-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}>
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center ${
                      checkoutAnyway ? 'bg-red-500' : 'border-2 border-slate-300'
                    }`}>
                      {checkoutAnyway && <CheckCircle2 className="w-4 h-4 text-white" />}
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-red-500" />
                        Checkout Anyway (Skip Balance)
                      </p>
                      <p className="text-xs text-slate-400">Admin override — allows checkout with pending balance</p>
                    </div>
                  </button>
                )}
                {!canAnyway && remainingAfterCollect > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-slate-400" />
                    <p className="text-xs text-slate-500">
                      Checkout Anyway requires <strong>Admin</strong> permission. Collect the full balance to proceed.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Checkout button */}
            <button onClick={handleCheckOut} disabled={saving}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-lg disabled:opacity-60 transition shadow-soft-blue">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              Confirm Check-Out
            </button>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                After checkout, the room becomes <strong>Vacant Dirty</strong>. It will be available for new guests
                only after housekeeping marks it <strong>Vacant Clean</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const FolioRow = ({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="flex items-center gap-1.5 text-slate-600">
      <Icon className="w-3.5 h-3.5 text-slate-400" />
      {label}
    </span>
    <span className="font-medium text-slate-800">{value}</span>
  </div>
);

const CollectField = ({ icon: Icon, label, value, onChange }: {
  icon: typeof Wallet; label: string; value: number; onChange: (v: number) => void;
}) => (
  <label className="block">
    <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input type="number" min={0} value={value === 0 ? '' : value} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        placeholder="0"
        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
    </div>
  </label>
);
