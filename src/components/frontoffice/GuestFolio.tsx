import { useState, useEffect, useMemo } from 'react';
import {
  X, Loader2, FileText, Printer, Mail, MessageCircle, Download,
  BedDouble, Wallet, Receipt, ArrowRight, CalendarPlus, LogIn, LogOut,
  Clock, User, Phone, CreditCard, Banknote, Smartphone,
} from 'lucide-react';
import type {
  RoomChartEntry, Room, RoomCategory, HotelSettings,
  BookingTimelineEvent, FolioCharge, RoomShift,
} from '@/lib/types';
import { fmtMoney, toNum } from '@/lib/calc';
import { getTimeline, getFolioCharges, getRoomShifts } from '@/lib/api-frontoffice';
import {
  getReservationConfirmationData,
  sendReservationConfirmationEmail,
  openWhatsAppConfirmation,
} from '@/lib/api-reservations';
import {
  downloadReservationConfirmationPdf,
  printReservationConfirmationPdf,
} from '@/lib/pdf-reservation';
import { brand } from '@/lib/theme';

interface GuestFolioProps {
  entry: RoomChartEntry;
  roomNo: string;
  rooms: Room[];
  categories: RoomCategory[];
  settings: HotelSettings | null;
  booking?: { guestName?: string; phone?: string; email?: string };
  onClose: () => void;
}

const EVENT_ICONS: Record<string, typeof FileText> = {
  booking_created: FileText,
  confirmation_sent: Mail,
  check_in: LogIn,
  payment_received: Wallet,
  room_shift: ArrowRight,
  stay_extended: CalendarPlus,
  extra_charge: Receipt,
  checkout: LogOut,
  invoice_generated: FileText,
};

