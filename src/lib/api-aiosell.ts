import { getCurrentHotelId } from './api';

const API_BASE = import.meta.env.VITE_API_URL || '';

const request = async (endpoint: string, options: RequestInit = {}) => {
  const hotelId = getCurrentHotelId();
  const url = `${API_BASE}/api/aiosell${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    'x-hotel-id': hotelId,
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    console.error(`Non-JSON response from API (${response.status}):`, text.substring(0, 200));
    
    if (response.status === 404) {
      throw { message: 'Backend route missing or not deployed on Vercel.', status: 404 };
    }
    if (response.status === 401 || response.status === 403) {
      throw { message: 'Aiosell authentication failed or unauthorized.', status: response.status };
    }
    
    throw { message: `API returned non-JSON response (HTTP ${response.status})`, status: response.status };
  }

  const data = await response.json();
  
  if (!response.ok) {
    throw data;
  }
  
  return data;
};

export const testAiosellConnection = async () => {
  return request('/test');
};

export const checkAiosellStatus = async () => {
  return request('/test');
};

export const getAiosellMapping = async () => {
  return request('/mapping');
};

export const fetchAiosellInventory = async (startDate: string, endDate: string) => {
  return request('/inventory/fetch', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate }),
  });
};

export const fetchAiosellRates = async (startDate: string, endDate: string) => {
  return request('/rates/fetch', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate }),
  });
};

export const fetchAiosellReservations = async (startDate: string, endDate: string) => {
  return request('/reservations/fetch', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate }),
  });
};

export const pushAiosellInventory = async (payload: any) => {
  return request('/inventory/push', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const pushAiosellRates = async (payload: any) => {
  return request('/rates/push', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const pushAiosellInventoryRestrictions = async (payload: any) => {
  return request('/inventory-restrictions/push', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const pushAiosellRateRestrictions = async (payload: any) => {
  return request('/rate-restrictions/push', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const sendAiosellNoShow = async (bookingId: string) => {
  return request('/reservation/no-show', {
    method: 'POST',
    body: JSON.stringify({ bookingId }),
  });
};
