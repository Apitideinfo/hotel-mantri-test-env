import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const getSupabaseConfig = () => {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  return { url, anonKey };
};

/**
 * Resolves the authenticated user and their authorized hotel context.
 * Strictly verifies role permissions and rejects unauthorized cross-hotel requests.
 * 
 * Rules:
 * 1. Requires valid Supabase JWT authentication.
 * 2. Super Admin can select and switch between authorized properties.
 * 3. Hotel Owner / Admin / Staff is strictly bound to ONE authorized hotel resolved
 *    from the database. Client-supplied hotel IDs cannot override authorization.
 *    Any mismatch is immediately rejected with 403 HOTEL_ACCESS_DENIED.
 */

/**
 * Constant-time string comparison to prevent timing attacks against secret tokens (SEC-09).
 * Pre-hashes inputs using SHA-256 so buffers are strictly uniform in length (32 bytes),
 * completely avoiding RangeError while neutralizing length-based timing leaks.
 */
export const timingSafeSecretEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!a || !b) return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
};

// In-memory cache for validated auth contexts (TTL: 15s per L1)
const authContextCache = new Map();
const AUTH_CACHE_TTL_MS = 15 * 1000;

export const clearUserAuthCache = (userId) => {
  if (!userId) return;
  for (const [k, v] of authContextCache.entries()) {
    if (v.context?.userId === userId) {
      authContextCache.delete(k);
    }
  }
};

export const clearAuthCache = () => {
  authContextCache.clear();
};

let customHotelResolver = null;

export const setHotelResolverForTesting = (resolverFn) => {
  customHotelResolver = resolverFn;
};

