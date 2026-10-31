/**
 * HOTEL MANTRI — User Management & Role-Based Access Control Routes
 * 
 * Provides:
 * - GET /api/users        — List hotel staff and user profiles with authoritative roles & permissions
 * - POST /api/users       — Create a new staff member / user
 * - PUT /api/users/:id    — Update staff role, active status, floor, shift, permissions (Injection-proof)
 * - DELETE /api/users/:id — Deactivate a user
 * 
 * Strict Security Rules (C2, H4):
 * - Passwords require ≥ 12 characters and reject common weak passwords (M5).
 * - Roles validated against strict allowlist: hotel_admin, manager, reception, accounts, housekeeping.
 * - Managers cannot create or assign hotel_admin roles.
 * - Role & permissions written to hotel_admins and app_metadata, NEVER user_metadata.
 * - Target UUID validated strictly; no filter injection; verify tenant isolation before mutation.
 * - Self-demotion/deactivation blocked; last remaining hotel_admin cannot be removed.
 */

import express from 'express';
import { supabaseServiceRole, ensureAuth } from '../supabaseClient.js';
import { requireHotelAccess as checkAuth, requireRoles, forbidRoles, clearUserAuthCache } from '../middleware/auth.js';

const router = express.Router();

router.use(checkAuth);

// Only Owner / Hotel Admin, Manager, and Super Admin can access user management
router.use(requireRoles(['hotel_admin', 'owner', 'manager', 'super_admin']));
router.use(forbidRoles(['housekeeping', 'reception', 'accounts']));

const ALLOWED_STAFF_ROLES = ['hotel_admin', 'manager', 'reception', 'accounts', 'housekeeping'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMMON_PASSWORDS = [
  'password1234',
  'password12345',
  'admin12345678',
  'hotel12345678',
  'welcome123456',
  '123456789012',
  'qwertyuiop12',
  'hotelmantri123',
];

/**
 * GET /api/users
 * Returns all active and inactive users/staff for the authorized hotel property.
 */
router.get('/', async (req, res) => {
  const requestId = req.requestId || 'REQ-USERS-LIST';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    if (!hotelId) {
      return res.status(400).json({ success: false, error: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.' });
    }

    await ensureAuth();

    // 1. Fetch hotel_admins records
    const { data: admins, error: adminErr } = await supabaseServiceRole
      .from('hotel_admins')
      .select('id, user_id, hotel_id, role, staff_role, permissions, status, email, created_at, updated_at')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: true });

    if (adminErr) {
      console.error(`[${requestId}] Failed to fetch hotel_admins:`, adminErr.message);
      return res.status(500).json({ success: false, error: 'DATABASE_ERROR', message: 'Failed to retrieve staff records.' });
    }

    // 2. Fetch housekeeping_staff records to cross-reference
    const { data: hkStaff } = await supabaseServiceRole
      .from('housekeeping_staff')
      .select('id, name, phone, role, is_active, created_at')
      .eq('hotel_id', hotelId);

    const hkMap = new Map();
    (hkStaff || []).forEach((h) => {
      if (h.phone) hkMap.set(h.phone.replace(/\D/g, ''), h);
      if (h.name) hkMap.set(h.name.toLowerCase().trim(), h);
    });

    // 3. Map user profiles
    const users = (admins || []).map((admin) => {
      const matchingHk = Array.from(hkMap.values()).find((h) => admin.email?.includes(h.name?.toLowerCase()));

      let username = admin.email;
      if (admin.email && admin.email.includes('@')) {
        username = admin.email.split('@')[0];
      }

      const rawRole = admin.staff_role || (admin.role === 'hotel_admin' ? 'hotel_admin' : 'reception');
      const normalizedRole = ALLOWED_STAFF_ROLES.includes(rawRole) ? rawRole : 'reception';
      const displayRole = normalizedRole === 'hotel_admin' ? 'Owner' : normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1);

      return {
        id: admin.id,
        userId: admin.user_id,
        hotelId: admin.hotel_id,
        email: admin.email,
        username,
        role: displayRole,
        systemRole: normalizedRole,
        status: admin.status || 'Active',
        name: matchingHk?.name || username,
        mobile: matchingHk?.phone || '',
        shift: admin.permissions?.shift || 'General',
        assignedFloor: admin.permissions?.assignedFloor || '',
        permissions: admin.permissions || {
          canLaundry: false,
          canMaintenance: true,
          canApproveInspection: matchingHk?.role === 'supervisor',
        },
        createdAt: admin.created_at,
      };
    });

    // Also include any housekeeping_staff members who may not have a login account yet
    const existingMobiles = new Set(users.map((u) => u.mobile.replace(/\D/g, '')).filter(Boolean));
    const hkOnly = (hkStaff || []).filter((h) => {
      const cleanPhone = (h.phone || '').replace(/\D/g, '');
      return cleanPhone && !existingMobiles.has(cleanPhone);
    }).map((h) => ({
      id: h.id,
      userId: null,
      hotelId,
      email: '',
      username: h.name.toLowerCase().replace(/\s+/g, '_'),
      role: 'Housekeeping',
      systemRole: 'housekeeping',
      status: h.is_active ? 'Active' : 'Inactive',
      name: h.name,
      mobile: h.phone,
      shift: 'General',
      assignedFloor: '',
      permissions: {
        canLaundry: false,
        canMaintenance: true,
        canApproveInspection: h.role === 'supervisor',
      },
      createdAt: h.created_at,
    }));

    return res.json({
      success: true,
      users: [...users, ...hkOnly],
      total: users.length + hkOnly.length,
      requestId,
    });
  } catch (err) {
    console.error(`[${requestId}] GET /api/users exception:`, err.message);
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Server error listing users.' });
  }
});

