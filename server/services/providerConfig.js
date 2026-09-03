import dotenv from 'dotenv';
import crypto from 'crypto';
import { supabaseServiceRole } from '../supabaseClient.js';

dotenv.config();

/**
 * Safe Diagnostic Logging Helper
 * Strictly prohibits logging passwords, tokens, Basic Auth, cookies, or secrets.
 */
export const logProviderDiagnostic = ({
  operation,
  hotelId,
  hotelCode,
  partnerId,
  endpoint,
  method = 'GET',
  status,
  credentialPresent = false,
  environment = 'production',
  requestId = null,
  message = null,
}) => {
  const reqId = requestId || `HM-CH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  console.log(`[ProviderDiag - ${reqId}] ${method} ${endpoint} | Op: ${operation} | Hotel: ${hotelId || 'N/A'} | Code: ${hotelCode || 'N/A'} | Partner: ${partnerId || 'N/A'} | Env: ${environment} | Status: ${status ?? 'N/A'} | CredPresent: ${credentialPresent} | ${message || ''}`);
  return reqId;
};

/**
 * Creates structured provider error object matching Hotel Mantri API error contract.
 */
export const createProviderError = (code, message, status = 500, details = null, requestId = null) => {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  err.details = details;
  err.requestId = requestId;
  return err;
};

/**
 * Centralized Server-Side Channel Provider Configuration Resolver
 * Resolves hotelCode, partnerId, credentials, and baseUrl with fallback chain.
 * NEVER exposes provider credentials to client.
 */
export const getChannelProviderConfig = async (hotelId, requestId = null) => {
  if (!hotelId) {
    throw createProviderError('HOTEL_CONTEXT_REQUIRED', 'Hotel context is required to resolve channel configuration.', 400, null, requestId);
  }

  // 1. Fetch channel_settings for this hotel
  const { data: settings, error: settingsError } = await supabaseServiceRole
    .from('channel_settings')
    .select('*')
    .eq('hotel_id', hotelId)
    .maybeSingle();

  if (settingsError) {
    console.error(`[getChannelProviderConfig] DB error loading channel_settings for hotel ${hotelId}:`, settingsError);
  }

  // 2. Fetch hotel record for fallback property_code
  let propertyCodeFallback = null;
  if (!settings?.aiosell_hotel_code) {
    const { data: hotel } = await supabaseServiceRole
      .from('hotels')
      .select('property_code')
      .eq('id', hotelId)
      .maybeSingle();
    propertyCodeFallback = hotel?.property_code || null;
  }

  const hotelCode = settings?.aiosell_hotel_code || propertyCodeFallback || process.env.AIOSELL_HOTEL_CODE;
  const partnerId = settings?.aiosell_partner_id || process.env.AIOSELL_PARTNER_ID || 'hotel-mantri-pms';
  const environment = settings?.aiosell_environment || process.env.AIOSELL_ENVIRONMENT || 'production';
  const username = process.env.AIOSELL_USERNAME || '';
  const password = process.env.AIOSELL_PASSWORD || '';
  const baseUrl = process.env.AIOSELL_BASE_URL || 'https://live.aiosell.com/api/v2/cm';

  const credentialPresent = Boolean(username && password);

  if (!credentialPresent) {
    logProviderDiagnostic({
      operation: 'CONFIG_CHECK',
      hotelId,
      hotelCode,
      partnerId,
      endpoint: baseUrl,
      status: 401,
      credentialPresent: false,
      environment,
      requestId,
      message: 'Server integration credentials (username/password) are missing'
    });
    throw createProviderError(
      'PROVIDER_CONFIGURATION_MISSING',
      'Channel integration server credentials are not configured. Please contact the administrator.',
      401,
      { credentialPresent: false },
      requestId
    );
  }

  if (!hotelCode) {
    logProviderDiagnostic({
      operation: 'CONFIG_CHECK',
      hotelId,
      hotelCode: null,
      partnerId,
      endpoint: baseUrl,
      status: 400,
      credentialPresent: true,
      environment,
      requestId,
      message: 'Hotel external property code is not configured'
    });
    throw createProviderError(
      'PROVIDER_PROPERTY_NOT_FOUND',
      'The external property code is not configured for this hotel in Channel Settings.',
      400,
      { hotelId },
      requestId
    );
  }

  if (!partnerId) {
    logProviderDiagnostic({
      operation: 'CONFIG_CHECK',
      hotelId,
      hotelCode,
      partnerId: null,
      endpoint: baseUrl,
      status: 400,
      credentialPresent: true,
      environment,
      requestId,
      message: 'Channel partner ID is not configured'
    });
    throw createProviderError(
      'PROVIDER_CONFIGURATION_MISSING',
      'Channel partner identifier is missing. Please configure the partner identifier.',
      400,
      { hotelId },
      requestId
    );
  }

  return {
    hotelId,
    hotelCode,
    partnerId,
    environment,
    username,
    password,
    baseUrl: baseUrl.replace(/\/+$/, ''), // strip trailing slashes
    credentialPresent: true
  };
};

export default {
  getChannelProviderConfig,
  logProviderDiagnostic,
  createProviderError
};
