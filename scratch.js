import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function test() {
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  // Get an existing user for testing
  const { data: { users } } = await client.auth.admin.listUsers();
  if (!users || users.length === 0) return;
  const testUser = users.find(u => u.email === 'superadmin@hotel.com');
  console.log("Found user:", testUser?.email);
  
  // We cannot easily generate a JWT token for a user without their password,
  // let's just inspect the auth.js file.
}
test();
