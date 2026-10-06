import React, { useState, useEffect, useCallback } from 'react';
import {
  X, FileText, Download, Eye, Mail, MessageCircle, RefreshCw,
  CheckCircle2, AlertCircle, Clock, Loader2, Send,
  ShieldAlert, Printer, User, Building2, AlertTriangle, BedDouble,
} from 'lucide-react';
import type { Reservation } from '@/lib/types-reservations';
import type { HotelSettings } from '@/lib/types';
import { apiFetch } from '@/lib/api-fetch';
import {
  downloadReservationConfirmationPdf,
} from '@/lib/pdf-reservation';

interface Props {
  reservation: Reservation;
  groupReservations?: Reservation[];
  settings?: HotelSettings | null;
  onClose: () => void;
  onUpdated?: () => void;
}

interface DocRecord {
  id: string;
  hotel_id: string;
  reservation_id: string;
  document_type: string;
  version: number;
  file_name: string;
  storage_path: string;
  status: string;
  email_status: string;
  whatsapp_status: string;
  created_at: string;
  updated_at: string;
}

interface RecipientInfo {
  recipientType: 'HOTEL_OWNER' | 'CUSTOMER' | 'NONE';
  email: string | null;
  name: string;
  sourceType: 'OTA' | 'MANUAL';
  sourceName: string;
  otaBookingId?: string;
  reason?: string;
}

interface ConfirmationResponse {
  success: boolean;
  reservationId: string;
  document: DocRecord | null;
  versions: DocRecord[];
  recipient?: RecipientInfo;
  sourceInfo?: {
    sourceType: 'OTA' | 'MANUAL';
    sourceName: string;
    otaBookingId?: string;
  };
  guestContact?: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  ownerContact?: { email: string | null; phone: string | null };
  whatsappDirectUrl: string | null;
}

