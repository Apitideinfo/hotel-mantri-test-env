import { apiFetch } from './api-fetch';

export const testAiosellConnection = async (hotelId?: string) => {
  return apiFetch('/api/aiosell/status', {
    headers: hotelId ? { 'x-hotel-id': hotelId } : {},
  });
};

export const checkAiosellStatus = async (hotelId?: string) => {
  return apiFetch('/api/aiosell/status', {
    headers: hotelId ? { 'x-hotel-id': hotelId } : {},
  });
};

export const getAiosellMapping = async (hotelId?: string) => {
  return apiFetch('/api/aiosell/mapping', {
    headers: hotelId ? { 'x-hotel-id': hotelId } : {},
  });
};

export const fetchAiosellInventory = async (startDate: string, endDate: string, hotelId?: string) => {
  return apiFetch('/api/aiosell/inventory/fetch', {
    method: 'POST',
    headers: hotelId ? { 'x-hotel-id': hotelId } : {},
    body: JSON.stringify({ startDate, endDate }),
  });
};

export const fetchAiosellRates = async (startDate: string, endDate: string, hotelId?: string) => {
  return apiFetch('/api/aiosell/rates/fetch', {
    method: 'POST',
    headers: hotelId ? { 'x-hotel-id': hotelId } : {},
    body: JSON.stringify({ startDate, endDate }),
  });
};

export const fetchAiosellReservations = async (startDate: string, endDate: string, hotelId?: string) => {
  return apiFetch('/api/aiosell/reservations/fetch', {
    method: 'POST',
    headers: hotelId ? { 'x-hotel-id': hotelId } : {},
    body: JSON.stringify({ startDate, endDate }),
  });
};

export const pushAiosellInventory = async (payload: any, hotelId?: string) => {
  return apiFetch('/api/aiosell/inventory/push', {
    method: 'POST',
    headers: hotelId ? { 'x-hotel-id': hotelId } : {},
    body: JSON.stringify(payload),
  });
};

export const pushAiosellRates = async (payload: any, hotelId?: string) => {
  return apiFetch('/api/aiosell/rates/push', {
    method: 'POST',
    headers: hotelId ? { 'x-hotel-id': hotelId } : {},
    body: JSON.stringify(payload),
  });
};

export const pushAiosellInventoryRestrictions = async (payload: any, hotelId?: string) => {
  return apiFetch('/api/aiosell/inventory-restrictions/push', {
    method: 'POST',
    headers: hotelId ? { 'x-hotel-id': hotelId } : {},
    body: JSON.stringify(payload),
  });
};

export const pushAiosellRateRestrictions = async (payload: any, hotelId?: string) => {
  return apiFetch('/api/aiosell/rate-restrictions/push', {
    method: 'POST',
    headers: hotelId ? { 'x-hotel-id': hotelId } : {},
    body: JSON.stringify(payload),
  });
};

export const sendAiosellNoShow = async (bookingId: string, hotelId?: string) => {
  return apiFetch('/api/aiosell/reservation/no-show', {
    method: 'POST',
    headers: hotelId ? { 'x-hotel-id': hotelId } : {},
    body: JSON.stringify({ bookingId }),
  });
};
