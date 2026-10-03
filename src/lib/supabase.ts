import { createClient } from '@supabase/supabase-js';

const getEnvVar = (key: string) => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch {
    // Ignore in non-esm/node context
  }
  const gProcess = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process;
  if (typeof gProcess !== 'undefined' && gProcess.env && gProcess.env[key]) {
    return gProcess.env[key];
  }
  return '';
};

const DEFAULT_SUPABASE_URL = 'https://mtfycmdoqzzyxhjmfvuv.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10ZnljbWRvcXp6eXhoam1mdnV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2OTI2NDcsImV4cCI6MjEwMjI2ODY0N30.oDelVfbf0DEYi5c5k8jgVBNjyNNwOnVzZYyMybNpfJs';

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL') || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY') || DEFAULT_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const gProcess = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process;
  if (!gProcess || gProcess.env?.NODE_ENV !== 'test') {
    console.error('Critical: Missing required Supabase environment variables VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
  }
}

export const isPlaceholderSupabase =
  !supabaseUrl ||
  supabaseUrl.includes('placeholder') ||
  !supabaseAnonKey ||
  supabaseAnonKey.includes('placeholder');

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});


