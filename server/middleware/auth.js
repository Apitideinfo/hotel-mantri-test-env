import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const getSupabaseConfig = () => {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  return { url, anonKey };
};

/**
 * Resolves the authenticated user and their authorized hotel context.
 * Strictly verifies role permissions and rejects unauthorized cross-hotel requests.
 */
export const resolveAuthorizedHotel = async (req) => {
  if (req.user && req.auth?.hotelId) {
    return {
      success: true,
      user: req.user,
      hotelId: req.auth.hotelId,
      role: req.userRole || req.auth.role || 'super_admin',
      hotel: req.hotel || { id: req.auth.hotelId },
      scopedSupabase: req.scopedSupabase,
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

  const { url: supabaseUrl, anonKey: supabaseAnonKey } = getSupabaseConfig();
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      success: false,
      status: 500,
      code: 'CONFIG_ERROR',
      message: 'Supabase configuration is missing on the server.',
    };
  }

  // Create request-scoped Supabase client with user's JWT
  const scopedSupabase = createClient(supabaseUrl, supabaseAnonKey, {
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

  // Verify token and retrieve user
  const { data: { user }, error: authError } = await scopedSupabase.auth.getUser(token);
  if (authError || !user) {
    return {
      success: false,
      status: 401,
      code: 'INVALID_TOKEN',
      message: 'Authentication token is invalid or has expired.',
    };
  }

  // Check Super Admin privilege via RPC
  let isSuperAdmin = false;
  try {
    const { data: isSuper, error: rpcErr } = await scopedSupabase.rpc('is_super_admin');
    if (!rpcErr && isSuper === true) {
      isSuperAdmin = true;
    }
  } catch {
    isSuperAdmin = false;
  }

  // Requested hotel from header, query, or body
  const requestedHotelId = req.headers['x-hotel-id'] || req.query.hotelId || req.body?.hotel_id;

  if (isSuperAdmin) {
    if (!requestedHotelId) {
      return {
        success: false,
        status: 400,
        code: 'HOTEL_CONTEXT_REQUIRED',
        message: 'Hotel context is required for this operation. Please select a hotel.',
      };
    }

    // Verify hotel exists
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

    return {
      success: true,
      user,
      userId: user.id,
      role: 'super_admin',
      hotelId: requestedHotelId,
      hotel,
      scopedSupabase,
    };
  }

  // Hotel Admin / Staff Flow:
  // Query active hotel assignments for this user
  const { data: adminRecords, error: dbError } = await scopedSupabase
    .from('hotel_admins')
    .select('role, hotel_id, status')
    .eq('user_id', user.id)
    .eq('status', 'Active');

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

  if (!authorizedHotelId && user.email) {
    const { data: matchedHotel } = await scopedSupabase
      .from('hotels')
      .select('id, hotel_name, subscription_status, is_active')
      .ilike('admin_email', user.email.trim())
      .eq('is_active', true)
      .maybeSingle();

    if (matchedHotel) {
      if (requestedHotelId && requestedHotelId !== matchedHotel.id) {
        return {
          success: false,
          status: 403,
          code: 'HOTEL_ACCESS_DENIED',
          message: 'Cross-hotel access denied. You are not authorized for this property.',
        };
      }
      return {
        success: true,
        user,
        userId: user.id,
        role: 'hotel_admin',
        hotelId: matchedHotel.id,
        hotel: matchedHotel,
        scopedSupabase,
      };
    }
  }

  if (!authorizedHotelId) {
    return {
      success: false,
      status: 403,
      code: 'HOTEL_ACCESS_DENIED',
      message: 'User is not assigned to any active hotel property.',
    };
  }

  // If client passed an X-Hotel-Id, verify it matches their assigned hotel
  if (requestedHotelId && requestedHotelId !== authorizedHotelId) {
    return {
      success: false,
      status: 403,
      code: 'HOTEL_ACCESS_DENIED',
      message: 'Cross-hotel access denied. You are not authorized for this property.',
    };
  }

  // Fetch authorized hotel details
  const { data: hotel } = await scopedSupabase
    .from('hotels')
    .select('id, hotel_name, subscription_status, is_active')
    .eq('id', authorizedHotelId)
    .maybeSingle();

  return {
    success: true,
    user,
    userId: user.id,
    role: activeRecord.role || 'hotel_admin',
    hotelId: authorizedHotelId,
    hotel: hotel || { id: authorizedHotelId, hotel_name: 'Hotel' },
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
      code: 'SERVER_ERROR',
      message: 'Internal server error during authentication.',
      requestId,
    });
  }
};

/**
 * Middleware: Requires authenticated user AND valid authorized hotel context.
 * Strictly verifies role permissions and attaches req.auth = { userId, role, hotelId, hotel }.
 */
export const requireHotelAccess = async (req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;

  try {
    const resolution = await resolveAuthorizedHotel(req);
    if (!resolution.success) {
      // Safe diagnostic logging (NEVER log tokens or passwords)
      console.warn(`[${requestId}] Hotel Auth Denied:`, {
        endpoint: req.originalUrl || req.url,
        method: req.method,
        statusCode: resolution.status,
        code: resolution.code,
        requestedHotelId: req.headers['x-hotel-id'] || req.query.hotelId,
      });

      return res.status(resolution.status).json({
        success: false,
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
      hotelId: resolution.hotelId,
      hotel: resolution.hotel,
    };

    next();
  } catch (error) {
    console.error(`[${requestId}] requireHotelAccess exception:`, error?.message || error);
    res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Internal server error during hotel authorization.',
      requestId,
    });
  }
};

