import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isPlaceholderSupabase } from './supabase';
import { setCurrentHotelId } from './api';


export type UserRole = 'super_admin' | 'hotel_admin' | 'hotel_staff' | 'company_user';

export type CompanyRole =
  | 'founder' | 'company_admin'
  | 'sales_manager' | 'sales_executive'
  | 'support_manager' | 'support_executive'
  | 'finance_manager' | 'finance_executive';

export interface AuthContext {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profileLoaded: boolean;
  profileError: string | null;
  role: UserRole | null;
  companyRole: CompanyRole | null;
  hotelId: string | null;
  hotelName: string | null;
  subscriptionStatus: 'Active' | 'Expired' | 'Suspended' | 'Trial' | 'Grace Period' | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  changePassword: (password: string) => Promise<void>;
  updateUserProfile: (details: { name: string; mobile: string; email: string }) => Promise<void>;
  refreshProfile: () => Promise<void>;
  recoveryMode: boolean;
  clearRecoveryMode: () => void;
}

const Ctx = createContext<AuthContext | undefined>(undefined);

interface ProfileRow {
  role: UserRole;
  hotel_id: string | null;
  status: string;
  email: string;
}

interface HotelRow {
  id?: string;
  hotel_name: string;
  subscription_status: string;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [companyRole, setCompanyRole] = useState<CompanyRole | null>(null);
  const [hotelId, setHotelId] = useState<string | null>(null);
  const [hotelName, setHotelName] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<AuthContext['subscriptionStatus']>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const profileLoadedRef = useRef<string | null>(null);

  const clearRecoveryMode = useCallback(() => setRecoveryMode(false), []);