/**
 * POST /api/users
 * Creates a new staff member with Role, Login ID, Password, and Permissions.
 */
router.post('/', async (req, res) => {
  const requestId = req.requestId || 'REQ-USER-CREATE';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    if (!hotelId) {
      return res.status(400).json({ success: false, error: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.' });
    }

    const {
      name,
      mobile = '',
      username,
      password,
      role = 'housekeeping',
      assignedFloor = '',
      assignedCategoryId = '',
      shift = 'General',
      status = 'Active',
      permissions = {},
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Staff Name is required.' });
    }
    if (!username?.trim()) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Username / Login ID is required.' });
    }

    // M5: Enforce password length ≥ 12 characters and deny common passwords
    if (!password || password.length < 12) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: 'Password must be at least 12 characters long.',
      });
    }

    if (COMMON_PASSWORDS.includes(password.toLowerCase().trim())) {
      return res.status(400).json({
        success: false,
        error: 'COMMON_PASSWORD',
        message: 'Password is too common or easily guessable. Please choose a stronger password.',
      });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanMobile = mobile.trim().replace(/\D/g, '');
    let normRole = role.trim().toLowerCase();
    if (normRole === 'owner') normRole = 'hotel_admin';

    // C2: Strict Role Allowlist Validation
    if (!ALLOWED_STAFF_ROLES.includes(normRole)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ROLE',
        message: `Role must be one of: ${ALLOWED_STAFF_ROLES.join(', ')}.`,
      });
    }

    // super_admin cannot be assigned via users API
    if (normRole === 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'ROLE_FORBIDDEN',
        message: 'super_admin role can only be granted via super admin setup.',
      });
    }

    // A manager must not be able to create a hotel_admin
    const callerRole = (req.userRole || req.auth?.role || '').toLowerCase();
    if (callerRole === 'manager' && normRole === 'hotel_admin') {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Managers are not permitted to create hotel administrators.',
      });
    }

    // Determine authentication email
    let authEmail = cleanUsername;
    if (!authEmail.includes('@')) {
      const sanitizedSlug = cleanUsername.replace(/[^a-z0-9._-]/g, '');
      authEmail = `${sanitizedSlug}@hotel.hotelmantri.internal`;
    }

    const staffPermissions = {
      canLaundry: Boolean(permissions.canLaundry),
      canMaintenance: permissions.canMaintenance !== false,
      canApproveInspection: Boolean(permissions.canApproveInspection),
      assignedFloor: assignedFloor || '',
      assignedCategoryId: assignedCategoryId || '',
      shift: shift || 'General',
    };

    // 1. Create auth user in Supabase Auth via Admin API
    // Roles & permissions placed into app_metadata (protected from client tampering)
    const { data: authData, error: authError } = await supabaseServiceRole.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      app_metadata: {
        role: normRole,
        permissions: staffPermissions,
        hotel_id: hotelId,
      },
      user_metadata: {
        full_name: name.trim(),
        mobile: cleanMobile,
        username: cleanUsername,
      },
    });

    if (authError) {
      if (authError.message?.toLowerCase().includes('already registered')) {
        return res.status(409).json({
          success: false,
          error: 'USER_EXISTS',
          message: `Username or Login ID "${username}" is already taken. Please choose another username.`,
          requestId,
        });
      }
      return res.status(400).json({
        success: false,
        error: 'AUTH_ERROR',
        message: authError.message || 'Failed to create user login credentials.',
        requestId,
      });
    }

    const newUserId = authData.user?.id;
    if (!newUserId) {
      return res.status(500).json({
        success: false,
        error: 'AUTH_CREATION_FAILED',
        message: 'Could not resolve created user ID.',
        requestId,
      });
    }

    await ensureAuth();

    // 2. Persist authoritative role and permissions in hotel_admins
    const dbRole = normRole === 'hotel_admin' ? 'hotel_admin' : 'hotel_staff';

    const { error: adminInsertErr } = await supabaseServiceRole
      .from('hotel_admins')
      .upsert({
        user_id: newUserId,
        hotel_id: hotelId,
        role: dbRole,
        staff_role: normRole,
        permissions: staffPermissions,
        email: authEmail,
        status: status === 'Inactive' ? 'Inactive' : 'Active',
      }, { onConflict: 'user_id,hotel_id' });

    if (adminInsertErr) {
      console.error(`[${requestId}] hotel_admins insert failed:`, adminInsertErr.message);
      return res.status(500).json({
        success: false,
        error: 'DATABASE_ERROR',
        message: 'Failed to record staff profile in database.',
        requestId,
      });
    }

    // 3. If role is Housekeeping, also link to housekeeping_staff table
    let hkStaffRecord = null;
    if (normRole === 'housekeeping') {
      const { data: hkData, error: hkErr } = await supabaseServiceRole
        .from('housekeeping_staff')
        .insert({
          hotel_id: hotelId,
          name: name.trim(),
          phone: cleanMobile,
          role: permissions.canApproveInspection ? 'supervisor' : 'housekeeper',
          is_active: status !== 'Inactive',
        })
        .select()
        .single();

      if (hkErr) {
        console.warn(`[${requestId}] housekeeping_staff sync notice:`, hkErr.message);
      } else {
        hkStaffRecord = hkData;
      }
    }

    clearUserAuthCache(newUserId);

    return res.status(201).json({
      success: true,
      message: `Staff user "${name}" successfully created with role ${normRole}.`,
      user: {
        userId: newUserId,
        hotelId,
        name: name.trim(),
        username: cleanUsername,
        email: authEmail,
        mobile: cleanMobile,
        role: normRole,
        shift,
        assignedFloor,
        permissions: staffPermissions,
        status: status || 'Active',
      },
      housekeepingStaffId: hkStaffRecord?.id || null,
      requestId,
    });
  } catch (err) {
    console.error(`[${requestId}] POST /api/users exception:`, err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Server error creating user.',
      requestId,
    });
  }
});

