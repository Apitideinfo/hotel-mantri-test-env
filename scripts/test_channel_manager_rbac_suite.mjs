import dotenv from 'dotenv';
import http from 'http';
import app from '../server/index.js';
import { supabaseServiceRole, ensureAuth } from '../server/supabaseClient.js';
import { setHotelResolverForTesting } from '../server/middleware/auth.js';

dotenv.config();

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function request(baseUrl, method, path, body, headers = {}) {
  const url = new URL(path, baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('\n=============================================================================');
  console.log('HOTEL MANTRI — CHANNEL MANAGER RBAC & SUPER ADMIN SEPARATION SUITE');
  console.log('=============================================================================\n');

  await ensureAuth();

  // Start internal test server
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test API server listening on ${baseUrl}\n`);

  let hotelA = null;
  let hotelB = null;
  let channelA = null;
  let originalSettings = null;
  let originalChannelState = null;

  try {
    // 1. Fetch two valid hotel records from DB to test multi-tenancy & cross-hotel isolation
    const { data: hotels, error: hotelsErr } = await supabaseServiceRole
      .from('hotels')
      .select('id, hotel_name')
      .limit(2);

    if (hotelsErr || !hotels || hotels.length < 2) {
      throw new Error(`Need at least 2 hotels in database to test isolation. Found: ${hotels?.length || 0}`);
    }

    hotelA = hotels[0];
    hotelB = hotels[1];
    console.log(`Hotel A (Target): ${hotelA.hotel_name} (${hotelA.id})`);
    console.log(`Hotel B (Foreign): ${hotelB.hotel_name} (${hotelB.id})\n`);

    // Fetch room category for Hotel A and Hotel B
    const { data: catA } = await supabaseServiceRole
      .from('room_categories')
      .select('id, name')
      .eq('hotel_id', hotelA.id)
      .limit(1)
      .maybeSingle();

    const { data: catB } = await supabaseServiceRole
      .from('room_categories')
      .select('id, name')
      .eq('hotel_id', hotelB.id)
      .limit(1)
      .maybeSingle();

    // Ensure a test channel exists for Hotel A
    const { data: existingChannel } = await supabaseServiceRole
      .from('channel_connections')
      .select('*')
      .eq('hotel_id', hotelA.id)
      .limit(1)
      .maybeSingle();

    channelA = existingChannel;
    if (!channelA) {
      const { data: newCh } = await supabaseServiceRole
        .from('channel_connections')
        .insert({
          hotel_id: hotelA.id,
          channel_type: 'makemytrip',
          channel_name: 'MakeMyTrip Test',
          status: 'connected',
          is_enabled: true
        })
        .select()
        .single();
      channelA = newCh;
    }

    // Snapshot original channel settings and channel status to restore after test
    const { data: settingsData } = await supabaseServiceRole
      .from('channel_settings')
      .select('*')
      .eq('hotel_id', hotelA.id)
      .maybeSingle();
    originalSettings = settingsData;

    originalChannelState = {
      is_enabled: channelA?.is_enabled ?? true,
      channel_name: channelA?.channel_name || channelA?.display_name || 'MakeMyTrip Test'
    };

    // ─────────────────────────────────────────────────────────────────────────
    // TEST SECTION 1: Hotel Owner Restrictions (Mutations Forbidden - 403)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('--- SECTION 1: Hotel Owner Mutation Restrictions (RBAC 403) ---');

    // Configure test resolver to simulate Hotel Owner for Hotel A
    setHotelResolverForTesting((req) => ({
      success: true,
      userId: 'test-owner-id',
      hotelId: hotelA.id,
      role: 'owner',
      isSuperAdmin: false,
      hotel: hotelA,
      scopedSupabase: supabaseServiceRole
    }));

    // 1. Owner attempts to add a channel
    const addChOwner = await request(baseUrl, 'POST', '/api/channels', {
      channelType: 'agoda',
      displayName: 'Agoda Direct'
    });
    assert(
      addChOwner.status === 403 && (addChOwner.body?.code === 'ROLE_FORBIDDEN' || addChOwner.body?.error === 'ACCESS_DENIED'),
      `Owner POST /api/channels is blocked with 403 (Status: ${addChOwner.status}, Code: ${addChOwner.body?.code})`
    );

    // 2. Owner attempts to patch channel (e.g. enable/disable or change property code)
    const patchChOwner = await request(baseUrl, 'PATCH', `/api/channels/${channelA.id}`, {
      isEnabled: false
    });
    assert(
      patchChOwner.status === 403 && (patchChOwner.body?.code === 'ROLE_FORBIDDEN' || patchChOwner.body?.error === 'ACCESS_DENIED'),
      `Owner PATCH /api/channels/:id is blocked with 403 (Status: ${patchChOwner.status}, Code: ${patchChOwner.body?.code})`
    );

    // 3. Owner attempts to delete channel
    const delChOwner = await request(baseUrl, 'DELETE', `/api/channels/${channelA.id}`);
    assert(
      delChOwner.status === 403 && (delChOwner.body?.code === 'ROLE_FORBIDDEN' || delChOwner.body?.error === 'ACCESS_DENIED'),
      `Owner DELETE /api/channels/:id is blocked with 403 (Status: ${delChOwner.status}, Code: ${delChOwner.body?.code})`
    );

    // 4. Owner attempts to modify mappings
    const mapChOwner = await request(baseUrl, 'POST', `/api/channels/${channelA.id}/mappings`, {
      mappings: [{ room_category_id: catA?.id, channel_room_code: 'TEST_ROOM' }]
    });
    assert(
      mapChOwner.status === 403 && (mapChOwner.body?.code === 'ROLE_FORBIDDEN' || mapChOwner.body?.error === 'ACCESS_DENIED'),
      `Owner POST /api/channels/:id/mappings is blocked with 403 (Status: ${mapChOwner.status}, Code: ${mapChOwner.body?.code})`
    );

    // 5. Owner attempts to change master channel settings / hotel code
    const settingsOwner = await request(baseUrl, 'POST', '/api/channels/settings', {
      aiosell_hotel_code: 'ATTEMPT_CODE'
    });
    assert(
      settingsOwner.status === 403 && (settingsOwner.body?.code === 'ROLE_FORBIDDEN' || settingsOwner.body?.error === 'ACCESS_DENIED'),
      `Owner POST /api/channels/settings is blocked with 403 (Status: ${settingsOwner.status}, Code: ${settingsOwner.body?.code})`
    );

    // 6. Owner attempts to run connection test
    const testConnOwner = await request(baseUrl, 'POST', '/api/channels/test-connection', {});
    assert(
      testConnOwner.status === 403 && (testConnOwner.body?.code === 'ROLE_FORBIDDEN' || testConnOwner.body?.error === 'ACCESS_DENIED'),
      `Owner POST /api/channels/test-connection is blocked with 403 (Status: ${testConnOwner.status})`
    );

    // 7. Owner attempts to view audit history
    const auditOwner = await request(baseUrl, 'GET', '/api/channels/audit-history');
    assert(
      auditOwner.status === 403 && (auditOwner.body?.code === 'ROLE_FORBIDDEN' || auditOwner.body?.error === 'ACCESS_DENIED'),
      `Owner GET /api/channels/audit-history is blocked with 403 (Status: ${auditOwner.status})`
    );

    // ─────────────────────────────────────────────────────────────────────────
    // TEST SECTION 2: Hotel Owner Authorized Read & Sync Operations (200 OK)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 2: Hotel Owner Authorized Operations ---');

    // 8. Owner can list their hotel's channels
    const listOwner = await request(baseUrl, 'GET', '/api/channels');
    assert(
      listOwner.status === 200 && Array.isArray(listOwner.body?.channels || listOwner.body),
      `Owner GET /api/channels returns 200 OK (Found: ${(listOwner.body?.channels || listOwner.body)?.length || 0} channels)`
    );

    // 9. Owner can read sanitized settings (no secrets)
    const getSettingsOwner = await request(baseUrl, 'GET', '/api/channels/settings');
    assert(
      getSettingsOwner.status === 200 && !getSettingsOwner.body?.settings?.api_key,
      `Owner GET /api/channels/settings returns 200 OK with sanitized credentials`
    );

    // 10. Owner can check mapping validation
    const valOwner = await request(baseUrl, 'GET', `/api/channels/${channelA.id}/mapping-validation`);
    assert(
      valOwner.status === 200 && typeof valOwner.body?.canPush === 'boolean',
      `Owner GET /api/channels/:id/mapping-validation returns 200 OK with validation summary`
    );

    // 11. Owner can fetch sync logs
    const logsOwner = await request(baseUrl, 'GET', '/api/channels/sync/logs');
    assert(
      logsOwner.status === 200 && Array.isArray(logsOwner.body?.logs),
      `Owner GET /api/channels/sync/logs returns 200 OK with paginated logs`
    );

    // 12. Owner Rate Push endpoint is accessible
    const ratePushOwner = await request(baseUrl, 'POST', '/api/channels/sync/rates', {
      startDate: '2026-10-20',
      endDate: '2026-10-22',
      channelIds: [channelA.id]
    });
    // Can return 200 or 422 if unmapped, but must NOT return 403 Forbidden
    assert(
      ratePushOwner.status === 200 || ratePushOwner.status === 422,
      `Owner POST /api/channels/sync/rates is authorized (Status: ${ratePushOwner.status})`
    );

    // 13. Owner Inventory Push endpoint is accessible
    const invPushOwner = await request(baseUrl, 'POST', '/api/channels/sync/inventory', {
      startDate: '2026-10-20',
      endDate: '2026-10-22',
      channelIds: [channelA.id]
    });
    assert(
      invPushOwner.status === 200 || invPushOwner.status === 422,
      `Owner POST /api/channels/sync/inventory is authorized (Status: ${invPushOwner.status})`
    );

    // ─────────────────────────────────────────────────────────────────────────
    // TEST SECTION 3: Super Admin Central Configuration (200 OK & Auditing)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 3: Super Admin Central Management & Audit Logging ---');

    // Configure test resolver to simulate Super Admin
    setHotelResolverForTesting((req) => ({
      success: true,
      userId: 'test-super-admin-id',
      hotelId: hotelA.id,
      role: 'super_admin',
      isSuperAdmin: true,
      hotel: hotelA,
      scopedSupabase: supabaseServiceRole
    }));

    // 14. Super Admin can save master property code
    const testHotelCode = `TEST_CODE_${Date.now()}`;
    const saveSettingsAdmin = await request(baseUrl, 'POST', '/api/channels/settings', {
      aiosell_hotel_code: testHotelCode,
      aiosell_partner_id: 'PARTNER_1',
      environment: 'production'
    });
    assert(
      saveSettingsAdmin.status === 200 && saveSettingsAdmin.body?.success,
      `Super Admin POST /api/channels/settings saves property code (Status: ${saveSettingsAdmin.status})`
    );

    // 15. Super Admin can update channel enable/disable toggle
    const toggleAdmin = await request(baseUrl, 'PATCH', `/api/channels/${channelA.id}`, {
      isEnabled: true,
      displayName: 'MakeMyTrip Master'
    });
    assert(
      toggleAdmin.status === 200 && toggleAdmin.body?.success,
      `Super Admin PATCH /api/channels/:id updates channel status (Status: ${toggleAdmin.status})`
    );

    // 16. Super Admin can view audit history
    const auditAdmin = await request(baseUrl, 'GET', '/api/channels/audit-history');
    assert(
      auditAdmin.status === 200 && Array.isArray(auditAdmin.body?.logs),
      `Super Admin GET /api/channels/audit-history returns audit records (Total: ${auditAdmin.body?.logs?.length || 0})`
    );

    // ─────────────────────────────────────────────────────────────────────────
    // TEST SECTION 4: Cross-Hotel Security & Mapping Validation
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 4: Cross-Hotel Security Validation ---');

    if (catB) {
      // 17. Attempt to map Hotel B's category into Hotel A's channel
      const crossMapAttempt = await request(baseUrl, 'POST', `/api/channels/${channelA.id}/mappings`, {
        mappings: [
          {
            room_category_id: catB.id, // Belongs to Hotel B!
            channel_room_code: 'CROSS_HOTEL_EXPLOIT',
            status: 'mapped'
          }
        ]
      });

      assert(
        crossMapAttempt.status === 400 && crossMapAttempt.body?.code === 'INVALID_CROSS_HOTEL_ENTITY',
        `Cross-hotel entity mapping attempt is strictly rejected with 400 INVALID_CROSS_HOTEL_ENTITY (Status: ${crossMapAttempt.status})`
      );
    } else {
      console.log('  ⚠ Skipped catB check: no second category found');
    }

    // 18. Valid mapping for Hotel A's own category succeeds
    if (catA) {
      const validMap = await request(baseUrl, 'POST', `/api/channels/${channelA.id}/mappings`, {
        mappings: [
          {
            room_category_id: catA.id,
            channel_room_code: 'DELUXE_KG',
            channel_room_name: 'Deluxe Room',
            status: 'mapped'
          }
        ]
      });

      assert(
        validMap.status === 200 && validMap.body?.success,
        `Valid intra-hotel mapping for Hotel A succeeds with 200 OK (Status: ${validMap.status})`
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=============================================================================');
    console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('=============================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    setHotelResolverForTesting(null);
    server.close();

    try {
      // 1. Clean up test mapping if created
      if (channelA) {
        await supabaseServiceRole
          .from('channel_room_mappings')
          .delete()
          .eq('channel_id', channelA.id)
          .eq('channel_room_code', 'DELUXE_KG');

        // 2. Restore channel_connections state
        if (originalChannelState) {
          await supabaseServiceRole
            .from('channel_connections')
            .update({
              is_enabled: originalChannelState.is_enabled,
              channel_name: originalChannelState.channel_name
            })
            .eq('id', channelA.id);
        }
      }

      // 3. Restore channel_settings to original state or delete test code
      if (hotelA) {
        if (originalSettings) {
          await supabaseServiceRole
            .from('channel_settings')
            .update({
              aiosell_hotel_code: originalSettings.aiosell_hotel_code,
              aiosell_partner_id: originalSettings.aiosell_partner_id,
              environment: originalSettings.environment
            })
            .eq('hotel_id', hotelA.id);
        } else {
          await supabaseServiceRole
            .from('channel_settings')
            .delete()
            .eq('hotel_id', hotelA.id)
            .like('aiosell_hotel_code', 'TEST_CODE_%');
        }
      }
    } catch (cleanupErr) {
      console.warn('  ⚠️ Note: channel cleanup warning:', cleanupErr?.message);
    }
  }
}

run();