const fmtDateTime = (iso: string): string => {
  const dt = new Date(iso);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

export const GuestFolio = ({ entry, roomNo, rooms, categories, settings, booking, onClose }: GuestFolioProps) => {
  const [timeline, setTimeline] = useState<BookingTimelineEvent[]>([]);
  const [charges, setCharges] = useState<FolioCharge[]>([]);
  const [shifts, setShifts] = useState<RoomShift[]>([]);
  const [loading, setLoading] = useState(true);

  // Document action state (Section 19)
  const [activeAction, setActiveAction] = useState<'pdf' | 'print' | 'email' | 'whatsapp' | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getTimeline(entry.id),
      getFolioCharges(entry.id),
      getRoomShifts(entry.id),
    ]).then(([tl, ch, sh]) => {
      setTimeline(tl);
      setCharges(ch);
      setShifts(sh);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [entry.id]);

  const room = useMemo(
    () => rooms.find((r) => r.room_no === roomNo),
    [rooms, roomNo],
  );
  const category = useMemo(
    () => categories.find((c) => c.id === room?.category_id),
    [categories, room],
  );

  const roomCharges = toNum(entry.total);
  const extraTotal = charges.reduce((s, c) => s + toNum(c.amount) * toNum(c.quantity), 0);
  const gstAmount = toNum(entry.gst_amount);
  const grandTotal = toNum(entry.invoice_total) + extraTotal;
  const received = toNum(entry.pay_cash) + toNum(entry.pay_upi) + toNum(entry.pay_card) + toNum(entry.pay_bank);
  const balance = Math.max(0, grandTotal - received);

  const handlePdf = async () => {
    if (activeAction) return;
    setActiveAction('pdf');
    setActionError(null);
    setActionSuccess(null);
    try {
      const data = await getReservationConfirmationData(entry.reservation_id || entry.id);
      downloadReservationConfirmationPdf({
        reservation: data.reservation,
        settings: data.hotel as any,
      });
      setActionSuccess('Confirmation PDF downloaded.');
    } catch (err: any) {
      setActionError(err.message || 'Failed to generate confirmation PDF.');
    } finally {
      setActiveAction(null);
      setTimeout(() => setActionSuccess(null), 4000);
    }
  };

  const handlePrint = async () => {
    if (activeAction) return;
    setActiveAction('print');
    setActionError(null);
    setActionSuccess(null);
    try {
      const data = await getReservationConfirmationData(entry.reservation_id || entry.id);
      printReservationConfirmationPdf({
        reservation: data.reservation,
        settings: data.hotel as any,
      });
      setActionSuccess('Print dialog opened.');
    } catch (err: any) {
      setActionError(err.message || 'Failed to print confirmation.');
    } finally {
      setActiveAction(null);
      setTimeout(() => setActionSuccess(null), 4000);
    }
  };

  const handleEmail = async () => {
    if (activeAction) return;
    setActiveAction('email');
    setActionError(null);
    setActionSuccess(null);
    try {
      const data = await getReservationConfirmationData(entry.reservation_id || entry.id);
      const res = await sendReservationConfirmationEmail(data);
      setActionSuccess(res.message || 'Confirmation email dispatched successfully.');
    } catch (err: any) {
      setActionError(err.message || 'Failed to send confirmation email.');
    } finally {
      setActiveAction(null);
      setTimeout(() => setActionSuccess(null), 5000);
    }
  };

  const handleWhatsApp = async () => {
    if (activeAction) return;
    setActiveAction('whatsapp');
    setActionError(null);
    setActionSuccess(null);
    try {
      const data = await getReservationConfirmationData(entry.reservation_id || entry.id);
      openWhatsAppConfirmation(data);
      setActionSuccess('Opened WhatsApp with reservation confirmation.');
    } catch (err: any) {
      setActionError(err.message || 'No valid phone number for WhatsApp.');
    } finally {
      setActiveAction(null);
      setTimeout(() => setActionSuccess(null), 4000);
    }
  };


  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col
        max-sm:rounded-t-2xl max-sm:bottom-0 max-sm:top-auto max-sm:max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between" style={{ background: brand.navy }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-brand-gold-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Guest Folio</h2>
              <p className="text-xs text-brand-navy-300">{booking?.guestName || entry.guest_name} · Room {roomNo}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-brand-navy-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading folio…
            </div>
          ) : (
            <>
              {/* Guest info */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5">
                <div className="flex items-center gap-1.5 text-sm">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-500">Guest</span>
                  <span className="font-semibold text-slate-800 ml-auto">{booking?.guestName || entry.guest_name}</span>
                </div>
                {booking?.phone && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-500">Mobile</span>
                    <span className="font-medium text-slate-800 ml-auto">{booking.phone}</span>
                  </div>
                )}
                {booking?.email && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-500">Email</span>
                    <span className="font-medium text-slate-800 ml-auto">{booking.email}</span>
                  </div>
                )}
                {entry.id_proof_type && entry.id_proof_type !== 'None' && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-500">ID Proof</span>
                    <span className="font-medium text-slate-800 ml-auto">
                      {entry.id_proof_type}{entry.id_proof_number ? ` · ${entry.id_proof_number}` : ''}
                      {entry.id_proof_verified ? ' (Verified)' : ''}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-sm">
                  <BedDouble className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-500">Room</span>
                  <span className="font-semibold text-slate-800 ml-auto">{roomNo} {category ? `· ${category.name}` : ''}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-500">Stay</span>
                  <span className="font-medium text-slate-800 ml-auto">
                    {entry.arrival ?? entry.report_date} → {entry.departure ?? '—'} ({entry.nights} nights)
                  </span>
                </div>
              </div>

              {/* Charges summary */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-brand-navy-50 px-4 py-2.5 border-b border-slate-200">
                  <h3 className="text-sm font-bold text-brand-navy-800 uppercase tracking-wide">Charges</h3>
                </div>
                <div className="p-4 space-y-2">
                  <ChargeRow icon={BedDouble} label="Room Charges" value={`₹${fmtMoney(roomCharges)}`} />
                  {charges.map((c) => (
                    <ChargeRow key={c.id} icon={Receipt}
                      label={`${c.charge_type}${c.description ? ` · ${c.description}` : ''}${c.quantity > 1 ? ` ×${c.quantity}` : ''}`}
                      value={`₹${fmtMoney(toNum(c.amount) * toNum(c.quantity))}`} />
                  ))}
                  {gstAmount > 0 && <ChargeRow icon={Receipt} label="GST" value={`₹${fmtMoney(gstAmount)}`} />}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <span className="text-sm font-bold text-brand-navy-800">Grand Total</span>
                    <span className="text-sm font-bold text-brand-navy-800 text-base">₹{fmtMoney(grandTotal)}</span>
                  </div>
                  <ChargeRow icon={Wallet} label="Received" value={`₹${fmtMoney(received)}`} positive />
                  <div className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2">
                    <span className="text-sm font-semibold text-amber-700">Balance</span>
                    <span className="text-sm font-bold text-amber-700">₹{fmtMoney(balance)}</span>
                  </div>
                </div>
              </div>

              {/* Payment breakdown */}
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Payment Breakdown</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {toNum(entry.pay_cash) > 0 && <PayRow icon={Wallet} label="Cash" value={entry.pay_cash} />}
                  {toNum(entry.pay_upi) > 0 && <PayRow icon={Smartphone} label="UPI" value={entry.pay_upi} />}
                  {toNum(entry.pay_card) > 0 && <PayRow icon={CreditCard} label="Card" value={entry.pay_card} />}
                  {toNum(entry.pay_bank) > 0 && <PayRow icon={Banknote} label="Bank" value={entry.pay_bank} />}
                  {received === 0 && <p className="text-xs text-slate-400">No payments recorded</p>}
                </div>
              </div>

              {/* Room shifts */}
              {shifts.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Room Shift History</h3>
                  <div className="space-y-1.5">
                    {shifts.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 text-sm">
                        <ArrowRight className="w-3.5 h-3.5 text-brand-500" />
                        <span className="text-slate-600">{s.from_room} → {s.to_room}</span>
                        {s.reason && <span className="text-xs text-slate-400">· {s.reason}</span>}
                        <span className="text-xs text-slate-400 ml-auto">{fmtDateTime(s.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Booking Timeline</h3>
                {timeline.length === 0 ? (
                  <p className="text-xs text-slate-400">No timeline events recorded</p>
                ) : (
                  <div className="space-y-3">
                    {timeline.map((evt) => {
                      const Icon = EVENT_ICONS[evt.event_type] ?? FileText;
                      return (
                        <div key={evt.id} className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-3.5 h-3.5 text-brand-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700">{evt.event_description}</p>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <span>{fmtDateTime(evt.created_at)}</span>
                              {evt.performed_by && <span>· by {evt.performed_by}</span>}
                              {toNum(evt.event_amount) > 0 && <span>· ₹{fmtMoney(evt.event_amount)}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Feedback banners (Section 19) */}
        {actionSuccess && (
          <div className="px-5 py-2.5 bg-emerald-50 text-emerald-800 text-xs font-semibold border-t border-emerald-200 flex items-center justify-between animate-fadeIn">
            <span>✓ {actionSuccess}</span>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:text-emerald-900 font-bold ml-2">✕</button>
          </div>
        )}
        {actionError && (
          <div className="px-5 py-2.5 bg-rose-50 text-rose-800 text-xs font-semibold border-t border-rose-200 flex items-center justify-between animate-fadeIn">
            <span>⚠ {actionError}</span>
            <button onClick={() => setActionError(null)} className="text-rose-600 hover:text-rose-900 font-bold ml-2">✕</button>
          </div>
        )}

        {/* Export buttons */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 grid grid-cols-4 gap-2">
          <ExportBtn
            icon={activeAction === 'pdf' ? Loader2 : Download}
            label={activeAction === 'pdf' ? 'Loading…' : 'PDF'}
            loading={activeAction === 'pdf'}
            disabled={!!activeAction}
            onClick={handlePdf}
          />
          <ExportBtn
            icon={activeAction === 'print' ? Loader2 : Printer}
            label={activeAction === 'print' ? 'Loading…' : 'Print'}
            loading={activeAction === 'print'}
            disabled={!!activeAction}
            onClick={handlePrint}
          />
          <ExportBtn
            icon={activeAction === 'email' ? Loader2 : Mail}
            label={activeAction === 'email' ? 'Sending…' : 'Email'}
            loading={activeAction === 'email'}
            disabled={!!activeAction}
            onClick={handleEmail}
          />
          <ExportBtn
            icon={activeAction === 'whatsapp' ? Loader2 : MessageCircle}
            label={activeAction === 'whatsapp' ? 'Opening…' : 'WhatsApp'}
            loading={activeAction === 'whatsapp'}
            disabled={!!activeAction}
            onClick={handleWhatsApp}
          />
        </div>
      </div>
    </>
  );
};

const ChargeRow = ({ icon: Icon, label, value, positive }: { icon: typeof FileText; label: string; value: string; positive?: boolean }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="flex items-center gap-1.5 text-slate-600">
      <Icon className="w-3.5 h-3.5 text-slate-400" />
      {label}
    </span>
    <span className={`font-medium ${positive ? 'text-emerald-600' : 'text-slate-800'}`}>{value}</span>
  </div>
);

const PayRow = ({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: number }) => (
  <div className="flex items-center justify-between">
    <span className="flex items-center gap-1.5 text-slate-600">
      <Icon className="w-3.5 h-3.5 text-slate-400" />
      {label}
    </span>
    <span className="font-medium text-slate-800">₹{fmtMoney(toNum(value))}</span>
  </div>
);

const ExportBtn = ({
  icon: Icon,
  label,
  onClick,
  loading = false,
  disabled = false,
}: {
  icon: typeof FileText;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled || loading}
    className="flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
  >
    <Icon className={`w-4 h-4 ${loading ? 'animate-spin text-brand-600' : ''}`} />
    {label}
  </button>
);