/**
 * PUT /api/users/:id
 * Updates an existing user's status, role, floor, shift, or permissions.
 * Injection-proof parameterization and strict multi-tenant validation (H4).
 */
router.put('/:id', async (req, res) => {
  const requestId = req.requestId || 'REQ-USER-UPDATE';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const targetId = req.params.id;

    // H4: Strictly validate UUID format
    if (!targetId || !UUID_REGEX.test(targetId)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: 'User ID must be a valid UUID.',
      });
    }

    const { status, role, shift, assignedFloor, permissions, mobile, name } = req.body;
    await ensureAuth();

    // 1. Verify target user exists and strictly belongs to caller's hotel
    let targetAdmin = null;
    const { data: adminById } = await supabaseServiceRole
      .from('hotel_admins')
      .select('id, user_id, hotel_id, role, staff_role, permissions, status')
      .eq('hotel_id', hotelId)
      .eq('id', targetId)
      .maybeSingle();

    if (adminById) {
      targetAdmin = adminById;
    } else {
      const { data: adminByUserId } = await supabaseServiceRole
        .from('hotel_admins')
        .select('id, user_id, hotel_id, role, staff_role, permissions, status')
        .eq('hotel_id', hotelId)
        .eq('user_id', targetId)
        .maybeSingle();
      targetAdmin = adminByUserId;
    }

    // Check housekeeping_staff if not found in hotel_admins
    let targetHkStaff = null;
    if (!targetAdmin) {
      const { data: hkRecord } = await supabaseServiceRole
        .from('housekeeping_staff')
        .select('id, hotel_id, name, is_active')
        .eq('hotel_id', hotelId)
        .eq('id', targetId)
        .maybeSingle();
      targetHkStaff = hkRecord;
    }

    if (!targetAdmin && !targetHkStaff) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'The requested staff member was not found in your hotel property.',
      });
    }

    // H4: Prevent a user from deactivating or demoting themselves
    const currentUserId = req.user?.id || req.auth?.userId;
    if (targetAdmin && currentUserId === targetAdmin.user_id) {
      if (status === 'Inactive') {
        return res.status(403).json({
          success: false,
          error: 'SELF_DEACTIVATION_DENIED',
          message: 'You cannot deactivate your own account.',
        });
      }
      if (role && (role.toLowerCase() !== 'hotel_admin' && role.toLowerCase() !== 'owner') && (targetAdmin.staff_role === 'hotel_admin' || targetAdmin.role === 'hotel_admin')) {
        return res.status(403).json({
          success: false,
          error: 'SELF_DEMOTION_DENIED',
          message: 'You cannot demote your own administrator privileges.',
        });
      }
    }

    // H4: Prevent deactivating or demoting the last remaining hotel_admin
    const isTargetAdmin = targetAdmin && (targetAdmin.staff_role === 'hotel_admin' || targetAdmin.role === 'hotel_admin');
    const isRemovingAdmin = (status === 'Inactive') || (role && role.toLowerCase() !== 'hotel_admin' && role.toLowerCase() !== 'owner');

    if (isTargetAdmin && isRemovingAdmin) {
      const { count: activeAdminCount } = await supabaseServiceRole
        .from('hotel_admins')
        .select('id', { count: 'exact', head: true })
        .eq('hotel_id', hotelId)
        .eq('status', 'Active')
        .or('role.eq.hotel_admin,staff_role.eq.hotel_admin');

      if ((activeAdminCount || 0) <= 1) {
        return res.status(400).json({
          success: false,
          error: 'LAST_ADMIN_PROTECTED',
          message: 'Cannot deactivate or demote the last remaining hotel administrator.',
        });
      }
    }

    // C2: Role validation if role is being updated
    let normalizedRole = undefined;
    if (role) {
      let r = role.trim().toLowerCase();
      if (r === 'owner') r = 'hotel_admin';
      if (!ALLOWED_STAFF_ROLES.includes(r)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_ROLE',
          message: `Role must be one of: ${ALLOWED_STAFF_ROLES.join(', ')}.`,
        });
      }
      const callerRole = (req.userRole || req.auth?.role || '').toLowerCase();
      if (callerRole === 'manager' && r === 'hotel_admin') {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Managers are not permitted to assign hotel_admin role.',
        });
      }
      normalizedRole = r;
    }

    // Build update payload
    const now = new Date().toISOString();
    const updatePayload = { updated_at: now };
    if (status) updatePayload.status = status;
    if (normalizedRole) {
      updatePayload.staff_role = normalizedRole;
      updatePayload.role = normalizedRole === 'hotel_admin' ? 'hotel_admin' : 'hotel_staff';
    }
    if (permissions) {
      updatePayload.permissions = {
        ...(targetAdmin?.permissions || {}),
        ...permissions,
        ...(shift ? { shift } : {}),
        ...(assignedFloor ? { assignedFloor } : {}),
      };
    }

    if (targetAdmin) {
      // 1. Update hotel_admins table using exact primary key
      await supabaseServiceRole
        .from('hotel_admins')
        .update(updatePayload)
        .eq('hotel_id', hotelId)
        .eq('id', targetAdmin.id);

      // 2. Also update app_metadata in Supabase Auth if target has a user_id
      if (targetAdmin.user_id) {
        try {
          await supabaseServiceRole.auth.admin.updateUserById(targetAdmin.user_id, {
            app_metadata: {
              ...(normalizedRole ? { role: normalizedRole } : {}),
              ...(permissions ? { permissions: updatePayload.permissions } : {}),
              hotel_id: hotelId,
            },
          });
        } catch (authUpdateErr) {
          console.warn(`[${requestId}] Auth app_metadata update notice:`, authUpdateErr.message);
        }
        clearUserAuthCache(targetAdmin.user_id);
      }
    }

    // 3. Update housekeeping_staff strictly by UUID key
    if (targetHkStaff) {
      await supabaseServiceRole
        .from('housekeeping_staff')
        .update({
          is_active: status !== 'Inactive',
          ...(name ? { name: name.trim() } : {}),
          ...(mobile ? { phone: mobile.trim() } : {}),
          ...(permissions?.canApproveInspection !== undefined ? { role: permissions.canApproveInspection ? 'supervisor' : 'housekeeper' } : {}),
        })
        .eq('hotel_id', hotelId)
        .eq('id', targetHkStaff.id);
    } else if (targetAdmin && (name || mobile)) {
      // Require valid phone digits (>= 10) to prevent empty-phone mass updates
      const adminPhone = (targetAdmin.email || '').replace(/\D/g, '');
      if (adminPhone && adminPhone.length >= 10) {
        await supabaseServiceRole
          .from('housekeeping_staff')
          .update({
            is_active: status !== 'Inactive',
            ...(name ? { name: name.trim() } : {}),
            ...(mobile ? { phone: mobile.trim() } : {}),
          })
          .eq('hotel_id', hotelId)
          .eq('phone', adminPhone);
      }
    }

    return res.json({
      success: true,
      message: 'User updated successfully.',
      requestId,
    });
  } catch (err) {
    console.error(`[${requestId}] PUT /api/users/:id exception:`, err.message);
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Server error updating user.' });
  }
});

