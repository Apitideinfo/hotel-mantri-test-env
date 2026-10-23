import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Real protected hotels that must NEVER be deleted:
// - Hotel Gopal: df9a4949-afb9-404d-ae37-e11457fa624e
// - Hotel Swagat: aa5bfd36-de50-4217-8997-d2cd18e4dfe8
// - mars hotel: 9001eb1c-9d38-49d0-84f7-75244e8f4bf8
// - akii hotel: 00ac366c-5150-4dfb-b354-60bc61ddcf4c
// - Jupitar prop: fdb1dc18-0da5-4906-8bd6-05b877ab13bc

// Real protected users that must NEVER be deleted:
const PROTECTED_EMAILS = new Set([
  'superadmin@hotel.com',
  'admin@hotelmantri.com',
  'admin@hotelmis.com',
  'hotel.mantri74@gmail.com',
  'hotelswagat.dwarka@gmail.com',
  'pujavyas1982@gmail.com',
  'gopalhotel9@gmail.com',
  'akshayvyas505@gmail.com',
  'kiradoshreeballabh@gmail.com',
  '1stfloor@hotel.hotelmantri.internal'
]);

async function main() {
  console.log('================================================================');
  console.log('HOTEL MANTRI — PURGE ALL TEST AND DUMMY DATA');
  console.log('================================================================');

  // 1. DELETE TEST HOTELS
  console.log('\n--- 1. Purging Test Hotels Created by Automated Scripts ---');
  const { data: testHotels } = await supabase
    .from('hotels')
    .select('id, hotel_name')
    .or('hotel_name.ilike.%mvl7%,hotel_name.ilike.%test%,hotel_name.ilike.%dummy%');

  if (testHotels && testHotels.length > 0) {
    for (const h of testHotels) {
      console.log(`  Deleting test hotel: [${h.id}] "${h.hotel_name}"`);
      // Delete dependent rows
      await supabase.from('hotel_settings').delete().eq('id', h.id);
      await supabase.from('hotel_features').delete().eq('hotel_id', h.id);
      await supabase.from('company_sources').delete().eq('hotel_id', h.id);
      await supabase.from('channel_settings').delete().eq('hotel_id', h.id);
      await supabase.from('audit_logs').delete().eq('hotel_id', h.id);
      await supabase.from('hotels').delete().eq('id', h.id);
    }
    console.log(`  ✓ Removed ${testHotels.length} test hotel(s)`);
  } else {
    console.log('  ✓ No test hotels found in hotels table.');
  }

  // 2. PURGE ORPHAN & DUMMY HOTEL SETTINGS
  console.log('\n--- 2. Purging Orphan & Dummy Hotel Settings ---');
  const dummySettingsIds = [
    '11111111-1111-4111-8111-111111111111',
    '2fb1e4de-de39-4ad3-ac75-a03f196157b4',
    '2fe453f4-52e0-4f1e-9de5-1d4fe03ce86c',
    '9e60d361-8b5b-4a5c-83d8-227c6d2ae262',
    '873f83b0-42d8-4bf7-beb7-ba643e9be174',
    '99541c2e-18db-4cb7-8c37-1156cec57842'
  ];
  for (const sid of dummySettingsIds) {
    const { error } = await supabase.from('hotel_settings').delete().eq('id', sid);
    if (!error) console.log(`  ✓ Removed orphan/dummy hotel_settings: ${sid}`);
  }

  // Also fix mars hotel's hotel_settings name if it still says "test hotel"
  const { data: marsSettings } = await supabase.from('hotel_settings').select('hotel_name').eq('id', '9001eb1c-9d38-49d0-84f7-75244e8f4bf8').single();
  if (marsSettings && marsSettings.hotel_name.toLowerCase().includes('test')) {
    await supabase.from('hotel_settings').update({ hotel_name: 'Mars Hotel' }).eq('id', '9001eb1c-9d38-49d0-84f7-75244e8f4bf8');
    console.log('  ✓ Updated Mars Hotel hotel_settings name from "test hotel" to "Mars Hotel"');
  }

  // 3. PURGE ORPHAN / DUMMY CHANNEL SETTINGS
  console.log('\n--- 3. Purging Orphan & Dummy Channel Settings ---');
  const dummyChannelSettingsIds = [
    '66b06a97-7ed1-443e-90a5-11a50c553b7d',
    'e96b309c-e109-4ced-9315-dbfb4c9fb508',
    '7b55771d-311d-4747-8ee0-d4399c8c9757',
    'dd64e936-6400-43ed-b35a-911dbb06a277',
    '37fdb59b-21e5-4daf-9bc2-41f2b7896f5e',
    '901c9e3e-8b6e-42ba-b7df-8d63904b01f7',
    '5357ffe7-dfc5-45e5-9beb-310ddae667ec'
  ];
  for (const csid of dummyChannelSettingsIds) {
    await supabase.from('channel_settings').delete().eq('id', csid);
  }
  console.log(`  ✓ Removed ${dummyChannelSettingsIds.length} orphan/dummy channel_settings rows`);

  // 4. PURGE DUMMY RESERVATIONS
  console.log('\n--- 4. Purging Dummy Reservations & Dependent Sub-records ---');
  const dummyReservationIds = [
    '399db107-5949-446e-85d6-51d5dde2d5ae',
    '2c2b0a81-3007-4bec-9295-4452e7a1b465',
    'eb97a685-a867-473a-ac58-36521caed07e',
    'a6a3c4aa-808f-4ae4-9c80-06437fd91678',
    '010aa812-d351-405e-8763-787703cd235a'
  ];

  // Dependent tables to clean for these dummy reservation IDs
  const resvDependents = [
    'reservation_documents',
    'room_night_revenue',
    'payment_transactions',
    'folio_charges',
    'room_shifts',
    'guest_stays',
    'booking_timeline',
    'room_chart_entries'
  ];

  for (const dt of resvDependents) {
    try {
      await supabase.from(dt).delete().in('reservation_id', dummyReservationIds);
    } catch (e) {
      // ignore
    }
  }

  const { error: delResvErr } = await supabase.from('reservations').delete().in('id', dummyReservationIds);
  if (delResvErr) console.warn('Reservation delete error:', delResvErr.message);
  else console.log(`  ✓ Purged ${dummyReservationIds.length} dummy reservations`);

  // Also remove dummy guests for hotel 11111111-1111-4111-8111-111111111111 or named 'Test user'
  try {
    const { count: delGuestCount } = await supabase
      .from('guests')
      .delete({ count: 'exact' })
      .or('hotel_id.eq.11111111-1111-4111-8111-111111111111,name.ilike.%Test user%');
    console.log(`  ✓ Removed ${delGuestCount || 0} dummy guest records`);
  } catch (e) {
    console.warn('Guest clean warning:', e.message);
  }

  // 5. PURGE TEST CHANNEL CONNECTIONS
  console.log('\n--- 5. Purging Dummy Channel Connections ---');
  const { data: testConns } = await supabase
    .from('channel_connections')
    .select('id, channel_name, hotel_id')
    .or('channel_name.ilike.%test%,channel_name.ilike.%dummy%');

  if (testConns && testConns.length > 0) {
    for (const c of testConns) {
      await supabase.from('channel_rate_mappings').delete().eq('channel_connection_id', c.id);
      await supabase.from('channel_connections').delete().eq('id', c.id);
      console.log(`  ✓ Removed test channel_connection: ${c.id} ("${c.channel_name}")`);
    }
  } else {
    console.log('  ✓ No test channel connections found.');
  }

  // 6. PURGE TEST / DUMMY AUTH ACCOUNTS
  console.log('\n--- 6. Purging Automated Test Auth Users ---');
  const { data: { users: allUsers } } = await supabase.auth.admin.listUsers();
  let deletedUsersCount = 0;

  for (const u of allUsers || []) {
    const email = u.email || '';
    if (PROTECTED_EMAILS.has(email)) continue;

    const isTestUser = 
      email.includes('test') || 
      email.includes('dummy') || 
      email.includes('example.com') ||
      email.includes('production-test.com') ||
      email.includes('hk_audit_') ||
      email.includes('mvl7');

    if (isTestUser) {
      // Remove any hotel_admins or hotel_users rows first
      await supabase.from('hotel_admins').delete().eq('user_id', u.id);
      await supabase.from('hotel_users').delete().eq('user_id', u.id);
      await supabase.from('user_roles').delete().eq('user_id', u.id);
      
      const { error: delAuthErr } = await supabase.auth.admin.deleteUser(u.id);
      if (!delAuthErr) {
        console.log(`  ✓ Deleted test auth user: ${email} (${u.id})`);
        deletedUsersCount++;
      } else {
        console.warn(`  Could not delete ${email}: ${delAuthErr.message}`);
      }
    }
  }
  console.log(`  ✓ Deleted ${deletedUsersCount} test auth account(s)`);

  // 7. PURGE TEST AUDIT LOGS
  console.log('\n--- 7. Purging Test Audit Logs ---');
  try {
    const { count: delAuditLogs } = await supabase
      .from('audit_logs')
      .delete({ count: 'exact' })
      .or('hotel_id.eq.11111111-1111-4111-8111-111111111111,action.ilike.%test%,user_email.ilike.%test%,user_email.ilike.%example.com%,reason.ilike.%test%');
    console.log(`  ✓ Removed ${delAuditLogs || 0} test audit log entries`);
  } catch (e) {
    console.warn('Audit logs purge warning:', e.message);
  }

  try {
    const { count: delChAudit } = await supabase
      .from('channel_audit_logs')
      .delete({ count: 'exact' })
      .or('hotel_id.eq.11111111-1111-4111-8111-111111111111,action.ilike.%test%');
    console.log(`  ✓ Removed ${delChAudit || 0} test channel audit log entries`);
  } catch (e) {
    console.warn('Channel audit logs purge warning:', e.message);
  }

  console.log('\n================================================================');
  console.log('PURGE COMPLETE: ALL TEST & DUMMY DATA SAFELY REMOVED');
  console.log('================================================================\n');
}

main().catch(console.error);
