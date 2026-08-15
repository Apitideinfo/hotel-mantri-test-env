import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ArrowLeft, Search, Plus, Minus, X, UtensilsCrossed, Leaf, Drumstick,
  Armchair, BedDouble, ShoppingBag, User, Phone, Users, ChefHat,
  CheckCircle2, AlertCircle, StickyNote,
} from 'lucide-react';
import type {
  PosMenuItem, PosMenuCategory, PosTable, PosArea,
  PosOrderType, CartLine, PosOrder,
} from '@/lib/types';
import { POS_TABLE_STATUSES } from '@/lib/types';
import {
  getPosItems, getPosCategories, getPosTables, getPosAreas,
  getInHouseRooms, getRunningOrderByTable, getOrderItems,
  saveAndSendKot, saveOrderWithItems, setPosTableStatus,
} from '@/lib/api-pos';
import type { InHouseRoom } from '@/lib/api-pos';

interface NewOrderScreenProps {
  onBack: () => void;
  onNavigate?: (screen: string) => void;
}

type VegFilter = 'all' | 'veg' | 'nonveg';

export const NewOrderScreen = ({ onBack }: NewOrderScreenProps) => {
  const [orderType, setOrderType] = useState<PosOrderType>('dine_in');

  // Master data
  const [menuItems, setMenuItems] = useState<PosMenuItem[]>([]);
  const [categories, setCategories] = useState<PosMenuCategory[]>([]);
  const [tables, setTables] = useState<PosTable[]>([]);
  const [areas, setAreas] = useState<PosArea[]>([]);
  const [inHouseRooms, setInHouseRooms] = useState<InHouseRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Order context
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [guestCount, setGuestCount] = useState(2);
  const [waiterName, setWaiterName] = useState('');
  const [selectedRoomEntryId, setSelectedRoomEntryId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Existing running order (when opening an occupied table)
  const [existingOrder, setExistingOrder] = useState<PosOrder | null>(null);

  // Menu filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [vegFilter, setVegFilter] = useState<VegFilter>('all');
  const [showSoldOut, setShowSoldOut] = useState(false);

  // Cart
  const [cart, setCart] = useState<CartLine[]>([]);
  const [noteModalItemId, setNoteModalItemId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  // Discount
  const [discountType, setDiscountType] = useState<'flat' | 'percent'>('flat');
  const [discountValue, setDiscountValue] = useState(0);

  // Saving
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Load master data ──
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [items, cats, tbls, ars, rooms] = await Promise.all([
          getPosItems(), getPosCategories(), getPosTables(), getPosAreas(), getInHouseRooms(),
        ]);
        setMenuItems(items);
        setCategories(cats);
        setTables(tbls);
        setAreas(ars);
        setInHouseRooms(rooms);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load POS data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── When table is selected, check for running order ──
  const onTableSelect = useCallback(async (tableId: string) => {
    setSelectedTableId(tableId);
    setExistingOrder(null);
    setCart([]);
    if (!tableId) return;
    try {
      const running = await getRunningOrderByTable(tableId);
      if (running) {
        setExistingOrder(running);
        // Load existing items into cart
        const items = await getOrderItems(running.id);
        setCart(items.map((it) => ({
          key: `${it.menu_item_id ?? it.id}-${it.note ?? ''}`,
          menu_item_id: it.menu_item_id ?? '',
          name: it.name,
          is_veg: it.is_veg,
          rate: it.rate,
          gst_percent: it.gst_percent,
          quantity: it.quantity,
          note: it.note ?? '',
        })));
        setGuestCount(running.guest_count ?? 2);
        setWaiterName(running.waiter_name ?? '');
      }
    } catch (e) {
      // ignore — treat as new order
    }
  }, []);

  // ── Filtered menu items ──
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menuItems.filter((item) => {
      if (!showSoldOut && !item.is_available) return false;
      if (!item.is_active) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      if (categoryFilter !== 'all' && item.category_id !== categoryFilter) return false;
      if (vegFilter === 'veg' && !item.is_veg) return false;
      if (vegFilter === 'nonveg' && item.is_veg) return false;
      return true;
    });
  }, [menuItems, search, categoryFilter, vegFilter, showSoldOut]);

  // ── Cart operations ──
  const addToCart = (item: PosMenuItem) => {
    setCart((prev) => {
      // Only merge if same item AND same (empty) note
      const existingNoNote = prev.find((l) => l.menu_item_id === item.id && !l.note);
      if (existingNoNote) {
        return prev.map((l) =>
          l.key === existingNoNote.key ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          key: `${item.id}-${Date.now()}`,
          menu_item_id: item.id,
          name: item.name,
          is_veg: item.is_veg,
          rate: item.price,
          gst_percent: item.gst_percent,
          quantity: 1,
          note: '',
        },
      ];
    });
  };

  const changeQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  };

  const removeLine = (key: string) => {
    setCart((prev) => prev.filter((l) => l.key !== key));
  };

  const openNoteModal = (key: string) => {
    const line = cart.find((l) => l.key === key);
    setNoteModalItemId(key);
    setNoteText(line?.note ?? '');
  };

  const saveNote = () => {
    if (noteModalItemId) {
      setCart((prev) =>
        prev.map((l) => (l.key === noteModalItemId ? { ...l, note: noteText.trim() } : l)),
      );
    }
    setNoteModalItemId(null);
    setNoteText('');
  };

  // ── Live calculation ──
  const calc = useMemo(() => {
    const subtotal = cart.reduce((sum, l) => sum + l.rate * l.quantity, 0);
    let discountAmount = 0;
    if (discountType === 'flat') {
      discountAmount = Math.min(discountValue, subtotal);
    } else {
      discountAmount = (subtotal * Math.min(discountValue, 100)) / 100;
    }
    const taxableAfterDiscount = Math.max(0, subtotal - discountAmount);
    // GST is per-item on the proportionate taxable amount
    const gstAmount = cart.reduce((sum, l) => {
      const lineSubtotal = l.rate * l.quantity;
      const proportion = subtotal > 0 ? lineSubtotal / subtotal : 0;
      const lineDiscount = discountAmount * proportion;
      const lineTaxable = Math.max(0, lineSubtotal - lineDiscount);
      return sum + (lineTaxable * l.gst_percent) / 100;
    }, 0);
    const grandTotal = Math.max(0, taxableAfterDiscount + gstAmount);
    return { subtotal, discountAmount, gstAmount, grandTotal };
  }, [cart, discountType, discountValue]);

  // ── Validation ──
  const canSave = useMemo(() => {
    if (cart.length === 0) return false;
    if (orderType === 'dine_in' && !selectedTableId) return false;
    if (orderType === 'room_service' && !selectedRoomEntryId) return false;
    return true;
  }, [cart.length, orderType, selectedTableId, selectedRoomEntryId]);

  // ── Active tables for dine-in ──
  const activeTables = useMemo(() => tables.filter((t) => t.is_active), [tables]);
  const areaName = (id: string | null) => id ? areas.find((a) => a.id === id)?.name ?? '' : '';
  const selectedRoom = inHouseRooms.find((r) => r.entry_id === selectedRoomEntryId);

  // ── Save / Send KOT ──
  const buildOrderInput = (status: 'open' | 'kot_sent') => ({
    order_type: orderType,
    table_id: orderType === 'dine_in' ? selectedTableId : null,
    room_chart_entry_id: orderType === 'room_service' ? selectedRoomEntryId : null,
    room_no: orderType === 'room_service' ? selectedRoom?.room_no ?? null : null,
    guest_name: orderType === 'room_service' ? selectedRoom?.guest_name ?? null : customerName || null,
    guest_phone: orderType === 'takeaway' ? customerPhone || null : null,
    guest_count: orderType === 'dine_in' ? guestCount : null,
    waiter_name: orderType === 'dine_in' ? waiterName || null : null,
    subtotal: calc.subtotal,
    discount_amount: calc.discountAmount,
    discount_type: discountValue > 0 ? discountType : null,
    discount_value: discountValue > 0 ? discountValue : null,
    gst_amount: calc.gstAmount,
    grand_total: calc.grandTotal,
    notes: null,
    status,
    existing_order_id: existingOrder?.id,
    items: cart.map((l) => ({
      menu_item_id: l.menu_item_id,
      name: l.name,
      is_veg: l.is_veg,
      rate: l.rate,
      gst_percent: l.gst_percent,
      quantity: l.quantity,
      line_total: l.rate * l.quantity,
      note: l.note || null,
    })),
  });

  const handleSaveOrder = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveOrderWithItems(buildOrderInput('open'));
      setSaveMsg({ type: 'success', text: 'Order saved successfully.' });
      // Reset cart but keep context
      setCart([]);
      setExistingOrder(null);
      setSelectedTableId('');
      setSelectedRoomEntryId('');
      setCustomerName('');
      setCustomerPhone('');
      setDiscountValue(0);
    } catch (e) {
      setSaveMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed to save order' });
    } finally {
      setSaving(false);
    }
  };

  const handleSendKot = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const { order, kot } = await saveAndSendKot(buildOrderInput('kot_sent'));
      // Set table to occupied for dine-in
      if (orderType === 'dine_in' && selectedTableId) {
        try {
          await setPosTableStatus(selectedTableId, 'occupied');
        } catch { /* non-fatal */ }
      }
      setSaveMsg({ type: 'success', text: `KOT ${kot.kot_number} sent for ${order.order_number}.` });
      setCart([]);
      setExistingOrder(null);
      setSelectedTableId('');
      setSelectedRoomEntryId('');
      setCustomerName('');
      setCustomerPhone('');
      setDiscountValue(0);
    } catch (e) {
      setSaveMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed to send KOT' });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent transition placeholder:text-slate-400';
  const labelCls = 'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1';

  const orderTypeTabs: { value: PosOrderType; label: string; icon: React.ReactNode }[] = [
    { value: 'dine_in', label: 'Dine-In', icon: <Armchair className="w-4 h-4" /> },
    { value: 'room_service', label: 'Room Service', icon: <BedDouble className="w-4 h-4" /> },
    { value: 'takeaway', label: 'Takeaway', icon: <ShoppingBag className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-brand-600" />
            <h1 className="text-lg font-bold text-brand-navy-800">New Order</h1>
          </div>
        </div>

        {/* Order type tabs */}
        <div className="flex rounded-xl border border-slate-200 overflow-hidden">
          {orderTypeTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setOrderType(tab.value); setCart([]); setExistingOrder(null); setSelectedTableId(''); setSelectedRoomEntryId(''); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold transition ${orderType === tab.value ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {saveMsg && (
        <div className={`mx-4 mt-3 rounded-lg border px-3 py-2 text-sm flex items-center justify-between ${saveMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
          <span className="flex items-center gap-2">
            {saveMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {saveMsg.text}
          </span>
          <button onClick={() => setSaveMsg(null)} className="opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Order context bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        {orderType === 'dine_in' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Table</label>
              <select value={selectedTableId} onChange={(e) => onTableSelect(e.target.value)} className={inputCls}>
                <option value="">Select table…</option>
                {activeTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.seating_capacity} seats){t.current_status !== 'available' ? ` — ${t.current_status}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Guests</label>
              <input type="number" min={1} value={guestCount} onChange={(e) => setGuestCount(Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Waiter (optional)</label>
              <input type="text" value={waiterName} onChange={(e) => setWaiterName(e.target.value)} className={inputCls} placeholder="Staff name" />
            </div>
            {existingOrder && (
              <div className="sm:col-span-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-xs text-amber-700">
                  This table has a running order <strong>{existingOrder.order_number}</strong> (status: {existingOrder.status}). Items loaded — editing will update this order.
                </span>
              </div>
            )}
          </div>
        )}

        {orderType === 'room_service' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Room (in-house only)</label>
              <select value={selectedRoomEntryId} onChange={(e) => setSelectedRoomEntryId(e.target.value)} className={inputCls}>
                <option value="">Select room…</option>
                {inHouseRooms.map((r) => (
                  <option key={r.entry_id} value={r.entry_id}>
                    Room {r.room_no} — {r.guest_name}
                  </option>
                ))}
              </select>
              {inHouseRooms.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">No in-house rooms found.</p>
              )}
            </div>
            <div>
              <label className={labelCls}>Guest Name</label>
              <input type="text" value={selectedRoom?.guest_name ?? ''} readOnly className={`${inputCls} bg-slate-50 text-slate-500`} placeholder="Auto-filled from room" />
            </div>
          </div>
        )}

        {orderType === 'takeaway' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Customer Name (optional)</label>
              <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputCls} placeholder="Walk-in customer" />
            </div>
            <div>
              <label className={labelCls}>Mobile (optional)</label>
              <input type="text" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className={inputCls} placeholder="Phone number" />
            </div>
          </div>
        )}
      </div>

      {/* Main content: menu + cart */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Menu section */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Menu filters */}
          <div className="px-4 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 flex-1 min-w-[140px]">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search menu…"
                className="bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none w-full"
              />
            </div>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {(['all', 'veg', 'nonveg'] as VegFilter[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setVegFilter(v)}
                  className={`px-3 py-2 text-xs font-semibold transition ${vegFilter === v ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  {v === 'all' ? 'All' : v === 'veg' ? 'Veg' : 'Non-Veg'}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-500">
              <input type="checkbox" checked={showSoldOut} onChange={(e) => setShowSoldOut(e.target.checked)} className="w-3.5 h-3.5 rounded text-brand-600 focus:ring-brand-500" />
              Show Sold Out
            </label>
          </div>

          {/* Category tabs */}
          <div className="px-4 py-2 bg-white border-b border-slate-200 flex gap-1.5 overflow-x-auto">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${categoryFilter === 'all' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryFilter(c.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${categoryFilter === c.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Menu grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <UtensilsCrossed className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-500">No menu items found</p>
                <p className="text-xs text-slate-400 mt-1">Try adjusting filters or add items in Menu Management.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {filteredItems.map((item) => {
                  const soldOut = !item.is_available;
                  return (
                    <button
                      key={item.id}
                      onClick={() => !soldOut && addToCart(item)}
                      disabled={soldOut}
                      className={`relative rounded-xl border bg-white p-3 text-left shadow-sm transition ${soldOut ? 'border-slate-100 opacity-50 cursor-not-allowed' : 'border-slate-200 hover:shadow-md hover:border-brand-300'}`}
                    >
                      {soldOut && (
                        <span className="absolute top-2 right-2 rounded-full bg-red-50 border border-red-200 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-500">Sold Out</span>
                      )}
                      <div className="flex items-center gap-1 mb-1.5">
                        {item.is_veg ? <Leaf className="w-3.5 h-3.5 text-emerald-500" /> : <Drumstick className="w-3.5 h-3.5 text-red-400" />}
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">{categories.find((c) => c.id === item.category_id)?.name ?? ''}</span>
                      </div>
                      <p className="text-sm font-bold text-slate-800 mb-1 leading-tight">{item.name}</p>
                      <p className="text-sm font-bold text-brand-600">₹{Number(item.price).toFixed(0)}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Cart sidebar / bottom sheet */}
        <div className="lg:w-[380px] lg:border-l border-t lg:border-t-0 border-slate-200 bg-white flex flex-col">
          {/* Cart header */}
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Order Cart</h2>
            <span className="text-xs text-slate-400">{cart.length} item{cart.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-4 py-3 min-h-[120px]">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <ShoppingBag className="w-10 h-10 text-slate-200 mb-2" />
                <p className="text-sm text-slate-400">Cart is empty</p>
                <p className="text-xs text-slate-300 mt-0.5">Tap menu items to add</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((line) => (
                  <div key={line.key} className="rounded-lg border border-slate-200 p-2.5">
                    <div className="flex items-start gap-2">
                      {line.is_veg ? <Leaf className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> : <Drumstick className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{line.name}</p>
                        <p className="text-xs text-slate-400">₹{line.rate.toFixed(0)} × {line.quantity} = ₹{(line.rate * line.quantity).toFixed(0)}</p>
                        {line.note && (
                          <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                            <StickyNote className="w-3 h-3" /> {line.note}
                          </p>
                        )}
                      </div>
                      <button onClick={() => removeLine(line.key)} className="p-1 text-slate-300 hover:text-red-500 transition shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => changeQty(line.key, -1)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition">
                          <Minus className="w-3.5 h-3.5 text-slate-600" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold text-slate-800 tabular-nums">{line.quantity}</span>
                        <button onClick={() => changeQty(line.key, 1)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition">
                          <Plus className="w-3.5 h-3.5 text-slate-600" />
                        </button>
                      </div>
                      <button onClick={() => openNoteModal(line.key)} className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-brand-600 transition">
                        <StickyNote className="w-3.5 h-3.5" /> Note
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discount + totals */}
          <div className="px-4 py-3 border-t border-slate-200 space-y-2">
            {/* Discount row */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide shrink-0">Discount</span>
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value as 'flat' | 'percent')} className="px-2 py-1.5 border border-slate-200 rounded-lg bg-white text-xs text-slate-600 focus:outline-none">
                <option value="flat">₹ Flat</option>
                <option value="percent">% Percent</option>
              </select>
              <input type="number" min={0} value={discountValue} onChange={(e) => setDiscountValue(Number(e.target.value))} className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 text-right focus:outline-none" />
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
          </div>

          {/* Action buttons */}
          <div className="px-4 py-3 border-t border-slate-200 flex gap-2">
            <button
              onClick={handleSaveOrder}
              disabled={!canSave || saving}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save Order'}
            </button>
            <button
              onClick={handleSendKot}
              disabled={!canSave || saving}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChefHat className="w-4 h-4" />
              {saving ? 'Sending…' : 'Send KOT'}
            </button>
          </div>
        </div>
      </div>

      {/* Note modal */}
      {noteModalItemId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-navy/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setNoteModalItemId(null); }}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-brand-navy-800">Item Note</h2>
              <button onClick={() => setNoteModalItemId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-400 mb-2">e.g. No Onion, Less Spicy, No Garlic</p>
            <input type="text" value={noteText} onChange={(e) => setNoteText(e.target.value)} className={inputCls} placeholder="Add note…" autoFocus />
            <div className="flex flex-wrap gap-1.5 mt-3">
              {['No Onion', 'Less Spicy', 'No Garlic', 'Extra Cheese', 'Jain'].map((preset) => (
                <button key={preset} onClick={() => setNoteText(preset)} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition">{preset}</button>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setNoteModalItemId(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={saveNote} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Save Note</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
