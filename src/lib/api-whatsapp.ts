import { apiFetch } from './api-fetch';

export type WhatsAppReportType = 'daily' | 'morning' | 'evening' | 'ota';

export interface WhatsAppSummaryResponse {
  success: boolean;
  hotelId: string;
  hotelName: string;
  businessDate: string;
  businessDateReadable: string;
  ownerWhatsApp: {
    valid: boolean;
    phone: string;
    formattedPhone: string;
    rawPhone: string;
    source: string;
    hotelName: string;
    ownerName: string;
    error?: string;
  };
  providerConfig: {
    configured: boolean;
    provider: string;
  };
  summary: {
    hasData: boolean;
    dayStatus: 'OPEN' | 'CLOSED';
    occupancy: {
      totalRooms: number;
      occupied: number;
      vacant: number;
      percentage: number;
    };
    frontOffice: {
      arrivals: number;
      departures: number;
      inHouse: number;
      pendingCheckins: number;
      pendingCheckouts: number;
    };
    revenue: {
      roomRevenue: number;
      otherRevenue: number;
      grossRevenue: number;
    };
    collection: {
      cash: number;
      digital: number;
      ota: number;
      total: number;
      pendingDue: number;
    };
    roomStatus: {
      available: number;
      occupied: number;
      outOfOrder: number;
      blocked: number;
    };
    performance: {
      adr: number;
      revpar: number;
    };
    ota: {
      channels: Record<string, number>;
      totalBookings: number;
      totalRevenue: number;
    };
    attention: {
      unassignedRooms: number;
      pendingPaymentsCount: number;
      pendingPaymentsAmount: number;
    };
  };
  text: {
    daily: string;
    morning: string;
    evening: string;
    ota: string;
  };
  whatsappDirectUrls: {
    daily: string | null;
    morning: string | null;
    evening: string | null;
    ota: string | null;
  };
}

export interface WhatsAppSendResult {
  success: boolean;
  status: string;
  notificationId?: string;
  messageId?: string;
  provider?: string;
  recipient?: string;
  message?: string;
  error?: string;
  errorCode?: string;
  whatsappDirectUrl?: string | null;
}

export interface WhatsAppHistoryItem {
  id: string;
  hotel_id: string;
  business_date: string;
  report_type: string;
  delivery_type: string;
  recipient: string;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'duplicate';
  attempt_count: number;
  provider_message_id?: string | null;
  last_error?: string | null;
  sent_at?: string | null;
  created_at: string;
}

export interface WhatsAppSettingsResponse {
  success: boolean;
  whatsappNumber: string;
  normalizedNumber: string;
  isValid: boolean;
  source: string;
  provider: string;
  providerConfigured: boolean;
}

export interface SendWhatsAppParams {
  hotelId?: string;
  recipientPhone?: string;
  message?: string;
  summaryType?: WhatsAppReportType;
  businessDate?: string;
  deliveryType?: 'MANUAL' | 'SCHEDULED';
}

/**
 * Fetch calculated WhatsApp summary for a hotel and business date.
 */
export const fetchWhatsAppSummary = async (
  date: string,
  type: WhatsAppReportType = 'daily'
): Promise<WhatsAppSummaryResponse> => {
  return apiFetch(`/api/reports/whatsapp/summary?date=${encodeURIComponent(date)}&type=${type}`);
};

/**
 * Dispatches WhatsApp summary via the server-side WhatsApp provider.
 * Uses the canonical request contract:
 *   { hotelId, recipientPhone, message, summaryType, businessDate, deliveryType }
 */
