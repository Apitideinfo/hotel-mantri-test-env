import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const getSupabaseConfig = () => {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://mtfycmdoqzzyxhjmfvuv.supabase.co';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10ZnljbWRvcXp6eXhoam1mdnV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2OTI2NDcsImV4cCI6MjEwMjI2ODY0N30.oDelVfbf0DEYi5c5k8jgVBNjyNNwOnVzZYyMybNpfJs';
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
export const resolveAuthorizedHotel = async (req) => {
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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Privileged internal server-to-server call with service role key ONLY
  if (serviceKey && token === serviceKey) {
    const requestedHotelId = req.headers['x-hotel-id'] || req.query.hotelId || req.query.hotel_id || req.body?.hotel_id || req.body?.hotelId;
    if (!requestedHotelId) {
      return {
        success: false,
        status: 400,
        code: 'HOTEL_CONTEXT_REQUIRED',
        message: 'Hotel context is required for service role operations.',
      };
    }
    return {
      success: true,
      user: { id: 'service-role-admin', email: 'service@hotelmantri.com' },
      userId: 'service-role-admin',
      role: 'super_admin',
      isSuperAdmin: true,
      hotelId: requestedHotelId,
      hotel: { id: requestedHotelId },
      scopedSupabase: createClient(supabaseConfig.url, serviceKey),
    };
  }

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

  const requestedHotelId = req.headers['x-hotel-id'] || req.query.hotelId || req.query.hotel_id || req.body?.hotel_id || req.body?.hotelId;

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

    return {
      success: true,
      user,
      userId: user.id,
      role: 'super_admin',
      isSuperAdmin: true,
      hotelId: requestedHotelId,
      hotel,
      scopedSupabase,
    };
  }

  // Hotel Owner / Hotel Admin / Staff Flow:
  // Authoritatively query assigned hotel from database
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
  let userRole = activeRecord?.role || 'hotel_admin';

  if (!authorizedHotelId && user.email) {
    const { data: matchedHotel } = await scopedSupabase
      .from('hotels')
      .select('id, hotel_name, subscription_status, is_active')
      .ilike('admin_email', user.email.trim())
      .eq('is_active', true)
      .maybeSingle();

    if (matchedHotel) {
      authorizedHotelId = matchedHotel.id;
      userRole = 'hotel_admin';
    }
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

  return {
    success: true,
    user,
    userId: user.id,
    role: userRole,
    isSuperAdmin: false,
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
