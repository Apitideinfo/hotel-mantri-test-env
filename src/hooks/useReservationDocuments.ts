import { useState } from 'react';
import {
  getReservationConfirmationData,
  sendReservationConfirmationEmail,
  sendReservationConfirmationWhatsApp,
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
  docFallbackUrl: string | null;
  setDocSuccess: React.Dispatch<React.SetStateAction<string | null>>;
  setDocError: React.Dispatch<React.SetStateAction<string | null>>;
  setDocFallbackUrl: React.Dispatch<React.SetStateAction<string | null>>;
  handleDocPdf: () => Promise<void>;
  handleDocPrint: () => Promise<void>;
  handleDocEmail: () => Promise<void>;
  handleDocWhatsApp: () => Promise<void>;
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
  const [docFallbackUrl, setDocFallbackUrl] = useState<string | null>(null);

  const clearDocMessages = () => {
    setDocSuccess(null);
    setDocError(null);
    setDocFallbackUrl(null);
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
        multiRooms: data.multiRooms,
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
        multiRooms: data.multiRooms,
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

  const handleDocWhatsApp = async () => {
    if (activeDocAction) return;
    setActiveDocAction('whatsapp');
    setDocError(null);
    setDocSuccess(null);
    setDocFallbackUrl(null);
    try {
      const res = await sendReservationConfirmationWhatsApp(targetResId, phone);
      setDocSuccess(res.message || 'Confirmation dispatched via Meta WhatsApp.');
    } catch (err: any) {
      // Do NOT auto open WhatsApp Web! Report the exact Meta WhatsApp error
      const cleanPhone = (phone || '').replace(/\D/g, '');
      let fallbackUrl: string | null = null;
      if (err?.whatsappDirectUrl) {
        fallbackUrl = err.whatsappDirectUrl;
      } else if (cleanPhone) {
        const msg = `Dear ${guestName},\n\nYour reservation details at ${hotelName}:\nðŸ¨ Room: ${roomNo} (${roomCategoryName || 'Room'})\nðŸ“… Check-In: ${fmtDate(checkIn)}\nðŸ“… Check-Out: ${fmtDate(checkOut)}\nðŸŒ™ Nights: ${nights}\nðŸ’° Rate: â‚¹${fmtInt(rate)}/night\nðŸ’µ Total: â‚¹${fmtInt(rate * nights)}\n\nWe look forward to hosting you!`;
        const waPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
        fallbackUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`;
      }
      setDocFallbackUrl(fallbackUrl);
      setDocError(err.message || 'Failed to send WhatsApp confirmation via WhatsApp.');
    } finally {
      setActiveDocAction(null);
      setTimeout(() => setDocSuccess(null), 6000);
    }
  };

  return {
    activeDocAction,
    docSuccess,
    docError,
    docFallbackUrl,
    setDocSuccess,
    setDocError,
    setDocFallbackUrl,
    handleDocPdf,
    handleDocPrint,
    handleDocEmail,
    handleDocWhatsApp,
    clearDocMessages,
  };
};