export const sendWhatsAppSummary = async (
  dateOrParams: string | SendWhatsAppParams,
  type: WhatsAppReportType = 'daily',
  deliveryType: 'MANUAL' | 'SCHEDULED' = 'MANUAL',
  options?: {
    hotelId?: string;
    recipientPhone?: string;
    message?: string;
  }
): Promise<WhatsAppSendResult> => {
  let body: Record<string, any>;

  if (typeof dateOrParams === 'object' && dateOrParams !== null) {
    const p = dateOrParams;
    body = {
      hotelId: p.hotelId,
      recipientPhone: p.recipientPhone,
      message: p.message,
      summaryType: p.summaryType || 'daily',
      businessDate: p.businessDate,
      date: p.businessDate,
      type: p.summaryType || 'daily',
      deliveryType: p.deliveryType || 'MANUAL',
    };
  } else {
    body = {
      hotelId: options?.hotelId,
      recipientPhone: options?.recipientPhone,
      message: options?.message,
      summaryType: type,
      businessDate: dateOrParams,
      date: dateOrParams,
      type,
      deliveryType,
    };
  }

  try {
    const res = await apiFetch('/api/reports/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res;
  } catch (err: any) {
    // Gracefully handle structured error responses (e.g. 422 WHATSAPP_PROVIDER_NOT_CONFIGURED, 400 WHATSAPP_RECIPIENT_INVALID)
    return {
      success: false,
      status: err.status === 422 || err.error === 'WHATSAPP_PROVIDER_NOT_CONFIGURED' || err.errorCode === 'WHATSAPP_PROVIDER_NOT_CONFIGURED'
        ? 'provider_not_configured'
        : (err.status === 'invalid_recipient' || err.error === 'WHATSAPP_RECIPIENT_INVALID' || err.error === 'WHATSAPP_INVALID_RECIPIENT'
            ? 'invalid_recipient'
            : 'failed'),
      error: typeof err.error === 'string' ? err.error : (err.errorCode || 'WHATSAPP_SEND_FAILED'),
      errorCode: err.errorCode || err.error || 'WHATSAPP_SEND_FAILED',
      message: typeof err.message === 'string' ? err.message : 'WhatsApp summary delivery failed',
      whatsappDirectUrl: err.whatsappDirectUrl || null,
      provider: err.provider || 'NONE',
    };
  }
};

/**
 * Sends a test message to the hotel owner's configured WhatsApp number.
 */
export const sendTestWhatsApp = async (testPhone?: string): Promise<WhatsAppSendResult> => {
  try {
    const res = await apiFetch('/api/reports/whatsapp/test', {
      method: 'POST',
      body: JSON.stringify({ testPhone }),
    });
    return res;
  } catch (err: any) {
    return {
      success: false,
      status: err.status === 422 || err.error === 'WHATSAPP_PROVIDER_NOT_CONFIGURED' || err.errorCode === 'WHATSAPP_PROVIDER_NOT_CONFIGURED'
        ? 'provider_not_configured'
        : (err.status === 'invalid_recipient' || err.error === 'WHATSAPP_RECIPIENT_INVALID' || err.error === 'WHATSAPP_INVALID_RECIPIENT'
            ? 'invalid_recipient'
            : 'failed'),
      error: typeof err.error === 'string' ? err.error : (err.errorCode || 'WHATSAPP_TEST_FAILED'),
      errorCode: err.errorCode || err.error || 'WHATSAPP_TEST_FAILED',
      message: typeof err.message === 'string' ? err.message : 'Test WhatsApp message failed',
      whatsappDirectUrl: err.whatsappDirectUrl || null,
      provider: err.provider || 'NONE',
    };
  }
};

/**
 * Returns recent WhatsApp notification history.
 */
export const fetchWhatsAppHistory = async (limit = 20): Promise<WhatsAppHistoryItem[]> => {
  try {
    const res = await apiFetch(`/api/reports/whatsapp/history?limit=${limit}`);
    return res.history || [];
  } catch {
    return [];
  }
};

/**
 * Fetch WhatsApp phone number and configuration for this hotel.
 */
export const fetchWhatsAppSettings = async (): Promise<WhatsAppSettingsResponse> => {
  return apiFetch('/api/reports/whatsapp/settings');
};

/**
 * Updates WhatsApp phone number for this hotel.
 */
export const saveWhatsAppSettings = async (whatsappNumber: string): Promise<any> => {
  return apiFetch('/api/reports/whatsapp/settings', {
    method: 'POST',
    body: JSON.stringify({ whatsappNumber }),
  });
};

/**
 * Retries sending a failed notification.
 */
export const retryWhatsAppSend = async (notificationId: string): Promise<any> => {
  return apiFetch('/api/notifications/retry', {
    method: 'POST',
    body: JSON.stringify({ notificationId }),
  });
};