/**
 * DELETE /api/users/:id
 * Deactivates user from hotel with strict tenant isolation and admin protection.
 */
router.delete('/:id', async (req, res) => {
  const requestId = req.requestId || 'REQ-USER-DELETE';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const targetId = req.params.id;

    if (!targetId || !UUID_REGEX.test(targetId)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: 'User ID must be a valid UUID.',
      });
    }

    await ensureAuth();

    // Verify target belongs to caller's hotel
    let targetAdmin = null;
    const { data: adminById } = await supabaseServiceRole
      .from('hotel_admins')
      .select('id, user_id, hotel_id, role, staff_role')
      .eq('hotel_id', hotelId)
      .eq('id', targetId)
      .maybeSingle();

    if (adminById) {
      targetAdmin = adminById;
    } else {
      const { data: adminByUserId } = await supabaseServiceRole
        .from('hotel_admins')
        .select('id, user_id, hotel_id, role, staff_role')
        .eq('hotel_id', hotelId)
        .eq('user_id', targetId)
        .maybeSingle();
      targetAdmin = adminByUserId;
    }

    if (!targetAdmin) {
      // Check housekeeping_staff
      const { data: hkRecord } = await supabaseServiceRole
        .from('housekeeping_staff')
        .select('id, hotel_id')
        .eq('hotel_id', hotelId)
        .eq('id', targetId)
        .maybeSingle();

      if (hkRecord) {
        await supabaseServiceRole
          .from('housekeeping_staff')
          .update({ is_active: false })
          .eq('hotel_id', hotelId)
          .eq('id', hkRecord.id);

        return res.json({
          success: true,
          message: 'Staff member deactivated successfully.',
          requestId,
        });
      }

      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'The requested staff member was not found.',
      });
    }

    // Prevent self-deactivation
    const currentUserId = req.user?.id || req.auth?.userId;
    if (currentUserId === targetAdmin.user_id) {
      return res.status(403).json({
        success: false,
        error: 'SELF_DEACTIVATION_DENIED',
        message: 'You cannot deactivate your own account.',
      });
    }

    // Prevent removing the last hotel_admin
    const isTargetAdmin = targetAdmin.staff_role === 'hotel_admin' || targetAdmin.role === 'hotel_admin';
    if (isTargetAdmin) {
      const { count: activeAdminCount } = await supabaseServiceRole
        .from('hotel_admins')
        .select('id', { count: 'exact', head: true })
        .eq('hotel_id', hotelId)
        .eq('status', 'Active')
        .or('role.eq.hotel_admin,staff_role.eq.hotel_admin');

      if ((activeAdminCount || 0) <= 1) {
        return res.status(400).json({
          success: false,
          error: 'LAST_ADMIN_PROTECTED',
          message: 'Cannot deactivate the last remaining hotel administrator.',
        });
      }
    }

    await supabaseServiceRole
      .from('hotel_admins')
      .update({ status: 'Inactive', updated_at: new Date().toISOString() })
      .eq('hotel_id', hotelId)
      .eq('id', targetAdmin.id);

    if (targetAdmin.user_id) {
      clearUserAuthCache(targetAdmin.user_id);
    }

    return res.json({
      success: true,
      message: 'User deactivated successfully.',
      requestId,
    });
  } catch (err) {
    console.error(`[${requestId}] DELETE /api/users/:id exception:`, err.message);
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Server error deactivating user.' });
  }
});

export default router;