export const resolveAuthorizedHotel = async (req) => {
  if (customHotelResolver) {
    return customHotelResolver(req);
  }

  if (req.user && req.auth?.hotelId) {
    return {
      success: true,
      user: req.user,
      userId: req.user.id || req.auth.userId,
      hotelId: req.auth.hotelId,
      role: req.userRole || req.auth.role || 'hotel_admin',
      isSuperAdmin: Boolean(req.auth.isSuperAdmin),
      hotel: req.hotel || { id: req.auth.hotelId },
      scopedSupabase: req.scopedSupabase,
    };
  }

  // M3: Internal server-to-server call with dedicated INTERNAL_API_SECRET header
  const internalSecret = req.headers['x-internal-secret'];
  if (internalSecret) {
    const configuredInternalSecret = process.env.INTERNAL_API_SECRET;
    if (!configuredInternalSecret) {
      return {
        success: false,
        status: 503,
        code: 'INTERNAL_SECRET_UNCONFIGURED',
        message: 'Internal API secret is not configured on the server.',
      };
    }
    if (!timingSafeSecretEqual(internalSecret, configuredInternalSecret)) {
      return {
        success: false,
        status: 401,
        code: 'INVALID_INTERNAL_SECRET',
        message: 'Invalid internal API secret.',
      };
    }
    const requestedHotelId = req.headers['x-hotel-id'];
    if (!requestedHotelId) {
      return {
        success: false,
        status: 400,
        code: 'HOTEL_CONTEXT_REQUIRED',
        message: 'Hotel context (x-hotel-id header) is required for internal service operations.',
      };
    }
    const supabaseConfig = getSupabaseConfig();
    return {
      success: true,
      user: { id: 'internal-service', email: 'service@hotelmantri.com' },
      userId: 'internal-service',
      role: 'super_admin',
      isSuperAdmin: true,
      hotelId: requestedHotelId,
      hotel: { id: requestedHotelId, hotel_name: 'System Service' },
      scopedSupabase: createClient(supabaseConfig.url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }),
    };
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      success: false,
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Missing or invalid Authorization header.',
    };
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return {
      success: false,
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Bearer token is empty.',
    };
  }

  const supabaseConfig = getSupabaseConfig();

  // Fast-path: Check memory cache for validated user auth context
  const requestedHotelId = req.headers['x-hotel-id'] || req.query.hotelId || req.query.hotel_id || req.body?.hotel_id || req.body?.hotelId;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const cacheKey = `${tokenHash}:${requestedHotelId || 'default'}`;
  const now = Date.now();
  const cachedAuth = authContextCache.get(cacheKey);

  if (cachedAuth && cachedAuth.expiresAt > now) {
    req.recordTiming?.('auth', 0.1, 'cache-hit');
    return {
      ...cachedAuth.context,
      scopedSupabase: createClient(supabaseConfig.url, supabaseConfig.anonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }),
    };
  }

  const tAuthStart = performance.now();

  // Normal user token validation via Supabase Auth
  const scopedSupabase = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: { user }, error: authError } = await scopedSupabase.auth.getUser(token);
  if (authError || !user) {
    return {
      success: false,
      status: 401,
      code: 'INVALID_TOKEN',
      message: 'Authentication token is invalid or has expired.',
    };
  }

  // Check Super Admin privilege via RPC is_super_admin()
  let isSuperAdmin = false;
  try {
    const { data: isSuper, error: rpcErr } = await scopedSupabase.rpc('is_super_admin');
    if (!rpcErr && isSuper === true) {
      isSuperAdmin = true;
    }
  } catch {
    isSuperAdmin = false;
  }

  if (!isSuperAdmin) {
    const { data: cu } = await scopedSupabase
      .from('company_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('status', 'Active')
      .maybeSingle();

    if (cu && (cu.role === 'founder' || cu.role === 'company_admin')) {
      isSuperAdmin = true;
    }
  }

  if (isSuperAdmin) {
    // Super Admin Flow: Must specify an active target hotel property
    if (!requestedHotelId) {
      return {
        success: false,
        status: 400,
        code: 'HOTEL_CONTEXT_REQUIRED',
        message: 'Hotel context is required for this operation. Please select a hotel.',
      };
    }

    const { data: hotel, error: hotelErr } = await scopedSupabase
      .from('hotels')
      .select('id, hotel_name, subscription_status, is_active')
      .eq('id', requestedHotelId)
      .maybeSingle();

    if (hotelErr || !hotel) {
      return {
        success: false,
        status: 404,
        code: 'HOTEL_NOT_FOUND',
        message: 'The requested hotel property does not exist.',
      };
    }

    const superAdminContext = {
      success: true,
      user,
      userId: user.id,
      role: 'super_admin',
      isSuperAdmin: true,
      hotelId: requestedHotelId,
      hotel,
    };

    authContextCache.set(cacheKey, {
      context: superAdminContext,
      expiresAt: now + AUTH_CACHE_TTL_MS,
    });
    req.recordTiming?.('auth', performance.now() - tAuthStart, 'super-admin-db');

    return {
      ...superAdminContext,
      scopedSupabase,
    };
  }

  // Hotel Owner / Hotel Admin / Staff Flow:
  // Authoritatively query assigned hotel from database
  let { data: adminRecords, error: dbError } = await scopedSupabase
    .from('hotel_admins')
    .select('role, staff_role, permissions, hotel_id, status')
    .eq('user_id', user.id)
    .eq('status', 'Active');

  if (dbError && (dbError.code === '42703' || dbError.message?.includes('staff_role') || dbError.message?.includes('permissions'))) {
    // Transitional fallback if migration 20261101010000_staff_roles.sql is pending in live DB
    const fallbackRes = await scopedSupabase
      .from('hotel_admins')
      .select('role, hotel_id, status')
      .eq('user_id', user.id)
      .eq('status', 'Active');
    adminRecords = fallbackRes.data;
    dbError = fallbackRes.error;
  }

  if (dbError) {
    console.error('Database error checking hotel_admins:', dbError);
    return {
      success: false,
      status: 500,
      code: 'SERVER_ERROR',
      message: 'Failed to verify hotel authorization.',
    };
  }

  const activeRecord = adminRecords && adminRecords[0];
  let authorizedHotelId = activeRecord?.hotel_id;
  let userRole = activeRecord?.role || 'hotel_admin';

  // H1: Require confirmed email for non-synthetic accounts
  if (user.email && !user.email.endsWith('.internal') && !user.email.endsWith('@internal') && !user.email_confirmed_at) {
    return {
      success: false,
      status: 403,
      code: 'EMAIL_NOT_CONFIRMED',
      message: 'Email address has not been confirmed. Please confirm your email to proceed.',
    };
  }

  if (!authorizedHotelId) {
    return {
      success: false,
      status: 403,
      code: 'NO_HOTEL_ASSIGNED',
      message: 'No hotel is associated with this account.',
    };
  }

  // STRICT SECURITY CHECK: Reject any client hotel tampering attempt
  if (requestedHotelId && requestedHotelId !== authorizedHotelId) {
    return {
      success: false,
      status: 403,
      code: 'HOTEL_ACCESS_DENIED',
      message: 'You are not authorized to access this hotel.',
    };
  }

  // Fetch authorized hotel details
  const { data: hotel } = await scopedSupabase
    .from('hotels')
    .select('id, hotel_name, subscription_status, is_active')
    .eq('id', authorizedHotelId)
    .maybeSingle();

  // C2: Authoritative role resolution from hotel_admins / app_metadata (NEVER user_metadata)
  const ALLOWED_STAFF_ROLES = ['hotel_admin', 'manager', 'reception', 'accounts', 'housekeeping'];
  let rawRole = activeRecord?.staff_role || user.app_metadata?.role || activeRecord?.role || 'reception';
  if (rawRole === 'owner') rawRole = 'hotel_admin';
  if (rawRole === 'hotel_staff') rawRole = 'reception';

  const effectiveRole = ALLOWED_STAFF_ROLES.includes(rawRole) ? rawRole : 'reception';

  // C2: Authoritative permissions from hotel_admins / app_metadata (NEVER user_metadata)
  const dbPermissions = activeRecord?.permissions || user.app_metadata?.permissions || {};
  const userPermissions = typeof dbPermissions === 'object' && dbPermissions !== null ? dbPermissions : {};

  const resolvedContext = {
    success: true,
    user,
    userId: user.id,
    role: effectiveRole,
    permissions: userPermissions,
    isSuperAdmin: false,
    hotelId: authorizedHotelId,
    hotel: hotel || { id: authorizedHotelId, hotel_name: 'Hotel' },
  };

  if (authContextCache.size > 1000) {
    for (const [k, v] of authContextCache.entries()) {
      if (v.expiresAt <= now) authContextCache.delete(k);
    }
  }

  authContextCache.set(cacheKey, {
    context: resolvedContext,
    expiresAt: now + AUTH_CACHE_TTL_MS,
  });
  req.recordTiming?.('auth', performance.now() - tAuthStart, 'user-db');

  return {
    ...resolvedContext,
    scopedSupabase,
  };
};

