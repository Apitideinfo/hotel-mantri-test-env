import { QueryClient } from '@tanstack/react-query';

/**
 * Production-Grade TanStack Query Client for Hotel Mantri.
 * 
 * Configured for SaaS Multi-Tenant Hospitality Operations:
 * 1. Zero refetch-storms on window focus / tab changes.
 * 2. Distinct stale times:
 *    - Static reference data (rooms, room categories, sources, settings, hot seasons): 5 minutes
 *    - Transactional operational data (reservations, room chart, matrix, counts): 30 seconds
 * 3. Tenant isolation: All queries strictly scoped by hotelId.
 * 4. Error resilience: Non-retryable authorization and validation failures.
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds default
      gcTime: 5 * 60_000, // 5 minutes cache lifetime
      refetchOnWindowFocus: false, // Prevent distracting network surges during desk work
      refetchOnReconnect: false, // RealtimeManager already coordinates reconnects
      retry: (failureCount, error: any) => {
        // Never retry client-side errors, 401s, 403s, 404s, or validation failures
        if (failureCount >= 2) return false;
        const status = error?.status || error?.statusCode;
        if (status === 401 || status === 403 || status === 404 || status === 400) return false;
        if (error?.message?.includes('JWT') || error?.message?.includes('not authorized')) return false;
        return true;
      },
    },
  },
});

export const STALE_TIMES = {
  STATIC_REF: 5 * 60_000, // 5 minutes (rooms, categories, company sources, hotel settings, hot seasons)
  OPERATIONAL: 30_000,    // 30 seconds (reservations, room chart entries, matrix, counts)
  REALTIME_BURST: 10_000, // 10 seconds
} as const;

// ── Query Keys Factory ──

export const queryKeys = {
  hotelSettings: (hotelId: string) => ['hotel', hotelId, 'settings'] as const,
  companySources: (hotelId: string) => ['hotel', hotelId, 'sources'] as const,
  roomCategories: (hotelId: string) => ['hotel', hotelId, 'categories'] as const,
  rooms: (hotelId: string) => ['hotel', hotelId, 'rooms'] as const,
  hotSeasons: (hotelId: string) => ['hotel', hotelId, 'hotSeasons'] as const,
  reservationsRange: (hotelId: string, start: string, end: string) =>
    ['hotel', hotelId, 'reservations', { start, end }] as const,
  roomChartRange: (hotelId: string, start: string, end: string) =>
    ['hotel', hotelId, 'roomChart', { start, end }] as const,
  futureReservationsCount: (hotelId: string, date: string) =>
    ['hotel', hotelId, 'futureCount', date] as const,
  authoritativeMatrix: (hotelId: string, start?: string, end?: string) =>
    start && end ? (['hotel', hotelId, 'matrix', { start, end }] as const) : (['hotel', hotelId, 'matrix'] as const),
  availabilityMatrix: (hotelId: string, start: string, end: string) =>
    ['hotel', hotelId, 'matrix', { start, end }] as const,
  guests: (hotelId: string, scope?: string) => ['hotel', hotelId, 'guests', scope ?? 'all'] as const,
  vipGuests: (hotelId: string) => ['hotel', hotelId, 'vipGuests'] as const,
  guestSummary: (hotelId: string, guestId: string) => ['hotel', hotelId, 'guest', guestId] as const,
  notifications: (hotelId: string) => ['hotel', hotelId, 'notifications'] as const,
  enabledFeatures: (hotelId: string) => ['hotel', hotelId, 'features'] as const,
  posEnabled: (hotelId: string) => ['hotel', hotelId, 'posEnabled'] as const,
};

// ── Invalidation & Mutation Helpers ──

/**
 * Invalidate all operational data for a hotel (reservations, room chart entries, matrix, and counts)
 * without clearing static configuration (settings, rooms, categories).
 */
export const invalidateOperationalData = async (hotelId: string) => {
  if (!hotelId) return;
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['hotel', hotelId, 'reservations'] }),
    queryClient.invalidateQueries({ queryKey: ['hotel', hotelId, 'roomChart'] }),
    queryClient.invalidateQueries({ queryKey: ['hotel', hotelId, 'futureCount'] }),
    queryClient.invalidateQueries({ queryKey: ['hotel', hotelId, 'matrix'] }),
  ]);
};

/**
 * Invalidate room and category configuration (e.g. after modifying Property Master).
 */
export const invalidateRoomInventory = async (hotelId: string) => {
  if (!hotelId) return;
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['hotel', hotelId, 'rooms'] }),
    queryClient.invalidateQueries({ queryKey: ['hotel', hotelId, 'categories'] }),
    queryClient.invalidateQueries({ queryKey: ['hotel', hotelId, 'matrix'] }),
  ]);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hotel_mantri_availability_updated'));
  }
};

/**
 * Invalidate hotel settings & metadata
 */
export const invalidateHotelSettings = async (hotelId: string) => {
  if (!hotelId) return;
  await queryClient.invalidateQueries({ queryKey: ['hotel', hotelId, 'settings'] });
};

/**
 * Invalidate company sources
 */
export const invalidateCompanySources = async (hotelId: string) => {
  if (!hotelId) return;
  await queryClient.invalidateQueries({ queryKey: ['hotel', hotelId, 'sources'] });
};

/**
 * Complete cache purge for tenant isolation (called when switching hotels or on sign-out).
 */
export const clearTenantCache = (specificHotelId?: string) => {
  if (specificHotelId) {
    queryClient.removeQueries({ queryKey: ['hotel', specificHotelId] });
  } else {
    queryClient.clear();
  }
};
