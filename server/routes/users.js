/**
 * HOTEL MANTRI — User Management & Role-Based Access Control Routes
 * 
 * Provides:
 * - GET /api/users        — List hotel staff and user profiles with roles & permissions
 * - POST /api/users       — Create a new staff member / user (Housekeeping, Reception, Manager, Accounts, Owner)
 * - PUT /api/users/:id    — Update staff role, active status, floor, shift, permissions
 * - DELETE /api/users/:id — Deactivate/remove a user
 * 
 * Strict RBAC:
 * - Only Owner / Hotel Admin, Manager, and Super Admin can manage users.
 * - Housekeeping, Reception, and Accounts users are strictly forbidden.
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabaseServiceRole, ensureAuth } from '../supabaseClient.js';
import { requireHotelAccess as checkAuth, requireRoles, forbidRoles } from '../middleware/auth.js';

const router = express.Router();

router.use(checkAuth);

// Only Owner / Hotel Admin, Manager, and Super Admin can access user management
router.use(requireRoles(['hotel_admin', 'owner', 'manager', 'super_admin']));
router.use(forbidRoles(['housekeeping', 'reception', 'accounts']));

const getSupabaseConfig = () => {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  return { url, anonKey };
};

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
      .select('id, user_id, hotel_id, role, status, email, created_at, updated_at')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: true });

    if (adminErr) {
      console.error(`[${requestId}] Failed to fetch hotel_admins:`, adminErr);
      return res.status(500).json({ success: false, error: 'DATABASE_ERROR', message: adminErr.message });
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
      // Find matching housekeeping staff member if any
      const matchingHk = Array.from(hkMap.values()).find((h) => admin.email?.includes(h.name?.toLowerCase()));

      // Extract username from email if formatted as username@...
      let username = admin.email;
      if (admin.email && admin.email.includes('@')) {
        username = admin.email.split('@')[0];
      }

      return {
        id: admin.id,
        userId: admin.user_id,
        hotelId: admin.hotel_id,
        email: admin.email,
        username,
        role: admin.role === 'hotel_admin' ? 'Owner' : (admin.role === 'hotel_staff' ? (matchingHk ? 'Housekeeping' : 'Reception') : admin.role),
        systemRole: admin.role,
        status: admin.status || 'Active',
        name: matchingHk?.name || username,
        mobile: matchingHk?.phone || '',
        shift: 'General',
        assignedFloor: '',
        permissions: {
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
    console.error(`[${requestId}] GET /api/users exception:`, err);
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err?.message || 'Server error listing users.' });
  }
});

/**
 * POST /api/users
 * Creates a new staff member with Role, Username/Login ID, Password, and Permissions.
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
      role = 'Housekeeping',
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
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Password must be at least 6 characters.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanMobile = mobile.trim().replace(/\D/g, '');
    const normRole = role.trim().toLowerCase();

    // Determine authentication email
    let authEmail = cleanUsername;
    if (!authEmail.includes('@')) {
      const sanitizedSlug = cleanUsername.replace(/[^a-z0-9._-]/g, '');
      authEmail = `${sanitizedSlug}@hotel.hotelmantri.internal`;
    }

    const { url, anonKey } = getSupabaseConfig();
    const anonClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const userMetadata = {
      full_name: name.trim(),
      mobile: cleanMobile,
      username: cleanUsername,
      role: normRole,
      assigned_floor: assignedFloor || '',
      assigned_category_id: assignedCategoryId || '',
      shift: shift || 'General',
      can_laundry: Boolean(permissions.canLaundry),
      can_maintenance: permissions.canMaintenance !== false,
      can_approve_inspection: Boolean(permissions.canApproveInspection),
      hotel_id: hotelId,
    };

    // 1. Create auth user in Supabase Auth
    const { data: authData, error: authError } = await anonClient.auth.signUp({
      email: authEmail,
      password,
      options: {
        data: userMetadata,
      },
    });

    if (authError) {
      // If user is already registered, surface clear message
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

    // 2. Map database role for hotel_admins (constrained to 'hotel_admin' or 'hotel_staff')
    const dbRole = (normRole === 'owner' || normRole === 'hotel_admin') ? 'hotel_admin' : 'hotel_staff';

    const { error: adminInsertErr } = await supabaseServiceRole
      .from('hotel_admins')
      .upsert({
        user_id: newUserId,
        hotel_id: hotelId,
        role: dbRole,
        email: authEmail,
        status: status === 'Inactive' ? 'Inactive' : 'Active',
      }, { onConflict: 'user_id,hotel_id' });

    if (adminInsertErr) {
      console.error(`[${requestId}] hotel_admins insert failed:`, adminInsertErr);
      return res.status(500).json({
        success: false,
        error: 'DATABASE_ERROR',
        message: adminInsertErr.message,
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
        console.warn(`[${requestId}] housekeeping_staff sync non-blocking warning:`, hkErr);
      } else {
        hkStaffRecord = hkData;
      }
    }

    return res.status(201).json({
      success: true,
      message: `Staff user "${name}" successfully created with role ${role}.`,
      user: {
        userId: newUserId,
        hotelId,
        name: name.trim(),
        username: cleanUsername,
        email: authEmail,
        mobile: cleanMobile,
        role,
        shift,
        assignedFloor,
        permissions: {
          canLaundry: Boolean(permissions.canLaundry),
          canMaintenance: permissions.canMaintenance !== false,
          canApproveInspection: Boolean(permissions.canApproveInspection),
        },
        status: status || 'Active',
      },
      housekeepingStaffId: hkStaffRecord?.id || null,
      requestId,
    });
  } catch (err) {
    console.error(`[${requestId}] POST /api/users exception:`, err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err?.message || 'Server error creating user.',
      requestId,
    });
  }
});

/**
 * PUT /api/users/:id
 * Updates an existing user's status, role, floor, shift, or permissions.
 */