/**
 * Middleware: Requires a valid Supabase authenticated user.
 */
export const requireAuth = async (req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'AUTH_REQUIRED',
        code: 'AUTH_REQUIRED',
        message: 'Missing or invalid Authorization header.',
        requestId,
      });
    }

    const token = authHeader.split(' ')[1];
    const { url: supabaseUrl, anonKey: supabaseAnonKey } = getSupabaseConfig();
    const scopedSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: authError } = await scopedSupabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN',
        code: 'INVALID_TOKEN',
        message: 'Authentication token is invalid or expired.',
        requestId,
      });
    }

    req.user = user;
    req.scopedSupabase = scopedSupabase;
    next();
  } catch (err) {
    console.error(`[${requestId}] requireAuth error:`, err?.message || err);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      code: 'SERVER_ERROR',
      message: 'Internal server error during authentication.',
      requestId,
    });
  }
};

/**
 * Middleware: Requires authenticated user AND valid authorized hotel context.
 * Strictly verifies role permissions and attaches req.auth = { userId, role, isSuperAdmin, hotelId, hotel }.
 */
export const requireHotelAccess = async (req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;

  try {
    const resolution = await resolveAuthorizedHotel(req);
    if (!resolution.success) {
      console.warn(`[${requestId}] Hotel Auth Denied:`, {
        endpoint: req.originalUrl || req.url,
        method: req.method,
        statusCode: resolution.status,
        code: resolution.code,
        message: resolution.message,
      });

      return res.status(resolution.status).json({
        success: false,
        error: resolution.code,
        code: resolution.code,
        message: resolution.message,
        requestId,
      });
    }

    // Attach validated auth context
    req.user = resolution.user;
    req.hotelId = resolution.hotelId;
    req.userRole = resolution.role;
    req.hotel = resolution.hotel;
    req.scopedSupabase = resolution.scopedSupabase;
    req.auth = {
      userId: resolution.userId,
      role: resolution.role,
      permissions: resolution.permissions || {},
      userMetadata: resolution.user?.user_metadata || {},
      isSuperAdmin: resolution.isSuperAdmin,
      hotelId: resolution.hotelId,
      hotel: resolution.hotel,
    };

    next();
  } catch (error) {
    console.error(`[${requestId}] requireHotelAccess exception:`, error?.message || error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      code: 'SERVER_ERROR',
      message: 'Internal server error during hotel authorization.',
      requestId,
    });
  }
};

/**
 * Middleware: Requires the authenticated user to have one of the specified roles.
 * Super Admin always passes.
 * 'owner' and 'hotel_admin' are treated interchangeably.
 */
export const requireRoles = (allowedRoles = []) => {
  return (req, res, next) => {
    const requestId = req.requestId || crypto.randomUUID();
    const role = (req.userRole || req.auth?.role || '').toLowerCase();
    if (req.auth?.isSuperAdmin || role === 'super_admin') {
      return next();
    }

    const allowed = allowedRoles.map((r) => r.toLowerCase());
    const isOwnerOrAdmin = role === 'hotel_admin' || role === 'owner';
    const isPermitted =
      allowed.includes(role) ||
      (isOwnerOrAdmin && (allowed.includes('hotel_admin') || allowed.includes('owner')));

    if (!isPermitted) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        code: 'ROLE_FORBIDDEN',
        message: `Access denied. Users with role "${role}" cannot perform this action or access this module.`,
        requestId,
      });
    }

    next();
  };
};

/**
 * Middleware: Denies access if the user has any of the specified roles.
 * Super Admin is never forbidden.
 */
export const forbidRoles = (forbiddenRoles = []) => {
  return (req, res, next) => {
    const requestId = req.requestId || crypto.randomUUID();
    if (req.auth?.isSuperAdmin) {
      return next();
    }

    const role = (req.userRole || req.auth?.role || '').toLowerCase();
    const forbidden = forbiddenRoles.map((r) => r.toLowerCase());

    if (forbidden.includes(role)) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        code: 'ROLE_FORBIDDEN',
        message: `Access denied. Users with role "${role}" cannot access this module or resource.`,
        requestId,
      });
    }

    next();
  };
};

