import { getCurrentHotelId } from './api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const request = async (endpoint: string, options: RequestInit = {}) => {
  const hotelId = getCurrentHotelId();
  const url = `${API_BASE}/api/aiosell${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    'x-hotel-id': hotelId,
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  const data = await response.json();
  
  if (!response.ok) {
    throw data;
  }
  
  return data;
};

export const testAiosellConnection = async () => {
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
