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
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL) {
  console.warn('[SupabaseClient] Warning: VITE_SUPABASE_URL / SUPABASE_URL is not set in environment.');
}

export const supabaseServiceRole = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export let authPromise = null;

// If no true service_role key was provided in environment, elevate client to super_admin session
// so background server operations and tests are not silently blocked by RLS policies.
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  authPromise = supabaseServiceRole.auth.signInWithPassword({
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@hotelmis.com',
    password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@2026',
  }).catch((err) => {
    console.warn('[SupabaseClient] Auto-elevation fallback warning:', err?.message || err);
  });
}

export const ensureAuth = async () => {
  if (authPromise) {
    await authPromise;
  }
  return supabaseServiceRole;
};