  const loadProfile = useCallback(
    async (u: User) => {
      if (profileLoadedRef.current === u.id) return;
      try {
        setProfileError(null);

        // Check if there is an active session before making RPC calls
        const { data: sessionData } = await supabase.auth.getSession();
        const activeToken = sessionData.session?.access_token;
        if (!activeToken) {
          throw new Error('No active session token available.');
        }

        // Explicitly check RPC is_super_admin() — this ensures Super Admin precedence
        let isSuper = false;
        try {
          const { data, error: isSuperErr } = await supabase.rpc('is_super_admin');
          if (isSuperErr) {
            // Check for JWT expiration / invalid token errors
            if (isSuperErr.code === 'PGRST301' || isSuperErr.message?.includes('JWT')) {
              console.warn('JWT token invalid or expired when checking is_super_admin, attempting session refresh');
              const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
              if (refreshErr || !refreshData.session) {
                throw new Error('TOKEN_EXPIRED');
              }
              // Retry with refreshed session
              const { data: retryData, error: retryErr } = await supabase.rpc('is_super_admin');
              if (retryErr) throw retryErr;
              isSuper = retryData === true;
            } else {
              throw isSuperErr;
            }
          } else {
            isSuper = data === true;
          }
        } catch (rpcErr: any) {
          if (rpcErr?.message === 'TOKEN_EXPIRED') throw rpcErr;
          console.warn('is_super_admin RPC check returned error:', rpcErr?.message || rpcErr);
          isSuper = false;
        }

        if (isSuper === true) {
          setRole('super_admin');
          
          // Fetch company role if exists to populate companyRole for EnterpriseHQ
          const { data: cu } = await supabase
            .from('company_users')
            .select('role')
            .eq('user_id', u.id)
            .eq('status', 'Active')
            .maybeSingle();
            
          setCompanyRole((cu?.role as CompanyRole) || 'founder');
          setHotelId(null);
          setHotelName(null);
          setSubscriptionStatus('Active');
          setCurrentHotelId(null);
          setProfileLoaded(true);
          profileLoadedRef.current = u.id;
          return;
        }

        // Check for company-level role next
        const { data: companyRows, error: companyErr } = await supabase
          .from('company_users')
          .select('role, status, name')
          .eq('user_id', u.id)
          .maybeSingle();

        if (companyErr && companyErr.code !== 'PGRST116') {
          console.error('company_users lookup error:', companyErr);
        }
        
        const cu = companyRows as { role: string; status: string; name: string } | null;
        if (cu && cu.status === 'Active') {
          setRole('company_user');
          setCompanyRole(cu.role as CompanyRole);
          setHotelId(null);
          setHotelName('Enterprise HQ');
          setSubscriptionStatus('Active');
          setCurrentHotelId(null);
          setProfileLoaded(true);
          profileLoadedRef.current = u.id;
          return;
        }

        // Hotel Admin / Staff lookup from hotel_admins
        const { data: adminRows, error } = await supabase
          .from('hotel_admins')
          .select('role, hotel_id, status, email')
          .eq('user_id', u.id)
          .eq('status', 'Active');

        if (error) throw error;

        const rows = (adminRows ?? []) as { role: string; hotel_id: string | null; status: string; email: string }[];
        const adminRow = rows[0] ?? null;

        if (!adminRow) {
          // If no hotel_admins record exists for user_id, check if user's verified email matches hotels.admin_email
          if (u.email) {
            const { data: matchedHotel } = await supabase
              .from('hotels')
              .select('id, hotel_name, subscription_status')
              .ilike('admin_email', u.email.trim())
              .eq('is_active', true)
              .maybeSingle();

            if (matchedHotel) {
              const h = matchedHotel as HotelRow;
              setRole('hotel_admin');
              setCompanyRole(null);
              setHotelId(h.id || null);
              setCurrentHotelId(h.id || null);
              setHotelName(h.hotel_name);
              setSubscriptionStatus((h.subscription_status as AuthContext['subscriptionStatus']) || 'Active');
              setProfileLoaded(true);
              profileLoadedRef.current = u.id;
              return;
            }
          }

          // No role found — do NOT silently assume hotel_admin. Surface as no-role.
          setRole(null);
          setCompanyRole(null);
          setHotelId(null);
          setHotelName(null);
          setSubscriptionStatus(null);
          setCurrentHotelId(null);
          setProfileLoaded(true);
          profileLoadedRef.current = u.id;
          return;
        }

        const profile = adminRow as ProfileRow;

        setRole(profile.role as UserRole);
        setCompanyRole(null);
        setHotelId(profile.hotel_id || null);
        setCurrentHotelId(profile.hotel_id || null);

        if (profile.hotel_id) {
          const { data: hotelData } = await supabase
            .from('hotels')
            .select('hotel_name, subscription_status')
            .eq('id', profile.hotel_id)
            .maybeSingle();

          if (hotelData) {
            const h = hotelData as HotelRow;
            setHotelName(h.hotel_name);
            setSubscriptionStatus((h.subscription_status as AuthContext['subscriptionStatus']) || 'Active');
          } else {
            setHotelName('Hotel');
            setSubscriptionStatus('Active');
          }
        }
        setProfileLoaded(true);
        profileLoadedRef.current = u.id;
      } catch (err: any) {
        console.error('Failed to load user profile:', err?.message || err);
        if (err?.message === 'TOKEN_EXPIRED') {
          setProfileError('Your session has expired. Please sign in again.');
        } else {
          setProfileError(err instanceof Error ? err.message : String(err));
        }
        setRole(null);
        setCompanyRole(null);
        setHotelId(null);
        setHotelName(null);
        setSubscriptionStatus(null);
        setCurrentHotelId(null);
        setProfileLoaded(true);
        profileLoadedRef.current = u.id;
      }
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    if (isPlaceholderSupabase) {
      setLoading(false);
      return;
    }

    // Initialize session reliably
    supabase.auth.getSession().then(async ({ data, error: sessionErr }) => {
      if (!isMounted) return;
      if (sessionErr) {
        console.warn('Session retrieval warning:', sessionErr.message);
        setLoading(false);
        return;
      }

      const sess = data?.session ?? null;
      setSession(sess);
      const u = sess?.user ?? null;
      setUser(u);
      if (u) {
        await loadProfile(u);
      } else {
        setProfileLoaded(true);
      }
      setLoading(false);
    }).catch((err) => {
      if (!isMounted) return;
      console.error('Auth session initialization failed:', err);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, sess) => {
      if (!isMounted) return;
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
      }

      if ((event as string) === 'TOKEN_REFRESH_FAILED') {
        console.warn('Supabase session token refresh failed.');
        await supabase.auth.signOut().catch(() => {});
        setUser(null);
        setSession(null);
        setRole(null);
        setHotelId(null);
        setCurrentHotelId(null);
        setProfileLoaded(true);
        setProfileError('Your session has expired. Please sign in again.');
        setLoading(false);
        return;
      }

      if (!sess) {
        setUser(null);
        setSession(null);
        setRole(null);
        setCompanyRole(null);
        setHotelId(null);
        setHotelName(null);
        setSubscriptionStatus(null);
        setCurrentHotelId(null);
        setProfileLoaded(false);
        profileLoadedRef.current = null;
      } else {
        setSession(sess);
        setUser(sess.user);
        await loadProfile(sess.user);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      profileLoadedRef.current = null;
      await loadProfile(user);
    }
  }, [user, loadProfile]);

  const signIn = async (email: string, pass: string) => {
    const cleanEmail = email.trim().toLowerCase().replace(/,/g, '.');
    if (!cleanEmail || !pass) {
      const err = new Error('Please enter both email and password.');
      (err as any).code = 'AUTH_REQUEST_INVALID';
      throw err;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      const err = new Error('Please enter a valid email address.');
      (err as any).code = 'AUTH_REQUEST_INVALID';
      throw err;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: pass,
    });

    if (error) {
      // Safe structured diagnostics (NEVER log actual password)
      console.warn('Login attempt failed:', {
        status: error.status,
        code: error.code,
        hasEmail: !!cleanEmail,
        hasPassword: !!pass,
      });

      if (error.status === 400 || error.code === 'invalid_credentials' || error.message?.toLowerCase().includes('invalid login')) {
        const err = new Error('Invalid email or password. Please verify your credentials and try again.');
        (err as any).code = 'INVALID_CREDENTIALS';
        throw err;
      }
      if (error.message?.toLowerCase().includes('email not confirmed')) {
        const err = new Error('Your email address has not been confirmed. Please check your inbox.');
        (err as any).code = 'EMAIL_NOT_CONFIRMED';
        throw err;
      }
      if (error.message?.toLowerCase().includes('user not found')) {
        const err = new Error('No account found with this email address.');
        (err as any).code = 'AUTH_USER_NOT_FOUND';
        throw err;
      }
      if (error.status === 422) {
        const err = new Error('Invalid login request format.');
        (err as any).code = 'AUTH_REQUEST_INVALID';
        throw err;
      }
      throw error;
    }

    if (data.session) {
      setSession(data.session);
      setUser(data.user);
      await loadProfile(data.user);
    }
  };

