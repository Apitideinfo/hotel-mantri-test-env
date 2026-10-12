import { useState } from 'react';
import {
  getReservationConfirmationData,
  sendReservationConfirmationEmail,
} from '@/lib/api-reservations';
import {
  downloadReservationConfirmationPdf,
  printReservationConfirmationPdf,
} from '@/lib/pdf-reservation';
import { fmtInt } from '@/lib/calc';

export interface UseReservationDocumentsParams {
  targetResId: string;
  guestName: string;
  phone?: string;
  roomNo: string;
  roomCategoryName?: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  rate: number;
  hotelName?: string;
  fmtDate?: (d: string) => string;
}

export interface UseReservationDocumentsResult {
  activeDocAction: 'pdf' | 'print' | 'email' | 'whatsapp' | null;
  docSuccess: string | null;
  docError: string | null;
  setDocSuccess: React.Dispatch<React.SetStateAction<string | null>>;
  setDocError: React.Dispatch<React.SetStateAction<string | null>>;
  handleDocPdf: () => Promise<void>;
  handleDocPrint: () => Promise<void>;
  handleDocEmail: () => Promise<void>;
  handleDocWhatsApp: () => void;
  clearDocMessages: () => void;
}

/**
 * Custom hook to isolate confirmation document operations:
 * PDF generation, printing, Email dispatch, and WhatsApp routing.
 */
export const useReservationDocuments = ({
  targetResId,
  guestName,
  phone,
  roomNo,
  roomCategoryName,
  checkIn,
  checkOut,
  nights,
  rate,
  hotelName = 'Hotel Mantri',
  fmtDate = (d) => d,
}: UseReservationDocumentsParams): UseReservationDocumentsResult => {
  const [activeDocAction, setActiveDocAction] = useState<'pdf' | 'print' | 'email' | 'whatsapp' | null>(null);
  const [docSuccess, setDocSuccess] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  const clearDocMessages = () => {
    setDocSuccess(null);
    setDocError(null);
  };

  const handleDocPdf = async () => {
    if (activeDocAction) return;
    setActiveDocAction('pdf');
    setDocError(null);
    setDocSuccess(null);
    try {
      const data = await getReservationConfirmationData(targetResId);
      downloadReservationConfirmationPdf({
        reservation: data.reservation,
        settings: data.hotel as any,
      });
      setDocSuccess('Confirmation PDF downloaded.');
    } catch (err: any) {
      setDocError(err.message || 'Failed to generate confirmation PDF.');
    } finally {
      setActiveDocAction(null);
      setTimeout(() => setDocSuccess(null), 4000);
    }
  };

  const handleDocPrint = async () => {
    if (activeDocAction) return;
    setActiveDocAction('print');
    setDocError(null);
    setDocSuccess(null);
    try {
      const data = await getReservationConfirmationData(targetResId);
      printReservationConfirmationPdf({
        reservation: data.reservation,
        settings: data.hotel as any,
      });
      setDocSuccess('Print dialog opened.');
    } catch (err: any) {
      setDocError(err.message || 'Failed to print confirmation.');
    } finally {
      setActiveDocAction(null);
      setTimeout(() => setDocSuccess(null), 4000);
    }
  };

  const handleDocEmail = async () => {
    if (activeDocAction) return;
    setActiveDocAction('email');
    setDocError(null);
    setDocSuccess(null);
    try {
      const data = await getReservationConfirmationData(targetResId);
      const res = await sendReservationConfirmationEmail(data);
      setDocSuccess(res.message || 'Confirmation email dispatched.');
    } catch (err: any) {
      setDocError(err.message || 'Failed to send confirmation email.');
    } finally {
      setActiveDocAction(null);
      setTimeout(() => setDocSuccess(null), 5000);
    }
  };

  const handleDocWhatsApp = () => {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (!cleanPhone) {
      setDocError('Guest has no valid phone number for WhatsApp.');
      setTimeout(() => setDocError(null), 4000);
      return;
    }
    const msg = `Dear ${guestName},\n\nYour reservation details at ${hotelName}:\n🏨 Room: ${roomNo} (${roomCategoryName || 'Room'})\n📅 Check-In: ${fmtDate(checkIn)}\n📅 Check-Out: ${fmtDate(checkOut)}\n🌙 Nights: ${nights}\n💰 Rate: ₹${fmtInt(rate)}/night\n💵 Total: ₹${fmtInt(rate * nights)}\n\nWe look forward to hosting you!`;
    const waPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return {
    activeDocAction,
    docSuccess,
    docError,
    setDocSuccess,
    setDocError,
    handleDocPdf,
    handleDocPrint,
    handleDocEmail,
    handleDocWhatsApp,
    clearDocMessages,
  };
};
