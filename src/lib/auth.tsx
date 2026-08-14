import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
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
  role: UserRole | null;
  companyRole: CompanyRole | null;
  hotelId: string | null;
  hotelName: string | null;
  subscriptionStatus: 'Active' | 'Expired' | 'Suspended' | null;
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
  const profileLoadedRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (u: User) => {
    if (profileLoadedRef.current === u.id) return;
    try {
      // ── 1. Check company_users FIRST ──
      // Company-level staff (founder, admin, sales, support, finance) take
      // priority over any hotel_admins row. This ensures that a user who is
      // both a super_admin in hotel_admins AND a founder in company_users is
      // routed to Enterprise HQ, not the old Super Admin Panel.
      const { data: companyRows, error: companyErr } = await supabase
        .from('company_users')
        .select('role, status, name')
        .eq('user_id', u.id)
        .maybeSingle();
      if (companyErr) throw companyErr;
      const cu = companyRows as { role: string; status: string; name: string } | null;
      if (cu && cu.status === 'Active') {
        setRole('company_user');
        setCompanyRole(cu.role as CompanyRole);
        setHotelId(null);
        setHotelName(null);
        setSubscriptionStatus(null);
        setCurrentHotelId(null);
        setProfileLoaded(true);
        profileLoadedRef.current = u.id;
        return;
      }

      // ── 2. Fall back to hotel_admins ──
      const { data: adminRows, error } = await supabase
        .from('hotel_admins')
        .select('role, hotel_id, status, email')
        .eq('user_id', u.id);

      if (error) throw error;

      const rows = (adminRows ?? []) as { role: string; hotel_id: string | null; status: string; email: string }[];
      const adminRow =
        rows.find((r) => r.role === 'super_admin') ??
        rows[0] ??
        null;

      if (!adminRow) {
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

      // ── Auto-provision: if this is a super_admin without a company_users
      // row, create one as founder so they can access Enterprise HQ. ──
      if (profile.role === 'super_admin') {
        try {
          await supabase.from('company_users').upsert(
            {
              user_id: u.id,
              name: u.email ?? 'Super Admin',
              email: u.email ?? '',
              role: 'founder',
              department: 'Management',
              status: 'Active',
            },
            { onConflict: 'user_id' },
          );
        } catch {
          // If upsert fails (e.g. RLS), continue — the user will still be
          // routed to Enterprise HQ via the super_admin fallback below.
        }
      }

      setRole(profile.role);
      setCompanyRole(null);
      setHotelId(profile.hotel_id);
      setCurrentHotelId(profile.role === 'super_admin' ? null : profile.hotel_id);

      if (profile.hotel_id && profile.role !== 'super_admin') {
        const { data: hotelData } = await supabase
          .from('hotels')
          .select('hotel_name, subscription_status')
          .eq('id', profile.hotel_id)
          .maybeSingle();
        if (hotelData) {
          const h = hotelData as HotelRow;
          setHotelName(h.hotel_name);
          setSubscriptionStatus(h.subscription_status as AuthContext['subscriptionStatus']);
        }
      } else {
        setHotelName(null);
        setSubscriptionStatus(null);
      }
      setProfileLoaded(true);
      profileLoadedRef.current = u.id;
    } catch {
      setRole(null);
      setCompanyRole(null);
      setHotelId(null);
      setCurrentHotelId(null);
      setProfileLoaded(true);
      profileLoadedRef.current = u.id;
    }
  }, []);

  useEffect(() => {
    // First, check for an existing session (handles page refresh)
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      (async () => {
        setSession(sess);
        const u = sess?.user ?? null;
        setUser(u);
        if (u) {
          await loadProfile(u);
        }
        setLoading(false);
      })();
    });

    // Then subscribe to auth state changes (handles login/logout)
    const { data: subscription } = supabase.auth.onAuthStateChange((event, sess) => {
      (async () => {
        // On sign out, clear everything
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setRole(null);
          setCompanyRole(null);
          setHotelId(null);
          setHotelName(null);
          setSubscriptionStatus(null);
          setCurrentHotelId(null);
          setProfileLoaded(false);
          profileLoadedRef.current = null;
          setLoading(false);
          return;
        }

        // On sign in or token refresh, update session + load profile
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
          setSession(sess);
          const u = sess?.user ?? null;
          setUser(u);
          if (u) {
            // Reset ref so profile reloads on new login
            if (event === 'SIGNED_IN') profileLoadedRef.current = null;
            await loadProfile(u);
          }
          setLoading(false);
        }
      })();
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      profileLoadedRef.current = null;
      await loadProfile(user);
    }
  }, [user, loadProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
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
    <Ctx.Provider value={{ user, session, loading, profileLoaded, role, companyRole, hotelId, hotelName, subscriptionStatus, signIn, signOut, resetPassword, changePassword, updateUserProfile, refreshProfile }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = (): AuthContext => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