router.put('/:id', async (req, res) => {
  const requestId = req.requestId || 'REQ-USER-UPDATE';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const targetId = req.params.id;
    const { status, role, shift, assignedFloor, permissions, mobile, name } = req.body;

    await ensureAuth();

    // 1. Update hotel_admins status/role if target is hotel_admins record
    const updatePayload = { updated_at: new Date().toISOString() };
    if (status) updatePayload.status = status;
    if (role) {
      updatePayload.role = (role.toLowerCase() === 'owner' || role.toLowerCase() === 'hotel_admin') ? 'hotel_admin' : 'hotel_staff';
    }

    await supabaseServiceRole
      .from('hotel_admins')
      .update(updatePayload)
      .eq('hotel_id', hotelId)
      .or(`id.eq.${targetId},user_id.eq.${targetId}`);

    // 2. Also update housekeeping_staff record if matching name/mobile exists
    if (name || mobile) {
      await supabaseServiceRole
        .from('housekeeping_staff')
        .update({
          is_active: status !== 'Inactive',
          ...(name ? { name } : {}),
          ...(mobile ? { phone: mobile } : {}),
          ...(permissions?.canApproveInspection !== undefined ? { role: permissions.canApproveInspection ? 'supervisor' : 'housekeeper' } : {}),
        })
        .eq('hotel_id', hotelId)
        .or(`id.eq.${targetId},name.ilike.%${name || ''}%`);
    }

    return res.json({
      success: true,
      message: 'User updated successfully.',
      requestId,
    });
  } catch (err) {
    console.error(`[${requestId}] PUT /api/users/:id exception:`, err);
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err?.message || 'Server error updating user.' });
  }
});

/**
 * DELETE /api/users/:id
 * Deactivates user from hotel.
 */
router.delete('/:id', async (req, res) => {
  const requestId = req.requestId || 'REQ-USER-DELETE';
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const targetId = req.params.id;

    await ensureAuth();

    await supabaseServiceRole
      .from('hotel_admins')
      .update({ status: 'Inactive', updated_at: new Date().toISOString() })
      .eq('hotel_id', hotelId)
      .or(`id.eq.${targetId},user_id.eq.${targetId}`);

    return res.json({
      success: true,
      message: 'User deactivated successfully.',
      requestId,
    });
  } catch (err) {
    console.error(`[${requestId}] DELETE /api/users/:id exception:`, err);
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err?.message || 'Server error deactivating user.' });
  }
});

export default router;
