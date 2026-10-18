import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class WebSocket {
    constructor() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
  };
}

import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';

if (!SUPABASE_URL) {
  console.warn('[SupabaseClient] Warning: VITE_SUPABASE_URL / SUPABASE_URL is not set in environment.');
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[SupabaseClient] Warning: SUPABASE_SERVICE_ROLE_KEY is not set in environment. Privileged server operations will fail safely until configured.');
}

/**
 * Validates that the provided key is a legitimate service_role key
 * and not an anonymous key or missing configuration.
 */
export const validateServiceRoleKey = (key) => {
  if (!key || typeof key !== 'string' || key.trim() === '') {
    return {
      valid: false,
      code: 'SERVICE_ROLE_KEY_MISSING',
      message: 'SUPABASE_SERVICE_ROLE_KEY is not configured in the environment.',
    };
  }

  // Never accept anonymous keys as substitute for privileged service role
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (anonKey && key.trim() === anonKey.trim()) {
    return {
      valid: false,
      code: 'ANON_KEY_SUBSTITUTION_REJECTED',
      message: 'SUPABASE_SERVICE_ROLE_KEY cannot be set to the anonymous key. Privileged operations require a service_role key.',
    };
  }

  // Inspect JWT claims if standard JWT format
  try {
    const parts = key.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      if (payload && payload.role === 'anon') {
        return {
          valid: false,
          code: 'ANON_KEY_SUBSTITUTION_REJECTED',
          message: 'SUPABASE_SERVICE_ROLE_KEY is an anonymous key, not a privileged service_role key.',
        };
      }
    }
  } catch {
    // If not a standard JWT, let createClient handle network/format verification
  }

  return { valid: true };
};

let clientInstance = null;
let lastUsedKey = null;
let lastUsedUrl = null;

/**
 * Resolves or constructs the authoritative Supabase Service Role client singleton.
 * Configured with persistSession: false to prevent cross-request session leakage.
 */
export const getServiceRoleClient = () => {
  const currentKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const currentUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';

  if (!currentUrl) {
    throw new Error('[SupabaseClient] Privileged operation failed: SUPABASE_URL is not configured in the environment.');
  }

  const validation = validateServiceRoleKey(currentKey);
  if (!validation.valid) {
    throw new Error(`[SupabaseClient] Privileged operation failed: ${validation.message}. Service must fail closed.`);
  }

  if (!clientInstance || lastUsedKey !== currentKey || lastUsedUrl !== currentUrl) {
    clientInstance = createClient(currentUrl, currentKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    lastUsedKey = currentKey;
    lastUsedUrl = currentUrl;
  }

  return clientInstance;
};

/**
 * Authoritative service-role client proxy.
 * Validates configuration at the point of invocation and prevents silent execution with missing credentials.
 */
export const supabaseServiceRole = new Proxy({}, {
  get(target, prop, receiver) {
    if (prop === 'then') return undefined;
    const client = getServiceRoleClient();
    const val = Reflect.get(client, prop, receiver);
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  },
});

export let authPromise = Promise.resolve();

/**
 * Backwards-compatible authorization readiness helper.
 * Validates service-role configuration and returns the client instance.
 */
export const ensureAuth = async () => {
  return getServiceRoleClient();
};

