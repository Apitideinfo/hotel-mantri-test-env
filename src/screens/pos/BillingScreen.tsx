import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Search, X, Receipt, Armchair, BedDouble, ShoppingBag,
  Plus, Minus, Trash2, Printer, FileText, AlertTriangle, CheckCircle2,
  CreditCard, Smartphone, Banknote, Building2, BedDouble as PostRoom,
  ChevronRight, Clock,
} from 'lucide-react';
import type {
  PosOrder, PosOrderItem, PosBill, PosPayment, PosOrderType,
  BillStatus, PaymentMode,
} from '@/lib/types';
import {
  getRunningOrders, getOrderItems, getBillForOrder, getPaymentsForBill,
  saveBill, recordPayment, postToRoom, completeBill, completeBillPostedToRoom,
  voidBill, deletePaymentsForBill, getInHouseRooms, setPosTableStatus,
} from '@/lib/api-pos';
import type { RunningOrder, InHouseRoom } from '@/lib/api-pos';
import { getSettings } from '@/lib/api';
import type { HotelSettings } from '@/lib/types';
import { buildRestaurantBillPDF, restaurantBillFilename } from '@/lib/pdf-pos';
import { useAuth } from '@/lib/auth';

interface BillingScreenProps {
  onBack: () => void;
}

const PAYMENT_MODES: { value: PaymentMode; label: string; icon: React.ReactNode }[] = [
  { value: 'cash', label: 'Cash', icon: <Banknote className="w-4 h-4" /> },
  { value: 'upi', label: 'UPI', icon: <Smartphone className="w-4 h-4" /> },
  { value: 'card', label: 'Card', icon: <CreditCard className="w-4 h-4" /> },
  { value: 'bank', label: 'Bank Transfer', icon: <Building2 className="w-4 h-4" /> },
  { value: 'post_to_room', label: 'Post to Room', icon: <PostRoom className="w-4 h-4" /> },
];

const orderTypeIcon = (type: PosOrderType) => {
  if (type === 'dine_in') return <Armchair className="w-3.5 h-3.5" />;
  if (type === 'room_service') return <BedDouble className="w-3.5 h-3.5" />;
  return <ShoppingBag className="w-3.5 h-3.5" />;
};

const orderTypeLabel = (type: PosOrderType) =>
  type === 'dine_in' ? 'Dine-In' : type === 'room_service' ? 'Room Service' : 'Takeaway';

const billStatusConfig: Record<BillStatus, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-slate-100 text-slate-500' },
  billed: { label: 'Billed', cls: 'bg-blue-50 text-blue-600' },
  paid: { label: 'Paid', cls: 'bg-emerald-50 text-emerald-600' },
  posted_to_room: { label: 'Posted to Room', cls: 'bg-violet-50 text-violet-600' },
  void: { label: 'Void', cls: 'bg-red-50 text-red-500' },
};

const inputCls = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent transition placeholder:text-slate-400';
const labelCls = 'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1';

