import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { useAuth, UserRole } from './auth';
import { setCurrentHotelId } from './api';

export type HotelContextStatus =
  | 'HOTEL_CONTEXT_LOADING'
  | 'HOTEL_CONTEXT_READY'
  | 'HOTEL_CONTEXT_EMPTY'
  | 'HOTEL_CONTEXT_ERROR';

export interface HotelSummary {
  id: string;
  hotel_name: string;
  owner_name?: string;
  admin_email?: string;
  mobile?: string;
  total_rooms?: number;
  subscription_status?: string;
  is_active?: boolean;
}

export interface HotelContextValue {
  hotelId: string | null;
  hotel: HotelSummary | null;
  role: UserRole | null;
  isSuperAdmin: boolean;
  status: HotelContextStatus;
  error: string | null;
  availableHotels: HotelSummary[];
  setSelectedHotel: (hotelId: string) => Promise<void>;
  clearSelectedHotel: () => void;
  refreshHotelContext: () => Promise<void>;
}

const STORAGE_KEY = 'hotel_mantri_selected_hotel_id';

const HotelCtx = createContext<HotelContextValue | undefined>(undefined);

export const HotelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, session, role, loading: authLoading, profileLoaded } = useAuth();

  const [hotelId, setHotelIdState] = useState<string | null>(null);
  const [hotel, setHotel] = useState<HotelSummary | null>(null);
  const [status, setStatus] = useState<HotelContextStatus>('HOTEL_CONTEXT_LOADING');
  const [error, setError] = useState<string | null>(null);
  const [availableHotels, setAvailableHotels] = useState<HotelSummary[]>([]);

  const isSuperAdmin = role === 'super_admin' || role === 'company_user';
  const resolvingUserRef = useRef<string | null>(null);

  const applyHotelSelection = useCallback((h: HotelSummary | null) => {
    if (h) {
      setHotelIdState(h.id);
      setHotel(h);
      setCurrentHotelId(h.id);
      setStatus('HOTEL_CONTEXT_READY');
      setError(null);
      try {
        localStorage.setItem(STORAGE_KEY, h.id);
      } catch {
        // Ignore localStorage error
      }
    } else {
      setHotelIdState(null);
      setHotel(null);
      setCurrentHotelId(null);
      setStatus('HOTEL_CONTEXT_EMPTY');
      setError(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore localStorage error
      }
    }
  }, []);

  const clearSelectedHotel = useCallback(() => {
    applyHotelSelection(null);
  }, [applyHotelSelection]);

  const setSelectedHotel = useCallback(async (selectedId: string) => {
    try {
      setStatus('HOTEL_CONTEXT_LOADING');
      setError(null);

      // Verify hotel exists and fetch its details
      const { data, error: hotelErr } = await supabase
        .from('hotels')
        .select('id, hotel_name, owner_name, admin_email, mobile, total_rooms, subscription_status, is_active')
        .eq('id', selectedId)
        .maybeSingle();

      if (hotelErr || !data) {
        throw new Error(hotelErr?.message || 'Selected hotel does not exist.');
      }

      applyHotelSelection(data as HotelSummary);
    } catch (err: any) {
      console.error('Failed to set selected hotel:', err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus('HOTEL_CONTEXT_ERROR');
    }
  }, [applyHotelSelection]);

  const resolveHotelContext = useCallback(async () => {
    if (!user || !profileLoaded) {
      applyHotelSelection(null);
      setStatus(authLoading ? 'HOTEL_CONTEXT_LOADING' : 'HOTEL_CONTEXT_EMPTY');
      return;
    }

    try {
      setStatus('HOTEL_CONTEXT_LOADING');
      setError(null);

      if (isSuperAdmin) {
        // SUPER ADMIN FLOW:
        // 1. Fetch available active hotels
        const { data: hotelsData, error: hotelsErr } = await supabase
          .from('hotels')
          .select('id, hotel_name, owner_name, admin_email, mobile, total_rooms, subscription_status, is_active')
          .eq('is_active', true)
          .order('hotel_name', { ascending: true });

        if (hotelsErr) {
          throw hotelsErr;
        }

        const hotelsList = (hotelsData || []) as HotelSummary[];
        setAvailableHotels(hotelsList);

        if (hotelsList.length === 0) {
          applyHotelSelection(null);
          setStatus('HOTEL_CONTEXT_EMPTY');
          setError('No active hotels registered in the system.');
          return;
        }

        // 2. Check persistent UI preference
        let storedId: string | null = null;
        try {
          storedId = localStorage.getItem(STORAGE_KEY);
        } catch {
          // Ignore
        }

        if (storedId) {
          const match = hotelsList.find((h) => h.id === storedId);
          if (match) {
            applyHotelSelection(match);
            return;
          } else {
            try {
              localStorage.removeItem(STORAGE_KEY);
            } catch {}
          }
        }

        // 3. If exactly 1 hotel exists, auto-select it
        if (hotelsList.length === 1) {
          applyHotelSelection(hotelsList[0]);
          return;
        }

        // 4. Multiple hotels exist and none is selected
        applyHotelSelection(null);
        setStatus('HOTEL_CONTEXT_EMPTY');
        return;
      }

      // HOTEL ADMIN FLOW:
      // Resolve assigned hotel from hotel_admins
      const { data: adminRows, error: adminErr } = await supabase
        .from('hotel_admins')
        .select('hotel_id, role, status')
        .eq('user_id', user.id)
        .eq('status', 'Active');

      if (adminErr) throw adminErr;

      const adminRecord = (adminRows && adminRows[0]) as { hotel_id: string } | undefined;
      let assignedHotelId = adminRecord?.hotel_id;

      if (!assignedHotelId && user.email) {
        // Fallback: check if user's verified email matches an active hotel's admin_email
        const { data: matchedHotel } = await supabase
          .from('hotels')
          .select('id, hotel_name, owner_name, admin_email, mobile, total_rooms, subscription_status, is_active')
          .ilike('admin_email', user.email.trim())
          .eq('is_active', true)
          .maybeSingle();

        if (matchedHotel) {
          const assignedHotel = matchedHotel as HotelSummary;
          setAvailableHotels([assignedHotel]);
          applyHotelSelection(assignedHotel);
          return;
        }
      }

      if (!assignedHotelId) {
        setHotelIdState(null);
        setHotel(null);
        setCurrentHotelId(null);
        setStatus('HOTEL_CONTEXT_ERROR');
        setError('Your account is not assigned to any active hotel. Please contact an administrator.');
        return;
      }

      // Fetch the assigned hotel's details
      const { data: hotelData, error: hotelErr } = await supabase
        .from('hotels')
        .select('id, hotel_name, owner_name, admin_email, mobile, total_rooms, subscription_status, is_active')
        .eq('id', assignedHotelId)
        .maybeSingle();

      if (hotelErr || !hotelData) {
        setHotelIdState(null);
        setHotel(null);
        setCurrentHotelId(null);
        setStatus('HOTEL_CONTEXT_ERROR');
        setError('Assigned hotel could not be loaded from database.');
        return;
      }

      const assignedHotel = hotelData as HotelSummary;
      setAvailableHotels([assignedHotel]);
      applyHotelSelection(assignedHotel);
    } catch (err: any) {
      console.error('Failed to resolve hotel context:', err);
      setHotelIdState(null);
      setHotel(null);
      setCurrentHotelId(null);
      setStatus('HOTEL_CONTEXT_ERROR');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [user, profileLoaded, isSuperAdmin, authLoading, applyHotelSelection]);

  useEffect(() => {
    if (!authLoading) {
      const userKey = user ? `${user.id}-${role}` : 'no-user';
      if (resolvingUserRef.current !== userKey) {
        resolvingUserRef.current = userKey;
        resolveHotelContext();
      }
    }
  }, [authLoading, user, role, resolveHotelContext]);

  return (
    <HotelCtx.Provider
      value={{
        hotelId,
        hotel,
        role,
        isSuperAdmin,
        status,
        error,
        availableHotels,
        setSelectedHotel,
        clearSelectedHotel,
        refreshHotelContext: resolveHotelContext,
      }}
    >
      {children}
    </HotelCtx.Provider>
  );
};

export const useHotel = (): HotelContextValue => {
  const ctx = useContext(HotelCtx);
  if (!ctx) {
    throw new Error('useHotel must be used within HotelProvider');
  }
  return ctx;
};
