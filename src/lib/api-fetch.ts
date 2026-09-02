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
}

export const apiFetch = async (
  endpoint: string, 
  options: RequestInit = {}
): Promise<any> => {
  const hotelId = getCurrentHotelId();
  
  // Get Supabase session token for backend verification
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  
  // Ensure the endpoint starts with a slash
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // Only prepend API_BASE if it's explicitly set (e.g. in dev), otherwise use relative path
  const url = API_BASE ? `${API_BASE}${cleanEndpoint}` : cleanEndpoint;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'x-hotel-id': hotelId,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (error: any) {
    // This catches network errors (e.g., CORS, DNS, connection refused)
    throw {
      success: false,
      error: 'NETWORK_ERROR',
      message: error.message || 'Failed to fetch (Network error)',
      status: 0
    } as ApiError;
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
    throw {
      success: false,
      error: data.error?.code || data.code || data.error || 'API_ERROR',
      message: data.error?.message || data.message || (typeof data.error === 'string' ? data.error : `HTTP Error ${response.status}`),
      status: response.status,
      ...data
    } as ApiError;
  }

  return data;
};
