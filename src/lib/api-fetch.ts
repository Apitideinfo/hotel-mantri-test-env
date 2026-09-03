import { getCurrentHotelId } from './api';
import { supabase } from './supabase';

/**
 * Centralized API request helper for backend interactions.
 * Ensures JSON parsing, Vercel "Failed to fetch" (HTML error) protection,
 * and structured error responses.
 */

// In production on Vercel, requests use same-origin relative paths.
// In development, Vite proxies /api to the local backend if configured.
const API_BASE = import.meta.env.VITE_API_URL || '';

export interface ApiError {
  success: false;
  error: string;
  message: string;
  status: number;
  stage?: 'validation' | 'mapping' | 'aiosell' | 'database' | 'authorization' | 'network';
  code?: string;
  channelId?: string;
  missingCategories?: string[];
  requestId?: string;
  [key: string]: any;
}

export interface ApiFetchOptions extends RequestInit {
  _isRetry?: boolean;
}

export const apiFetch = async (
  endpoint: string, 
  options: ApiFetchOptions = {}
): Promise<any> => {
  let hotelId: string | null = null;
  try {
    hotelId = getCurrentHotelId();
  } catch {
    // If hotel context is not yet loaded, do not crash here; backend will validate if route requires it
  }
  
  // Get Supabase session token for backend verification
  let token: string | undefined;
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (!sessionError && session) {
      token = session.access_token;
    }
  } catch (e) {
    console.warn('Unable to get session for apiFetch:', e);
  }
  
  // Ensure the endpoint starts with a slash
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // Only prepend API_BASE if it's explicitly set (e.g. in dev), otherwise use relative path
  const url = API_BASE ? `${API_BASE}${cleanEndpoint}` : cleanEndpoint;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(hotelId ? { 'x-hotel-id': hotelId } : {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (error: any) {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const isNetworkError =
      isOffline ||
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('NetworkError') ||
      error.message?.includes('Load failed') ||
      error.name === 'TypeError';

    throw {
      success: false,
      error: isOffline ? 'INTERNET_DISCONNECTED' : 'NETWORK_ERROR',
      code: isOffline ? 'ERR_INTERNET_DISCONNECTED' : 'ERR_NETWORK_FAILURE',
      stage: 'network',
      message: isOffline
        ? 'No internet connection. Please check your network and try again.'
        : isNetworkError
        ? 'Unable to reach the server. Please check your internet connection and verify that the backend is reachable.'
        : error.message || 'A network error occurred.',
      status: 0
    } as ApiError;
  }

  // Handle 401 token expiry with single retry
  if (response.status === 401 && !options._isRetry) {
    try {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshData.session?.access_token) {
        return apiFetch(endpoint, {
          ...options,
          _isRetry: true,
        });
      }
    } catch {
      // Fall through to standard error handling
    }
  }

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');

  if (!isJson) {
    const text = await response.text();
    console.error(`Non-JSON response from API (${response.status}):`, text.substring(0, 200));
    
    if (response.status === 404) {
      throw {
        success: false,
        error: 'API_ROUTE_NOT_FOUND',
        message: 'Backend route missing or not deployed on Vercel.',
        status: 404
      } as ApiError;
    }
    if (response.status === 401 || response.status === 403) {
      throw {
        success: false,
        error: 'AUTH_FAILED',
        message: 'Authentication failed or unauthorized.',
        status: response.status
      } as ApiError;
    }
    if (response.status >= 500) {
      throw {
        success: false,
        error: 'SERVER_ERROR',
        message: 'Server error occurred (HTML response returned).',
        status: response.status
      } as ApiError;
    }
    
    throw {
      success: false,
      error: 'INVALID_RESPONSE',
      message: `API returned non-JSON response (HTTP ${response.status})`,
      status: response.status
    } as ApiError;
  }

  let data;
  try {
    data = await response.json();
  } catch (err: any) {
    throw {
      success: false,
      error: 'JSON_PARSE_ERROR',
      message: 'Failed to parse JSON response from server.',
      status: response.status
    } as ApiError;
  }

  if (!response.ok) {
    // If the server returned a structured error, use it. Otherwise, create one.
    const errObj = typeof data.error === 'object' && data.error !== null ? data.error : {};
    const code = errObj.code || data.code || (typeof data.error === 'string' ? data.error : 'API_ERROR');
    const message = errObj.message || data.message || (typeof data.error === 'string' ? data.error : `HTTP Error ${response.status}`);
    const stage = errObj.stage || data.stage;

    throw {
      success: false,
      error: code,
      code,
      message,
      stage,
      status: response.status,
      ...errObj,
      ...data,
    } as ApiError;
  }

  return data;
};
