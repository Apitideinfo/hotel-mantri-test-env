import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Missing Supabase URL or Anon Key. Auth middleware may fail.');
}

// Use service role key if available for checking admin tables, otherwise anon key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);

/**
 * Middleware to verify Supabase JWT and ensure the user has access to the requested hotel_id.
 */
export const requireHotelAccess = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const hotelId = req.headers['x-hotel-id'];

    if (!hotelId) {
      return res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Missing x-hotel-id header' });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split(' ')[1];

    // Create a request-scoped Supabase client that uses the user's token
    // This is required so RLS policies can evaluate auth.uid() correctly
    const scopedSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });

    // Verify token and get user (we still use the global client here just to validate, or scoped is fine)
    const { data: { user }, error: authError } = await scopedSupabase.auth.getUser();

    if (authError || !user) {
      console.error('Supabase Auth Error:', authError);
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
    }

    // Check if user is associated with the requested hotel using the scoped client!
    const { data: adminRecord, error: dbError } = await scopedSupabase
      .from('hotel_admins')
      .select('role')
      .eq('user_id', user.id)
      .eq('hotel_id', hotelId)
      .maybeSingle();

    if (dbError) {
      console.error('Database Error checking hotel_admins:', dbError);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to verify hotel access' });
    }

    if (!adminRecord) {
      // Check if user is a super admin using the definitive RPC used by the frontend
      const { data: isSuperAdmin } = await scopedSupabase.rpc('is_super_admin');

      if (!isSuperAdmin) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'User does not have access to this hotel' });
      }
    }

    // User is authorized. Attach user info to request for downstream handlers.
    req.user = user;
    req.hotelId = hotelId;
    req.userRole = adminRecord ? adminRecord.role : 'super_admin';

    next();
  } catch (error) {
    console.error('Auth Middleware Exception:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Internal Server Error during authentication' });
  }
};
