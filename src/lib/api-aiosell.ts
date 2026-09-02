import { apiFetch } from './api-fetch';

export const testAiosellConnection = async () => {
  return apiFetch('/api/aiosell/status');
};

export const checkAiosellStatus = async () => {
  return apiFetch('/api/aiosell/status');
};

export const getAiosellMapping = async () => {
  return apiFetch('/api/aiosell/mapping');
};

export const fetchAiosellInventory = async (startDate: string, endDate: string) => {
  return apiFetch('/api/aiosell/inventory/fetch', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate }),
  });
};

export const fetchAiosellRates = async (startDate: string, endDate: string) => {
  return apiFetch('/api/aiosell/rates/fetch', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate }),
  });
};

export const fetchAiosellReservations = async (startDate: string, endDate: string) => {
  return apiFetch('/api/aiosell/reservations/fetch', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate }),
  });
};

export const pushAiosellInventory = async (payload: any) => {
  return apiFetch('/api/aiosell/inventory/push', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const pushAiosellRates = async (payload: any) => {
  return apiFetch('/api/aiosell/rates/push', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const pushAiosellInventoryRestrictions = async (payload: any) => {
  return apiFetch('/api/aiosell/inventory-restrictions/push', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const pushAiosellRateRestrictions = async (payload: any) => {
  return apiFetch('/api/aiosell/rate-restrictions/push', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const sendAiosellNoShow = async (bookingId: string) => {
  return apiFetch('/api/aiosell/reservation/no-show', {
    method: 'POST',
    body: JSON.stringify({ bookingId }),
  });
};
