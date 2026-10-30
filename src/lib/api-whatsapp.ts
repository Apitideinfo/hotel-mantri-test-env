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
  pdfUrl?: string | null;
  pdfFilename?: string | null;
}

export interface WhatsAppHistoryItem {
  id: string;
  hotel_id: string;
  business_date: string;
  report_type: string;
  delivery_type: string;
  recipient: string;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'duplicate' | 'submitted' | 'delivered';
  attempt_count: number;
  provider_message_id?: string | null;
  last_error?: string | null;
  sent_at?: string | null;
  created_at: string;
}

export interface WhatsAppTemplateItem {
  id?: string;
  templateId?: string;
  name: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | string;
  language: string;
  category?: string;
  headerType?: string;
  headerFormat?: string | null;
  bodyText?: string;
  bodyVariables?: string[];
  footerText?: string | null;
  buttons?: any[];
  components?: any[];
}

export interface WhatsAppSettingsResponse {
  success: boolean;
  hotelId?: string;
  hotelName?: string;
  whatsappNumber: string;
  reportRecipientPhone?: string;
  normalizedNumber: string;
  countryCode?: string;
  dailyReportEnabled?: boolean;
  reservationConfirmationEnabled?: boolean;
  reservationTemplate?: string;
  dailyReportTemplate?: string;
  whatsappReservationLanguage?: string;
  whatsappDailyReportLanguage?: string;
  templatesLastSyncedAt?: string | null;
  templateHasDocumentHeader?: boolean;
  templateLanguage?: string;
  laundryStatementEnabled?: boolean;
  preferredDeliveryTime?: string;
  timezone?: string;
  deliveryPreferences?: {
    send_morning?: boolean;
    send_evening?: boolean;
    include_pdf?: boolean;
  };
  consentStatus?: string;
  lastSuccessfulSend?: string | null;
  lastFailureReason?: string | null;
  lastFailureAt?: string | null;
  isValid: boolean;
  source: string;
  provider: string;
  providerConfigured: boolean;
  providerEnabled?: boolean;
}

export interface SaveWhatsAppSettingsParams {
  whatsappNumber?: string;
  reportRecipientPhone?: string;
  countryCode?: string;
  dailyReportEnabled?: boolean;
  reservationConfirmationEnabled?: boolean;
  reservationTemplate?: string;
  dailyReportTemplate?: string;
  templateHasDocumentHeader?: boolean;
  templateLanguage?: string;
  laundryStatementEnabled?: boolean;
  preferredDeliveryTime?: string;
  timezone?: string;
  deliveryPreferences?: {
    send_morning?: boolean;
    send_evening?: boolean;
    include_pdf?: boolean;
  };
  consentStatus?: string;
}

export interface SendWhatsAppParams {
  hotelId?: string;
  recipientPhone?: string;
  message?: string;
  summaryType?: WhatsAppReportType;
  businessDate?: string;
  deliveryType?: 'MANUAL' | 'SCHEDULED';
  includePdf?: boolean;
}

export interface WhatsAppConfigResponse {
  success: boolean;
  provider: string;
  configured: boolean;
  enabled?: boolean;
  active?: boolean;
  graphApiVersion?: string;
  hasAccessToken?: boolean;
  hasPhoneNumberId?: boolean;
  hasBusinessAccountId?: boolean;
  phoneNumberIdSuffix?: string | null;
  businessAccountIdSuffix?: string | null;
  reservationTemplate?: string;
  dailyReportTemplate?: string;
  isTemplateApproved?: boolean;
  testMode?: boolean;
  diagnostics?: any;
}

export interface MetaConnectionResponse {
  success: boolean;
  configured: boolean;
  connected: boolean;
  provider?: string;
  graphApiVersion?: string;
  phoneNumberId?: string;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  qualityRating?: string;
  codeVerificationStatus?: string;
  nameStatus?: string;
  message?: string;
  error?: string;
  errorCode?: string;
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
 * Dispatches WhatsApp summary via official Meta WhatsApp Business Cloud API.
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
      provider: err.provider || 'META',
    };
  }
};

/**
 * Sends a test message via official Meta WhatsApp Business Cloud API.
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
      provider: err.provider || 'META',
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
 * Updates WhatsApp recipient and delivery preferences for this hotel.
 */
export const saveWhatsAppSettings = async (
  settingsOrPhone: string | SaveWhatsAppSettingsParams
): Promise<any> => {
  const body = typeof settingsOrPhone === 'string'
    ? { whatsappNumber: settingsOrPhone }
    : settingsOrPhone;

  return apiFetch('/api/reports/whatsapp/settings', {
    method: 'POST',
    body: JSON.stringify(body),
  });
};

/**
 * Tests connection with Meta WhatsApp Cloud API.
 */
export const verifyMetaConnection = async (): Promise<MetaConnectionResponse> => {
  return apiFetch('/api/reports/whatsapp/verify-connection', {
    method: 'POST',
  });
};


/**
 * Fetches approved WhatsApp message templates from Meta WABA or Supabase cache.
 */
export const fetchWhatsAppTemplates = async (force = false): Promise<{
  success: boolean;
  fromCatalog?: boolean;
  fromDatabase?: boolean;
  count?: number;
  templates: WhatsAppTemplateItem[];
  message?: string;
}> => {
  return apiFetch(`/api/reports/whatsapp/templates${force ? '?force=true' : ''}`);
};

/**
 * Synchronizes templates directly from Meta WhatsApp Business Account into Supabase.
 */
export const syncWhatsAppTemplates = async (hotelId?: string): Promise<{
  success: boolean;
  fromCatalog?: boolean;
  count?: number;
  templates: WhatsAppTemplateItem[];
  message?: string;
  error?: string;
}> => {
  try {
    return await apiFetch('/api/reports/whatsapp/templates/sync', {
      method: 'POST',
      body: JSON.stringify({ hotelId }),
    });
  } catch {
    return apiFetch('/api/whatsapp/templates/sync', {
      method: 'POST',
      body: JSON.stringify({ hotelId }),
    });
  }
};

/**
 * Fetches server-side WhatsApp provider status without exposing credentials.
 */
export const fetchWhatsAppConfig = async (): Promise<WhatsAppConfigResponse> => {
  return apiFetch('/api/reports/whatsapp/config');
};

/**
 * Retries sending a failed notification.
 */
export const retryWhatsAppSend = async (notificationId: string): Promise<any> => {
  try {
    return await apiFetch('/api/reports/whatsapp/retry-send', {
      method: 'POST',
      body: JSON.stringify({ notificationId }),
    });
  } catch {
    return apiFetch('/api/notifications/retry', {
      method: 'POST',
      body: JSON.stringify({ notificationId }),
    });
  }
};