export const BillingScreen = ({ onBack }: BillingScreenProps) => {
  const { user } = useAuth();
  const [runningOrders, setRunningOrders] = useState<RunningOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Selected order for billing
  const [selectedOrder, setSelectedOrder] = useState<PosOrder | null>(null);
  const [orderItems, setOrderItems] = useState<PosOrderItem[]>([]);
  const [existingBill, setExistingBill] = useState<PosBill | null>(null);
  const [payments, setPayments] = useState<PosPayment[]>([]);
  const [inHouseRooms, setInHouseRooms] = useState<InHouseRoom[]>([]);
  const [settings, setSettings] = useState<HotelSettings | null>(null);

  // Bill editing
  const [discountType, setDiscountType] = useState<'flat' | 'percent'>('flat');
  const [discountValue, setDiscountValue] = useState(0);
  const [discountReason, setDiscountReason] = useState('');

  // Payment entry
  const [payMode, setPayMode] = useState<PaymentMode>('cash');
  const [payAmount, setPayAmount] = useState(0);
  const [payRef, setPayRef] = useState('');
  const [postRoomEntryId, setPostRoomEntryId] = useState('');

  // State
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Void modal
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  // Print modal
  const [printBill, setPrintBill] = useState<PosBill | null>(null);

  // ── Load running orders ──
  const loadRunningOrders = useCallback(async () => {
    try {
      const orders = await getRunningOrders();
      setRunningOrders(orders);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load running orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRunningOrders();
  }, [loadRunningOrders]);

  // ── Load settings ──
  useEffect(() => {
    getSettings().then(setSettings).catch(() => {});
  }, []);

  // ── Open order for billing ──
  const openOrder = useCallback(async (order: RunningOrder) => {
    try {
      // Fetch full order
      const { supabase } = await import('@/lib/supabase');
      const { getCurrentHotelId } = await import('@/lib/api');
      const { data: fullOrder } = await supabase
        .from('pos_orders')
        .select('*')
        .eq('id', order.id)
        .single();
      if (!fullOrder) return;
      const o = fullOrder as PosOrder;
      setSelectedOrder(o);

      const [items, bill, rooms] = await Promise.all([
        getOrderItems(order.id),
        getBillForOrder(order.id),
        getInHouseRooms(),
      ]);
      setOrderItems(items);
      setExistingBill(bill);
      setInHouseRooms(rooms);

      if (bill) {
        setDiscountType((bill.discount_type as 'flat' | 'percent') ?? 'flat');
        setDiscountValue(bill.discount_value ?? 0);
        setDiscountReason(bill.discount_reason ?? '');
        const pays = await getPaymentsForBill(bill.id);
        setPayments(pays);
      } else {
        setDiscountType('flat');
        setDiscountValue(o.discount_value ?? 0);
        setDiscountReason('');
        setPayments([]);
      }

      // Pre-fill post-to-room if room service
      if (o.order_type === 'room_service' && o.room_chart_entry_id) {
        setPostRoomEntryId(o.room_chart_entry_id);
      } else {
        setPostRoomEntryId('');
      }

      setPayAmount(0);
      setPayRef('');
      setMsg(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open order');
    }
  }, []);

  // ── Live bill calculation ──
  const calc = useMemo(() => {
    const subtotal = orderItems.reduce((sum, it) => sum + it.rate * it.quantity, 0);
    let discountAmount = 0;
    if (discountType === 'flat') {
      discountAmount = Math.min(discountValue, subtotal);
    } else {
      discountAmount = (subtotal * Math.min(discountValue, 100)) / 100;
    }
    const taxableAfterDiscount = Math.max(0, subtotal - discountAmount);
    const gstAmount = orderItems.reduce((sum, l) => {
      const lineSubtotal = l.rate * l.quantity;
      const proportion = subtotal > 0 ? lineSubtotal / subtotal : 0;
      const lineDiscount = discountAmount * proportion;
      const lineTaxable = Math.max(0, lineSubtotal - lineDiscount);
      return sum + (lineTaxable * l.gst_percent) / 100;
    }, 0);
    const grandTotal = Math.max(0, taxableAfterDiscount + gstAmount);
    return { subtotal, discountAmount, gstAmount, grandTotal };
  }, [orderItems, discountType, discountValue]);

  // ── Payment totals ──
  const totalPaid = useMemo(() => payments.reduce((s, p) => s + p.amount, 0), [payments]);
  const remaining = useMemo(() => Math.max(0, calc.grandTotal - totalPaid), [calc.grandTotal, totalPaid]);
  const hasPostToRoom = payments.some((p) => p.payment_mode === 'post_to_room');
  const canComplete = useMemo(() => {
    if (hasPostToRoom) return totalPaid >= calc.grandTotal;
    return Math.abs(calc.grandTotal - totalPaid) < 0.01;
  }, [hasPostToRoom, totalPaid, calc.grandTotal]);

  // ── Save bill (create/update) ──
  const handleSaveBill = async () => {
    if (!selectedOrder) return;
    setSaving(true);
    setMsg(null);
    try {
      const bill = await saveBill({
        order_id: selectedOrder.id,
        subtotal: calc.subtotal,
        discount_amount: calc.discountAmount,
        discount_type: discountValue > 0 ? discountType : null,
        discount_value: discountValue > 0 ? discountValue : null,
        discount_reason: discountReason.trim() || null,
        gst_amount: calc.gstAmount,
        grand_total: calc.grandTotal,
        existing_bill_id: existingBill?.id,
      });
      setExistingBill(bill);
      setMsg({ type: 'success', text: `Bill ${bill.bill_number} saved.` });
    } catch (e) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed to save bill' });
    } finally {
      setSaving(false);
    }
  };

  // ── Add payment ──
  const handleAddPayment = async () => {
    if (!selectedOrder || !existingBill || payAmount <= 0) return;
    setSaving(true);
    setMsg(null);
    try {
      if (payMode === 'post_to_room') {
        if (!postRoomEntryId) {
          setMsg({ type: 'error', text: 'Select a room to post to.' });
          setSaving(false);
          return;
        }
        const room = inHouseRooms.find((r) => r.entry_id === postRoomEntryId);
        if (!room) {
          setMsg({ type: 'error', text: 'Selected room not found.' });
          setSaving(false);
          return;
        }
        const { payment } = await postToRoom(
          existingBill.id,
          selectedOrder.id,
          existingBill.bill_number,
          payAmount,
          postRoomEntryId,
          room.guest_name,
          room.room_no,
        );
        setPayments((prev) => [...prev, payment]);
        setMsg({ type: 'success', text: `Posted ₹${payAmount.toFixed(2)} to Room ${room.room_no}.` });
      } else {
        const payment = await recordPayment({
          bill_id: existingBill.id,
          order_id: selectedOrder.id,
          payment_mode: payMode,
          amount: payAmount,
          reference_no: payRef.trim() || null,
        });
        setPayments((prev) => [...prev, payment]);
        setMsg({ type: 'success', text: `Payment of ₹${payAmount.toFixed(2)} recorded.` });
      }
      setPayAmount(0);
      setPayRef('');
    } catch (e) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed to record payment' });
    } finally {
      setSaving(false);
    }
  };

  // ── Remove payment ──
  const handleRemovePayment = async (paymentId: string) => {
    if (!existingBill) return;
    const { supabase } = await import('@/lib/supabase');
    const { error } = await supabase.from('pos_payments').delete().eq('id', paymentId);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    setPayments((prev) => prev.filter((p) => p.id !== paymentId));
  };

  // ── Complete bill ──
  const handleCompleteBill = async () => {
    if (!selectedOrder || !existingBill || !canComplete) return;
    setSaving(true);
    setMsg(null);
    try {
      if (hasPostToRoom) {
        await completeBillPostedToRoom(existingBill.id, selectedOrder.id);
        setMsg({ type: 'success', text: 'Bill posted to room. Order completed.' });
      } else {
        await completeBill(existingBill.id, selectedOrder.id, selectedOrder.table_id);
        if (selectedOrder.table_id) {
          try { await setPosTableStatus(selectedOrder.table_id, 'cleaning'); } catch {}
        }
        setMsg({ type: 'success', text: 'Bill paid. Order completed.' });
      }
      // Refresh running orders
      await loadRunningOrders();
      setSelectedOrder(null);
    } catch (e) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed to complete bill' });
    } finally {
      setSaving(false);
    }
  };

  // ── Void bill ──
  const handleVoidBill = async () => {
    if (!existingBill || !voidReason.trim()) return;
    setSaving(true);
    try {
      await voidBill(existingBill.id, voidReason.trim(), user?.email ?? 'unknown');
      setMsg({ type: 'success', text: 'Bill voided. Audit record kept.' });
      setVoidModalOpen(false);
      setVoidReason('');
      await loadRunningOrders();
      setSelectedOrder(null);
    } catch (e) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed to void bill' });
    } finally {
      setSaving(false);
    }
  };

  // ── Print / PDF ──
  const handlePrint = async () => {
    if (!existingBill || !selectedOrder || !settings) return;
    const doc = buildRestaurantBillPDF({
      settings,
      bill: existingBill,
      order: selectedOrder,
      items: orderItems,
      payments,
    });
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const handleDownloadPDF = () => {
    if (!existingBill || !selectedOrder || !settings) return;
    const doc = buildRestaurantBillPDF({
      settings,
      bill: existingBill,
      order: selectedOrder,
      items: orderItems,
      payments,
    });
    doc.save(restaurantBillFilename(existingBill.bill_number));
  };

  // ── Filter running orders ──
  const filteredOrders = useMemo(() => {
    if (!search) return runningOrders;
    const q = search.toLowerCase();
    return runningOrders.filter((o) =>
      o.order_number.toLowerCase().includes(q) ||
      o.table_name?.toLowerCase().includes(q) ||
      o.room_no?.toLowerCase().includes(q) ||
      o.guest_name?.toLowerCase().includes(q) ||
      o.bill_number?.toLowerCase().includes(q),
    );
  }, [runningOrders, search]);

  // ── LIST VIEW ──
  if (!selectedOrder) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={onBack} className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-brand-600" />
              <h1 className="text-lg font-bold text-brand-navy-800">Billing & Payment</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order no, table, room, guest, bill no…"
              className="bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none w-full"
            />
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Receipt className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-500">No running orders</p>
              <p className="text-xs text-slate-400 mt-1">Open orders with KOT sent will appear here for billing.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredOrders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => openOrder(o)}
                  className="text-left rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-brand-300 transition"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-slate-800">{o.order_number}</span>
                    <span className="flex items-center gap-1 text-xs text-slate-500">{orderTypeIcon(o.order_type)} {orderTypeLabel(o.order_type)}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
                    {o.table_name && <span className="flex items-center gap-1"><Armchair className="w-3 h-3" /> {o.table_name}</span>}
                    {o.room_no && <span className="flex items-center gap-1"><BedDouble className="w-3 h-3" /> Room {o.room_no}</span>}
                    {!o.table_name && !o.room_no && <span className="text-slate-400">Takeaway</span>}
                    {o.guest_name && <span className="text-slate-400 truncate">{o.guest_name}</span>}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-lg font-bold text-brand-600">₹{o.grand_total.toFixed(2)}</span>
                    {o.bill_status ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${billStatusConfig[o.bill_status].cls}`}>
                        {billStatusConfig[o.bill_status].label}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-600">Unbilled</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
                    <Clock className="w-3 h-3" />
                    {new Date(o.created_at).toLocaleString('en-IN')}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── BILL DETAIL VIEW ──
  const billIsPaid = existingBill?.status === 'paid' || existingBill?.status === 'posted_to_room';
  const billIsVoid = existingBill?.status === 'void';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedOrder(null)} className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Receipt className="w-5 h-5 text-brand-600" />
            <h1 className="text-lg font-bold text-brand-navy-800">
              {existingBill ? existingBill.bill_number : `Bill for ${selectedOrder.order_number}`}
            </h1>
            {existingBill && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${billStatusConfig[existingBill.status].cls}`}>
                {billStatusConfig[existingBill.status].label}
              </span>
            )}
          </div>
          {existingBill && !billIsVoid && (
            <div className="flex items-center gap-1">
              <button onClick={handlePrint} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:text-brand-600 transition" title="Print Bill">
                <Printer className="w-4 h-4" />
              </button>
              <button onClick={handleDownloadPDF} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:text-brand-600 transition" title="Download PDF">
                <FileText className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {msg && (
        <div className={`mx-4 mt-3 rounded-lg border px-3 py-2 text-sm flex items-center justify-between ${msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
          <span className="flex items-center gap-2">
            {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {msg.text}
          </span>
          <button onClick={() => setMsg(null)} className="opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left: Order info + items */}
        <div className="flex-1 p-4">
          {/* Order info */}
          <div className="rounded-xl bg-white border border-slate-200 p-4 mb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase">Order No.</p>
                <p className="text-sm font-bold text-slate-800">{selectedOrder.order_number}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase">Order Type</p>
                <p className="text-sm font-semibold text-slate-700 flex items-center gap-1">{orderTypeIcon(selectedOrder.order_type)} {orderTypeLabel(selectedOrder.order_type)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase">{selectedOrder.table_id ? 'Table' : selectedOrder.room_no ? 'Room' : 'Customer'}</p>
                <p className="text-sm font-semibold text-slate-700">
                  {selectedOrder.table_id ? 'Table' : selectedOrder.room_no ? `Room ${selectedOrder.room_no}` : selectedOrder.guest_name ?? 'Walk-in'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase">Date & Time</p>
                <p className="text-sm font-semibold text-slate-700">{new Date(selectedOrder.created_at).toLocaleString('en-IN')}</p>
              </div>
            </div>
          </div>

          {/* Items table */}
          <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Ordered Items</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500 uppercase">
                    <th className="text-left px-4 py-2 font-semibold">Item</th>
                    <th className="text-center px-2 py-2 font-semibold">Qty</th>
                    <th className="text-right px-2 py-2 font-semibold">Rate</th>
                    <th className="text-center px-2 py-2 font-semibold">GST</th>
                    <th className="text-right px-4 py-2 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((it) => (
                    <tr key={it.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-sm border ${it.is_veg ? 'border-emerald-500 bg-emerald-50' : 'border-red-400 bg-red-50'}`} />
                          <span className="font-semibold text-slate-800">{it.name}</span>
                        </div>
                        {it.note && <p className="text-xs text-amber-600 ml-3.5 mt-0.5">Note: {it.note}</p>}
                      </td>
                      <td className="text-center px-2 py-2.5 tabular-nums text-slate-700">{it.quantity}</td>
                      <td className="text-right px-2 py-2.5 tabular-nums text-slate-600">₹{it.rate.toFixed(2)}</td>
                      <td className="text-center px-2 py-2.5 tabular-nums text-slate-500">{it.gst_percent}%</td>
                      <td className="text-right px-4 py-2.5 tabular-nums font-semibold text-slate-800">₹{(it.rate * it.quantity).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Bill calc + payment */}
        <div className="lg:w-[400px] lg:border-l border-t lg:border-t-0 border-slate-200 bg-white flex flex-col">
          {/* Bill calculation */}
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Bill Calculation</h2>

            {/* Discount */}
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2">
                <label className={labelCls} style={{ marginBottom: 0 }}>Discount</label>
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value as 'flat' | 'percent')} disabled={billIsPaid || billIsVoid} className="px-2 py-1.5 border border-slate-200 rounded-lg bg-white text-xs text-slate-600 focus:outline-none disabled:opacity-60">
                  <option value="flat">₹ Flat</option>
                  <option value="percent">% Percent</option>
                </select>
                <input type="number" min={0} value={discountValue} onChange={(e) => setDiscountValue(Number(e.target.value))} disabled={billIsPaid || billIsVoid} className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 text-right focus:outline-none disabled:opacity-60" />
              </div>
              <input type="text" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} disabled={billIsPaid || billIsVoid} placeholder="Discount reason (optional)" className={`${inputCls} text-xs disabled:opacity-60`} />
            </div>

            {/* Totals */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-semibold text-slate-700 tabular-nums">₹{calc.subtotal.toFixed(2)}</span>
              </div>
              {calc.discountAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Discount</span>
                  <span className="font-semibold text-red-500 tabular-nums">-₹{calc.discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">GST</span>
                <span className="font-semibold text-slate-700 tabular-nums">₹{calc.gstAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-100">
                <span className="text-base font-bold text-slate-800">Grand Total</span>
                <span className="text-base font-bold text-brand-600 tabular-nums">₹{calc.grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Save bill button */}
            {!billIsPaid && !billIsVoid && (
              <button
                onClick={handleSaveBill}
                disabled={saving}
                className="w-full mt-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-50"
              >
                {saving ? 'Saving…' : existingBill ? 'Update Bill' : 'Save Bill'}
              </button>
            )}
          </div>

          {/* Payments */}
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Payments</h2>

            {/* Existing payments */}
            {payments.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-600">
                        {p.payment_mode === 'post_to_room' ? 'Post to Room' : p.payment_mode.toUpperCase()}
                      </span>
                      {p.reference_no && <span className="text-xs text-slate-400">{p.reference_no}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-700 tabular-nums">₹{p.amount.toFixed(2)}</span>
                      {!billIsPaid && !billIsVoid && (
                        <button onClick={() => handleRemovePayment(p.id)} className="text-slate-300 hover:text-red-500 transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between pt-1">
                  <span className="text-xs font-semibold text-slate-500">Total Paid</span>
                  <span className="text-sm font-bold text-slate-700 tabular-nums">₹{totalPaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs font-semibold text-slate-500">Remaining</span>
                  <span className={`text-sm font-bold tabular-nums ${remaining > 0.01 ? 'text-red-500' : 'text-emerald-600'}`}>₹{remaining.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Add payment */}
            {!billIsPaid && !billIsVoid && existingBill && (
              <div className="space-y-2">
                {/* Payment mode selector */}
                <div className="grid grid-cols-5 gap-1">
                  {PAYMENT_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => setPayMode(mode.value)}
                      className={`flex flex-col items-center gap-0.5 rounded-lg border py-2 transition ${payMode === mode.value ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                      title={mode.label}
                    >
                      {mode.icon}
                      <span className="text-[9px] font-semibold">{mode.label === 'Bank Transfer' ? 'Bank' : mode.label === 'Post to Room' ? 'Room' : mode.label}</span>
                    </button>
                  ))}
                </div>

                {/* Post to room: room selector */}
                {payMode === 'post_to_room' && (
                  <div>
                    <label className={labelCls}>Room (in-house only)</label>
                    <select value={postRoomEntryId} onChange={(e) => setPostRoomEntryId(e.target.value)} className={inputCls}>
                      <option value="">Select room…</option>
                      {inHouseRooms.map((r) => (
                        <option key={r.entry_id} value={r.entry_id}>Room {r.room_no} — {r.guest_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Amount + ref */}
                <div className="flex gap-2">
                  <input type="number" min={0} value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} placeholder="Amount" className={`${inputCls} flex-1`} />
                  {payMode !== 'cash' && payMode !== 'post_to_room' && (
                    <input type="text" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Ref no" className={`${inputCls} w-28`} />
                  )}
                </div>

                {/* Quick fill remaining */}
                {remaining > 0 && (
                  <button onClick={() => setPayAmount(remaining)} className="w-full text-xs font-semibold text-brand-600 hover:text-brand-700 text-left">
                    Fill remaining: ₹{remaining.toFixed(2)}
                  </button>
                )}

                <button
                  onClick={handleAddPayment}
                  disabled={saving || payAmount <= 0}
                  className="w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4 inline mr-1" /> Add Payment
                </button>
              </div>
            )}

            {!existingBill && !billIsVoid && (
              <p className="text-xs text-slate-400 text-center py-2">Save the bill first to add payments.</p>
            )}
          </div>

          {/* Complete + Void */}
          {existingBill && !billIsVoid && (
            <div className="px-4 py-3 border-t border-slate-200 space-y-2">
              {!billIsPaid && (
                <>
                  <button
                    onClick={handleCompleteBill}
                    disabled={saving || !canComplete}
                    className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {hasPostToRoom ? 'Complete (Posted to Room)' : 'Complete & Mark Paid'}
                  </button>
                  {!canComplete && totalPaid > 0 && (
                    <p className="text-xs text-red-500 text-center">
                      {hasPostToRoom
                        ? 'Post to Room amount must cover the full total.'
                        : `Payment difference: ₹${Math.abs(calc.grandTotal - totalPaid).toFixed(2)} — bill cannot be closed.`}
                    </p>
                  )}
                </>
              )}
              {billIsPaid && (
                <p className="text-xs text-emerald-600 text-center font-semibold">
                  {existingBill.status === 'posted_to_room' ? 'Bill posted to room folio.' : 'Bill paid and completed.'}
                </p>
              )}

              {/* Void */}
              {!billIsPaid && (
                <button
                  onClick={() => setVoidModalOpen(true)}
                  className="w-full rounded-xl border border-red-200 px-4 py-2 text-xs font-semibold text-red-500 transition hover:bg-red-50"
                >
                  Void Bill
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Void modal */}
      {voidModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-navy/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setVoidModalOpen(false); }}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h2 className="text-base font-bold text-brand-navy-800">Void Bill</h2>
              </div>
              <button onClick={() => setVoidModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              This bill will be marked as voided and kept in audit history. It will not be hard-deleted.
            </p>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Reason for voiding (required)…"
              rows={3}
              className={`${inputCls} resize-none`}
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setVoidModalOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button
                onClick={handleVoidBill}
                disabled={!voidReason.trim() || saving}
                className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-60"
              >
                {saving ? 'Voiding…' : 'Void Bill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