export const ReservationConfirmationModal: React.FC<Props> = ({
  reservation,
  groupReservations,
  settings,
  onClose,
  onUpdated,
}) => {
  const [loading, setLoading] = useState(true);
  const [docData, setDocData] = useState<ConfirmationResponse | null>(null);

  const [acting, setActing] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isPhysical = (rm?: string | null) => {
    const norm = (rm || '').trim().toLowerCase();
    return Boolean(norm && norm !== 'unassigned' && norm !== 'tbd');
  };
  const isMulti = Boolean(groupReservations && groupReservations.length > 1);
  const allRooms = isMulti
    ? groupReservations!.filter((r, idx, arr) => {
        if (isPhysical(r.room_no)) {
          return arr.findIndex((x) => (x.room_no || '').trim().toLowerCase() === (r.room_no || '').trim().toLowerCase()) === idx;
        }
        return arr.findIndex((x) => x.id === r.id) === idx;
      })
    : [reservation];
  const totalStayAmount = allRooms.reduce(
    (sum, r) => sum + (r.invoice_total > 0 ? r.invoice_total : (r.rate * (r.nights || 1))),
    0
  );
  const totalAdvancePaid = allRooms.reduce((sum, r) => sum + (r.advance_paid || 0), 0);
  const totalBalanceDue = Math.max(0, totalStayAmount - totalAdvancePaid);

  // Email recipient — seeded immediately from the reservation's saved guest email
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [customEmail, setCustomEmail] = useState<string>(
    (reservation.guest_email || '').trim()
  );

  // WhatsApp override / phone
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const [customPhone, setCustomPhone] = useState('');

  const shortId = (reservation.id || '').slice(0, 8).toUpperCase();
  const confirmationNumber = `HM-RES-${shortId}`;

  const fetchConfirmationInfo = useCallback(async () => {
    try {
      setLoading(true);
      const res: ConfirmationResponse = await apiFetch(`/api/reservations/${reservation.id}/confirmation`);
      if (res.success) {
        setDocData(res);
        // Priority order for email pre-fill:
        // 1. Guest contact email from reservation (authoritative — what was entered at booking)
        // 2. Recipient email resolved by the server (may differ for OTA → hotel owner)
        // 3. Owner contact email (OTA fallback)
        const resolvedEmail =
          res.guestContact?.email?.trim() ||
          res.recipient?.email?.trim() ||
          (res.recipient?.recipientType === 'HOTEL_OWNER' ? res.ownerContact?.email?.trim() : '') ||
          '';
        if (resolvedEmail) {
          setCustomEmail(resolvedEmail);
        }
        // else keep the value already seeded from reservation.guest_email on mount

        if (res.guestContact?.phone) {
          setCustomPhone(res.guestContact.phone);
        } else if (res.ownerContact?.phone) {
          setCustomPhone(res.ownerContact.phone);
        }
      }
    } catch (err: any) {
      console.warn('Failed to fetch server confirmation status, using fallback:', err?.message);
      // Keep the value seeded from reservation.guest_email — it is still valid
    } finally {
      setLoading(false);
    }
  }, [reservation.id]);

  // Reset email when a different reservation is opened — prevents stale data
  useEffect(() => {
    setCustomEmail((reservation.guest_email || '').trim());
    setCustomPhone((reservation.guest_phone || '').trim());
    setActionSuccess(null);
    setActionError(null);
  }, [reservation.id, reservation.guest_email, reservation.guest_phone]);

  useEffect(() => {
    fetchConfirmationInfo();
  }, [fetchConfirmationInfo]);

  // ── Preview PDF ──
  const handlePreviewPdf = () => {
    window.open(`/api/reservations/${reservation.id}/confirmation/pdf`, '_blank');
  };

  // ── Print PDF ──
  const handlePrintPdf = () => {
    const printWindow = window.open(`/api/reservations/${reservation.id}/confirmation/pdf`, '_blank');
    if (printWindow) {
      printWindow.focus();
    }
  };

  // ── Download PDF ──
  const handleDownloadPdf = () => {
    try {
      downloadReservationConfirmationPdf({
        reservation,
        settings,
        version: docData?.document?.version || 1,
      });
      setActionSuccess('Confirmation PDF downloaded.');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch {
      window.open(`/api/reservations/${reservation.id}/confirmation/pdf`, '_blank');
    }
  };

  // ── Send / Retry Email ──
  const handleSendEmail = async () => {
    setActing(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch(`/api/reservations/${reservation.id}/confirmation/send-email`, {
        method: 'POST',
        body: JSON.stringify({
          recipientEmail: customEmail.trim() || undefined,
        }),
      });

      if (res.success) {
        setActionSuccess(`Confirmation email sent successfully to ${customEmail || 'configured recipient'}.`);
        setShowEmailInput(false);
        await fetchConfirmationInfo();
        onUpdated?.();
      } else {
        setActionError(res.message || 'Failed to send confirmation email.');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Email delivery failed.');
    } finally {
      setActing(false);
      setTimeout(() => setActionSuccess(null), 5000);
    }
  };

  // ── Send / Open WhatsApp ──
  const handleSendWhatsApp = async () => {
    setActing(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch(`/api/reservations/${reservation.id}/confirmation/send-whatsapp`, {
        method: 'POST',
        body: JSON.stringify({
          phoneNumber: customPhone.trim() || undefined,
        }),
      });

      if (res.success) {
        setActionSuccess('WhatsApp confirmation dispatched successfully.');
        setShowPhoneInput(false);
        await fetchConfirmationInfo();
        onUpdated?.();
      } else if (res.whatsappDirectUrl) {
        window.open(res.whatsappDirectUrl, '_blank', 'noopener,noreferrer');
        setActionSuccess('Opened WhatsApp Web / App with confirmation details.');
      } else {
        setActionError(res.message || 'WhatsApp delivery unavailable.');
      }
    } catch (err: any) {
      if (docData?.whatsappDirectUrl) {
        window.open(docData.whatsappDirectUrl, '_blank', 'noopener,noreferrer');
      } else {
        setActionError(err?.message || 'WhatsApp delivery unavailable.');
      }
    } finally {
      setActing(false);
      setTimeout(() => setActionSuccess(null), 5000);
    }
  };

  // ── Regenerate Confirmation ──
  const handleRegenerate = async (newVersion: boolean) => {
    setActing(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch(`/api/reservations/${reservation.id}/confirmation/regenerate`, {
        method: 'POST',
        body: JSON.stringify({ newVersion }),
      });

      if (res.success) {
        setActionSuccess(newVersion ? 'New version generated successfully.' : 'Confirmation PDF regenerated.');
        await fetchConfirmationInfo();
        onUpdated?.();
      } else {
        setActionError(res.message || 'Regeneration failed.');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Regeneration failed.');
    } finally {
      setActing(false);
      setTimeout(() => setActionSuccess(null), 4000);
    }
  };

  const currentDoc = docData?.document;
  const currentVersion = currentDoc?.version || 1;
  const emailStatus = currentDoc?.email_status || 'PENDING';
  const whatsappStatus = currentDoc?.whatsapp_status || 'PENDING';

  const recipient = docData?.recipient;
  const isOTA = recipient?.sourceType === 'OTA';
  const isWalkInNoEmail = recipient?.recipientType === 'NONE' || (!recipient?.email && !isOTA);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Reservation Confirmation
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/15 text-slate-200 font-mono">
                  #{confirmationNumber}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Authoritative Hotel Mantri Confirmation Document &bull; Version {currentVersion}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action feedback banners */}
        {actionSuccess && (
          <div className="px-6 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {actionError && (
          <div className="px-6 py-2.5 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Body content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
          {/* Recipient Routing Banner */}
          <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${
            isOTA
              ? 'bg-purple-50/70 border-purple-200 text-purple-950'
              : isWalkInNoEmail
              ? 'bg-amber-50/70 border-amber-200 text-amber-950'
              : 'bg-blue-50/70 border-blue-200 text-blue-950'
          }`}>
            <div className="mt-0.5">
              {isOTA ? (
                <Building2 className="w-4 h-4 text-purple-600" />
              ) : isWalkInNoEmail ? (
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              ) : (
                <User className="w-4 h-4 text-blue-600" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wide">
                  {isOTA ? 'OTA Reservation &bull; Hotel Owner Recipient' : isWalkInNoEmail ? 'Walk-in &bull; Customer Email Not Available' : 'Direct Booking &bull; Customer Recipient'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-white/80 border border-current">
                  {recipient?.sourceName || reservation.source_name || reservation.source_category || 'Direct'}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed">
                {isOTA ? (
                  <>
                    Confirmation PDF is automatically routed to the <strong>Hotel Owner</strong> ({recipient?.email || docData?.ownerContact?.email || 'email not configured'}). OTA guests are not messaged directly.
                  </>
                ) : isWalkInNoEmail ? (
                  <>
                    Customer email not available &mdash; confirmation PDF generated successfully. You can <strong>Print</strong> or <strong>Download</strong> the PDF below, or enter an email to dispatch.
                  </>
                ) : (
                  <>
                    Confirmation PDF is delivered directly to the <strong>Customer / Guest</strong> ({recipient?.email || reservation.guest_email}).
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Status Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* PDF Status */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Confirmation PDF</span>
              <div className="mt-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-slate-800">Generated (v{currentVersion})</span>
              </div>
              <span className="mt-1 text-[10px] text-slate-400 truncate">
                {currentDoc?.file_name || 'Standard Confirmation'}
              </span>
            </div>

            {/* Email Status */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                {isOTA ? 'Owner Email' : 'Guest Email'}
              </span>
              <div className="mt-2 flex items-center gap-2">
                {emailStatus === 'SENT' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-emerald-700">Delivered</span>
                  </>
                ) : emailStatus === 'FAILED' ? (
                  <>
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span className="font-bold text-rose-700">Delivery Failed</span>
                  </>
                ) : emailStatus === 'NOT_AVAILABLE' ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="font-bold text-amber-700">Not Available</span>
                  </>
                ) : emailStatus === 'NOT_CONFIGURED' ? (
                  <>
                    <ShieldAlert className="w-4 h-4 text-amber-500" />
                    <span className="font-bold text-slate-600">SMTP Unconfigured</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 text-sky-500" />
                    <span className="font-bold text-slate-600">Pending / Queued</span>
                  </>
                )}
              </div>
              <span className="mt-1 text-[10px] text-slate-400 truncate">
                {recipient?.email || customEmail || 'No Email'}
              </span>
            </div>

            {/* WhatsApp Status */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                {isOTA ? 'Owner WhatsApp' : 'WhatsApp'}
              </span>
              <div className="mt-2 flex items-center gap-2">
                {whatsappStatus === 'SENT' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-emerald-700">Delivered</span>
                  </>
                ) : whatsappStatus === 'FAILED' ? (
                  <>
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span className="font-bold text-rose-700">Provider Failed</span>
                  </>
                ) : (
                  <>
                    <MessageCircle className="w-4 h-4 text-slate-400" />
                    <span className="font-bold text-slate-600">Direct Chat Ready</span>
                  </>
                )}
              </div>
              <span className="mt-1 text-[10px] text-slate-400 truncate">
                {reservation.guest_phone || docData?.ownerContact?.phone ? `+${reservation.guest_phone || docData?.ownerContact?.phone}` : 'No Phone'}
              </span>
            </div>
          </div>

          {/* Quick Stay Card */}
          <div className="p-4 rounded-xl border border-slate-200/90 bg-white shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <div className="font-bold text-slate-900 text-sm">{reservation.guest_name}</div>
                {isMulti && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {allRooms.length} Rooms Multi-Booking
                  </span>
                )}
              </div>
              <div className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200">
                {reservation.source_name || reservation.source_category || 'Direct'}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-600">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Check-In</span>
                <span className="font-semibold text-slate-800">{reservation.check_in_date}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Check-Out</span>
                <span className="font-semibold text-slate-800">{reservation.check_out_date}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Room Allocation</span>
                <span className="font-semibold text-slate-800">
                  {isMulti ? (
                    `${allRooms.length} Rooms (${allRooms.map((r) => r.room_no || 'Unassigned').join(', ')})`
                  ) : reservation.room_no && reservation.room_no !== 'unassigned' ? (
                    `Room ${reservation.room_no}`
                  ) : (
                    'Not Assigned'
                  )}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Total / Balance</span>
                <span className="font-semibold text-brand-700">
                  ₹{Math.round(totalStayAmount).toLocaleString('en-IN')}
                  {totalBalanceDue > 0 && (
                    <span className="text-xs text-amber-600 font-bold block">Due: ₹{Math.round(totalBalanceDue).toLocaleString('en-IN')}</span>
                  )}
                </span>
              </div>
            </div>

            {/* Room Breakdown for Multi-Room Bookings */}
            {isMulti && (
              <div className="pt-2.5 border-t border-slate-100 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Allocated Rooms & Tariff Breakdown ({allRooms.length} Rooms)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {allRooms.map((r, idx) => (
                    <div key={r.id || idx} className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                          <BedDouble className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <span className="font-bold text-slate-800 block">Room {r.room_no || 'Unassigned'}</span>
                          {r.rate_plan && <span className="text-[10px] text-slate-400">{r.rate_plan}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-extrabold text-slate-900 block">
                          ₹{Math.round(r.invoice_total || (r.rate * (r.nights || 1))).toLocaleString('en-IN')}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">₹{Math.round(r.rate)}/nt</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Email input field (when manual send/edit is requested or if email missing) */}
          {showEmailInput && (
            <div className="p-3.5 rounded-xl border border-sky-200 bg-sky-50/60 space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between">
                <label className="block font-semibold text-sky-900 text-xs">
                  {isOTA ? 'Send Confirmation to Hotel Owner Email:' : 'Send Confirmation to Customer Email:'}
                </label>
                <span className="text-[10px] text-sky-700">
                  {isOTA ? 'Routes to Hotelier' : 'Routes to Guest'}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                />
                <button
                  onClick={handleSendEmail}
                  disabled={acting || !customEmail.trim()}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50 transition"
                >
                  {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Send Email
                </button>
              </div>
            </div>
          )}

          {/* WhatsApp input dropdown if opened */}
          {showPhoneInput && (
            <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60 space-y-2 animate-fadeIn">
              <label className="block font-semibold text-emerald-900">
                Send Confirmation to WhatsApp Phone:
              </label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                  placeholder="919876543210"
                  className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
                <button
                  onClick={handleSendWhatsApp}
                  disabled={acting}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50 transition"
                >
                  {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Dispatch WhatsApp
                </button>
              </div>
            </div>
          )}

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {/* View PDF */}
            <button
              onClick={handlePreviewPdf}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
            >
              <Eye className="w-4 h-4 text-sky-600" />
              <span>Preview</span>
            </button>

            {/* Print PDF */}
            <button
              onClick={handlePrintPdf}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>Print</span>
            </button>

            {/* Download PDF */}
            <button
              onClick={handleDownloadPdf}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </button>

            {/* Email Button */}
            <button
              onClick={() => setShowEmailInput(!showEmailInput)}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
            >
              <Mail className="w-4 h-4 text-sky-600" />
              <span>
                {emailStatus === 'SENT' ? 'Resend Email' : emailStatus === 'FAILED' ? 'Retry Email' : 'Send Email'}
              </span>
            </button>

            {/* WhatsApp */}
            {docData?.whatsappDirectUrl ? (
              <a
                href={docData.whatsappDirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Open WhatsApp</span>
              </a>
            ) : (
              <button
                onClick={() => setShowPhoneInput(!showPhoneInput)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </button>
            )}

            {/* Regenerate */}
            <button
              onClick={() => handleRegenerate(false)}
              disabled={acting}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center gap-1.5 ml-auto transition disabled:opacity-50 cursor-pointer"
              title="Refresh / Re-generate confirmation document"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${acting ? 'animate-spin' : ''}`} />
              <span>Regenerate</span>
            </button>
          </div>

          {/* Version History Table if multiple versions exist */}
          {docData?.versions && docData.versions.length > 1 && (
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <h4 className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                Document Version History
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                      <th className="py-1.5 px-3">Version</th>
                      <th className="py-1.5 px-3">File Name</th>
                      <th className="py-1.5 px-3">Email</th>
                      <th className="py-1.5 px-3">WhatsApp</th>
                      <th className="py-1.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {docData.versions.map((ver) => (
                      <tr key={ver.id || ver.version} className={ver.version === currentVersion ? 'bg-amber-50/30' : ''}>
                        <td className="py-1.5 px-3 font-bold text-slate-700">v{ver.version}</td>
                        <td className="py-1.5 px-3 text-slate-600 truncate max-w-[180px]">{ver.file_name}</td>
                        <td className="py-1.5 px-3">
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                            ver.email_status === 'SENT' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {ver.email_status || 'PENDING'}
                          </span>
                        </td>
                        <td className="py-1.5 px-3">
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                            ver.whatsapp_status === 'SENT' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {ver.whatsapp_status || 'PENDING'}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          <a
                            href={`/api/reservations/${reservation.id}/confirmation/pdf?version=${ver.version}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-600 hover:text-sky-800 font-bold"
                          >
                            View
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Strict multi-tenant isolation enforced &bull; Hotel ID: {reservation.hotel_id?.slice(0, 8)}...
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-lg transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
