import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://mtfycmdoqzzyxhjmfvuv.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10ZnljbWRvcXp6eXhoam1mdnV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2OTI2NDcsImV4cCI6MjEwMjI2ODY0N30.oDelVfbf0DEYi5c5k8jgVBNjyNNwOnVzZYyMybNpfJs';

if (!process.env.VITE_SUPABASE_URL && !process.env.SUPABASE_URL) {
  console.warn('VITE_SUPABASE_URL not found in env, using verified fallback URL');
}

export const supabaseServiceRole = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
