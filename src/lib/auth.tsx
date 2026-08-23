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
}

const Ctx = createContext<AuthContext | undefined>(undefined);

interface ProfileRow {
  role: UserRole;
  hotel_id: string | null;
  status: string;
  email: string;
}

interface HotelRow {
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
  const profileLoadedRef = useRef<string | null>(null);

  const checkDemoUser = useCallback(() => {
    try {
      const demoUserRaw = localStorage.getItem('hotelmantri_demo_user');
      if (demoUserRaw) {
        const demoData = JSON.parse(demoUserRaw);
        const mockUser = {
          id: 'demo-user-id-101',
          email: demoData.email || 'admin@hotelmantri.com',
          user_metadata: { full_name: demoData.fullName || 'Hotel Admin' },
          app_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as User;

        setUser(mockUser);
        setRole('hotel_admin');
        setHotelId('demo-hotel-id-101');
        setCurrentHotelId('demo-hotel-id-101');
        setHotelName(demoData.hotelName || 'Hotel Mantri Royal');
        setSubscriptionStatus('Active');
        setProfileLoaded(true);
        return true;
      }
    } catch (e) {
      console.warn('Error parsing demo user:', e);
    }
    return false;
  }, []);


  const loadProfile = useCallback(
    async (u: User) => {
      if (profileLoadedRef.current === u.id) return;
      try {
        setProfileError(null);
        // Explicitly check RPC is_super_admin() — this ensures Super Admin precedence
        try {
          const { data: isSuper, error: isSuperErr } = await supabase.rpc('is_super_admin');
          if (isSuperErr) throw isSuperErr;
          if (isSuper === true) {
            setRole('super_admin');
            
            // Fetch company role if exists to populate companyRole for EnterpriseHQ
            const { data: cu } = await supabase
              .from('company_users')
              .select('role')
              .eq('user_id', u.id)
              .eq('status', 'Active')
              .maybeSingle();
              
            setCompanyRole((cu?.role as CompanyRole) || 'founder'); // Default to founder
            setHotelId(null);
            setHotelName('Hotel Mantri Royal');
            setSubscriptionStatus('Active');
            setCurrentHotelId(null);
            setProfileLoaded(true);
            profileLoadedRef.current = u.id;
            return;
          }
        } catch (rpcErr) {
          console.error('is_super_admin RPC failed:', rpcErr);
          // Don't fail completely, try the fallback just in case
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

        // Fallback to hotel_admins lookup
        const { data: adminRows, error } = await supabase
          .from('hotel_admins')
          .select('role, hotel_id, status, email')
          .eq('user_id', u.id);

        if (error) throw error;

        const rows = (adminRows ?? []) as { role: string; hotel_id: string | null; status: string; email: string }[];
        const adminRow = rows.find((r) => r.role === 'super_admin') ?? rows[0] ?? null;

        if (!adminRow) {
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
        setCurrentHotelId(profile.role === 'super_admin' ? null : profile.hotel_id || null);

        if (profile.hotel_id && profile.role !== 'super_admin') {
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
            setHotelName('Hotel Mantri Royal');
            setSubscriptionStatus('Active');
          }
        } else {
          setHotelName('Hotel Mantri Royal');
          setSubscriptionStatus('Active');
        }
        setProfileLoaded(true);
        profileLoadedRef.current = u.id;
      } catch (err) {
        console.error('Failed to load user profile:', err);
        setProfileError(err instanceof Error ? err.message : String(err));
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
    const hasDemo = checkDemoUser();
    if (hasDemo || isPlaceholderSupabase) {
      setLoading(false);
      return;
    }

    const sessionPromise = supabase.auth.getSession().then(({ data }) => data.session).catch(() => null);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000));

    Promise.race([sessionPromise, timeoutPromise]).then((sess) => {
      if (!isMounted) return;
      (async () => {
        setSession(sess);
        const u = sess?.user ?? null;
        setUser(u);
        if (u) {
          await loadProfile(u);
        } else {
          checkDemoUser();
        }
        setLoading(false);
      })();
    }).catch(() => {
      if (isMounted) {
        checkDemoUser();
        setLoading(false);
      }
    });


    const { data: subscription } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!isMounted) return;
      (async () => {
        if (!sess) {
          const ok = checkDemoUser();
          if (!ok) {
            setUser(null);
            setRole(null);
            setProfileLoaded(false);
          }
        } else {
          setSession(sess);
          setUser(sess.user);
          await loadProfile(sess.user);
        }
        setLoading(false);
      })();
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [checkDemoUser, loadProfile]);

  const refreshProfile = useCallback(async () => {
    const hasDemo = checkDemoUser();
    if (hasDemo) return;

    if (user) {
      profileLoadedRef.current = null;
      await loadProfile(user);
    }
  }, [checkDemoUser, user, loadProfile]);



  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    try {
      localStorage.removeItem('hotelmantri_demo_user');
    } catch {
      // Ignore
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
    const { error } = await supabase.auth.resetPasswordForEmail(email);
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
    <Ctx.Provider value={{ user, session, loading, profileLoaded, profileError, role, companyRole, hotelId, hotelName, subscriptionStatus, signIn, signOut, resetPassword, changePassword, updateUserProfile, refreshProfile }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = (): AuthContext => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
