/**
 * HOTEL MANTRI — N5: PRIVILEGED STAFF & SUPER ADMIN REVIEW REPORT
 * 
 * Generates an audit list of all accounts holding `hotel_admin` or `super_admin` privileges
 * across all hotels. The system owner must review this report prior to production go-live.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function generatePrivilegedStaffReport() {
  console.log('='.repeat(80));
  console.log(' HOTEL MANTRI — PRIVILEGED STAFF & ADMIN AUDIT REPORT (N5)');
  console.log('='.repeat(80));

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log('ℹ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in environment.');
    console.log('  Run with valid service credentials to query live database.');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const { data: admins, error } = await supabase
      .from('hotel_admins')
      .select('id, hotel_id, user_id, email, role, staff_role, status, created_at')
      .or('role.eq.super_admin,staff_role.eq.hotel_admin')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error querying privileged staff:', error.message);
      return;
    }

    console.log(`Found ${admins.length} privileged staff accounts:\n`);
    console.table(
      admins.map(a => ({
        ID: a.id,
        HotelID: a.hotel_id,
        Email: a.email || 'N/A',
        Role: a.role,
        StaffRole: a.staff_role,
        Status: a.status,
        Created: a.created_at ? a.created_at.slice(0, 10) : 'N/A'
      }))
    );

    console.log('\nOWNER ACTION REQUIRED:');
    console.log('Verify that every email above is an authorized hotel owner or system administrator.');
    console.log('Demote any unauthorized accounts before launching into production.\n');
  } catch (err) {
    console.error('Report failed:', err.message);
  }
}

generatePrivilegedStaffReport();
