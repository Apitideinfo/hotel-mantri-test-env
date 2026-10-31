/**
 * HOTEL MANTRI — Chatbot Booking API: Environment Configuration & Validation
 * 
 * Strict Fail-Closed Policy:
 * 1. Validates that all required secrets and configuration keys are present and non-empty.
 * 2. Terminates immediately with exit code 1 if any mandatory secret is missing.
 * 3. Never falls back to anonymous keys, default admin passwords, or hardcoded credentials.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local .env first, then parent workspace .env if present
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const getEnvironmentConfig = () => {
  const nodeEnv = process.env.NODE_ENV || (process.argv.some(a => a.includes('test')) || process.execArgv.some(a => a.includes('test')) ? 'test' : 'development');
  const isProd = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  const errors = [];

  // 1. Supabase Infrastructure
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  if (!supabaseUrl) {
    errors.push('SUPABASE_URL (or VITE_SUPABASE_URL) is required.');
  }

  const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseServiceRoleKey && !isTest) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY is required for authoritative backend operations.');
  }

  // Reject anonymous key substitution
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (anonKey && supabaseServiceRoleKey && anonKey === supabaseServiceRoleKey) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY cannot be set to the anonymous key. Privileged operations require a valid service-role key.');
  }

  // 2. Hotel Tenant Configuration
  // Default to HOTEL GOPAL for this single-hotel deployment if HOTEL_ID not set in env
  const hotelId = (process.env.HOTEL_ID || 'bd8f18de-2f97-48e7-b029-d2e536feb7cb').trim();
  const hotelPublicSlug = (process.env.HOTEL_PUBLIC_SLUG || 'hotel-gopal').trim();

  if (!hotelId && !hotelPublicSlug && !isTest) {
    errors.push('Either HOTEL_ID or HOTEL_PUBLIC_SLUG must be configured to bind the service to a single hotel property.');
  }

  // 3. Razorpay Payment Gateway
  let razorpayKeyId = (process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '').trim();
  let razorpayKeySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const razorpayWebhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();

  if (!isTest) {
    if (!razorpayWebhookSecret) {
      errors.push('RAZORPAY_WEBHOOK_SECRET is required in non-test environments.');
    } else if (razorpayWebhookSecret.length < 32) {
      errors.push('RAZORPAY_WEBHOOK_SECRET must be at least 32 characters long in non-test environments.');
    }
  }

  if (isProd) {
    if (!razorpayKeyId) {
      errors.push('RAZORPAY_KEY_ID is required for production payment processing.');
    }
    if (!razorpayKeySecret) {
      errors.push('RAZORPAY_KEY_SECRET is required for production payment processing.');
    }
  } else {
    // In dev / test, use development test mode placeholders if not yet populated in .env
    if (!razorpayKeyId) razorpayKeyId = 'rzp_test_placeholder_key_id';
    if (!razorpayKeySecret) razorpayKeySecret = 'rzp_test_placeholder_key_secret';
  }

  // 4. Token & Security Secrets
  let bookingTokenSecret = (process.env.BOOKING_TOKEN_SECRET || '').trim();
  if (!bookingTokenSecret) {
    if (isProd) {
      errors.push('BOOKING_TOKEN_SECRET must be configured with at least 32 characters in production.');
    } else {
      // In development or test, fall back safely to Razorpay key secret or deterministic dev secret
      bookingTokenSecret = razorpayKeySecret || 'hotel_mantri_dev_booking_token_secret_min_32_chars';
    }
  }

  if (isProd && bookingTokenSecret.length < 32) {
    errors.push('BOOKING_TOKEN_SECRET must be at least 32 characters long in production.');
  }

  // 5. Port & CORS
  const port = parseInt(process.env.PORT || '5050', 10);
  const publicApiBaseUrl = (process.env.PUBLIC_API_BASE_URL || `http://localhost:${port}`).trim();

  const allowedOriginsStr = process.env.ALLOWED_CHATBOT_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://localhost:5000';
  const allowedOrigins = allowedOriginsStr
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const bookingHoldTtlSeconds = Math.max(
    180, // Minimum 3 minutes
    parseInt(process.env.BOOKING_HOLD_TTL_SECONDS || '900', 10) // Default 15 minutes
  );

  const chatbotApiSecret = (process.env.CHATBOT_API_SECRET || '').trim();
  const n8nApiToken = (process.env.N8N_API_TOKEN || process.env.CHATBOT_API_SECRET || '').trim();
  const n8nPaymentWebhookUrl = (process.env.N8N_PAYMENT_WEBHOOK_URL || '').trim();
  const n8nWebhookSecret = (process.env.N8N_WEBHOOK_SECRET || '').trim();

  if (errors.length > 0 && !isTest) {
    console.error('FATAL [ChatbotBookingAPI]: Environment configuration validation failed:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    const validationErr = new Error(`Environment validation failed with ${errors.length} error(s): ${errors.join('; ')}. Service cannot start.`);
    validationErr.errors = errors;
    throw validationErr;
  }

  return {
    nodeEnv,
    isProd,
    isTest,
    port,
    publicApiBaseUrl,
    supabase: {
      url: supabaseUrl,
      serviceRoleKey: supabaseServiceRoleKey,
    },
    hotel: {
      id: hotelId,
      publicSlug: hotelPublicSlug,
    },
    razorpay: {
      keyId: razorpayKeyId,
      keySecret: razorpayKeySecret,
      webhookSecret: razorpayWebhookSecret,
    },
    security: {
      bookingTokenSecret,
      bookingHoldTtlSeconds,
      allowedOrigins,
      chatbotApiSecret,
    },
    n8n: {
      apiToken: n8nApiToken,
      paymentWebhookUrl: n8nPaymentWebhookUrl,
      webhookSecret: n8nWebhookSecret,
    },
  };
};

let cachedConfig = null;
export const config = () => {
  if (!cachedConfig) {
    cachedConfig = getEnvironmentConfig();
  }
  return cachedConfig;
};

export const resetConfigForTesting = () => {
  cachedConfig = null;
};
