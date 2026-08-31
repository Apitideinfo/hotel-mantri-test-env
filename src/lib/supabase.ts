import { createClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (import.meta.env.PROD && (!envUrl || !envAnonKey)) {
  throw new Error("Missing required Supabase environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
}

const supabaseUrl = envUrl || 'https://placeholder-hotel.supabase.co';
const supabaseAnonKey = envAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTkwMDAwMDAwMH0.placeholder';

export const isPlaceholderSupabase =
  !envUrl ||
  envUrl.includes('placeholder') ||
  supabaseUrl.includes('placeholder');

if (isPlaceholderSupabase) {
  console.warn('Supabase configuration is using placeholder values. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env for production database access.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});


