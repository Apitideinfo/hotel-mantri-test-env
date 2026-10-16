/**
 * HOTEL MANTRI — Chatbot Booking API: Fail-Closed Supabase Client
 * 
 * Provides:
 * 1. Authoritative Supabase Service Role client singleton with zero session persistence.
 * 2. Strict fail-closed verification: throws fatal error if credentials missing.
 * 3. Never authenticates with hardcoded administrator credentials.
 * 4. Never substitutes anonymous key for privileged operations.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../config/environment.js';

let supabaseInstance = null;

export const getSupabaseClient = () => {
  if (supabaseInstance) return supabaseInstance;

  const env = config();
  const url = env.supabase.url;
  const key = env.supabase.serviceRoleKey;

  if (!url) {
    throw new Error('[SupabaseClient] Privileged operation failed: SUPABASE_URL is not configured.');
  }

  if (!key) {
    throw new Error('[SupabaseClient] Privileged operation failed: SUPABASE_SERVICE_ROLE_KEY is not configured. Service must fail closed.');
  }

  supabaseInstance = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseInstance;
};

export const setSupabaseClientForTesting = (mockClient) => {
  supabaseInstance = mockClient;
};

// Export proxy that invokes getSupabaseClient() on first access
export const supabase = new Proxy({}, {
  get(target, prop, receiver) {
    const client = getSupabaseClient();
    const val = Reflect.get(client, prop, receiver);
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  },
});