  const signOut = async () => {
    try {
      localStorage.removeItem('hotel_mantri_selected_hotel_id');
      localStorage.removeItem('hotelmantri_demo_user');
    } catch {
      // Ignore localStorage error
    }
    await supabase.auth.signOut().catch(() => {});
    setUser(null);
    setSession(null);
    setRole(null);
    setCompanyRole(null);
    setHotelId(null);
    setHotelName(null);
    setSubscriptionStatus(null);
    setCurrentHotelId(null);
    setProfileLoaded(false);
    setProfileError(null);
    profileLoadedRef.current = null;
  };



  const resetPassword = async (email: string) => {
    const cleanEmail = email.trim().toLowerCase().replace(/,/g, '.');
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
  };

  const changePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };

  const updateUserProfile = async ({ name, mobile, email }: { name: string; mobile: string; email: string }) => {
    const { error } = await supabase.auth.updateUser({
      email,
      data: { ...user?.user_metadata, full_name: name, phone: mobile },
    });
    if (error) throw error;
  };

  return (
    <Ctx.Provider value={{ user, session, loading, profileLoaded, profileError, role, companyRole, hotelId, hotelName, subscriptionStatus, signIn, signOut, resetPassword, changePassword, updateUserProfile, refreshProfile, recoveryMode, clearRecoveryMode }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = (): AuthContext => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
