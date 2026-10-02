/**
 * HOTEL MANTRI — Day-Wise Revenue & Historical Accounting Client API
 */

import { apiFetch } from './api-fetch';
import { getCurrentHotelId } from './api';

export interface DayBreakdownItem {
  date: string;
  roomRevenue: number;
  fbRevenue: number;
  otherIncome: number;
  totalIncome: number;
  totalEarned: number;
  soldRoomNights: number;
  complimentaryRooms: number;
  availableRoomNights: number;
  arr: number;
  revpar: number;
  occupancyPercent: number;
  collections: {
    total: number;
    cash: number;
    bank: number;
    upi: number;
    card: number;
  };
  isClosed: boolean;
  businessDateStatus: 'closed' | 'open';
}

export interface ReservationBreakdownItem {
  date: string;
  reservationId: string;
  bookingId: string;
  guestName: string;
  roomNo: string;
  categoryName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  nightlyRate: number;
  revenueForDate: number;
  sourceName: string;
  revenueCategory: string;
  isComplimentary: boolean;
}

export interface DayWiseRevenueData {
  hotelId: string;
  hotelName: string;
  period: {
    mode: 'date' | 'range' | 'month';
    date: string | null;
    startDate: string;
    endDate: string;
    totalDays: number;
  };
  summary: {
    totalIncome: number;
    totalEarned: number;
    roomRevenue: number;
    fbRevenue: number;
    otherIncome: number;
    totalCollections: number;
    collections: {
      total: number;
      cash: number;
      bank: number;
      upi: number;
      card: number;
    };
    soldRoomNights: number;
    availableRoomNights: number;
    arr: number;
    revpar: number;
    occupancyPercent: number;
    averageDailyRevenue: number;
    highestRevenueDate: { date: string; amount: number };
    lowestRevenueDate: { date: string; amount: number };
  };
  dailyBreakdown: DayBreakdownItem[];
  reservationsBreakdown: ReservationBreakdownItem[];
}

export interface GetDayWiseRevenueParams {
  date?: string;
  startDate?: string;
  endDate?: string;
  month?: number;
  year?: number;
}

/**
 * Fetches authoritative day-wise earned revenue and historical collections from backend.
 */
export const getDayWiseRevenue = async (
  params: GetDayWiseRevenueParams = {}
): Promise<DayWiseRevenueData> => {
  const query = new URLSearchParams();
  if (params.date) query.set('date', params.date);
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  if (params.month) query.set('month', String(params.month));
  if (params.year) query.set('year', String(params.year));

  const hotelId = getCurrentHotelId();
  if (hotelId) query.set('hotelId', hotelId);

  const res = await apiFetch(`/api/revenue/day-wise?${query.toString()}`);
  return res as DayWiseRevenueData;
};

/**
 * Fetches reservation line items generating room revenue for a specific date.
 */
export const getReservationBreakdownForDate = async (
  date: string
): Promise<{
  date: string;
  summary: DayWiseRevenueData['summary'];
  reservations: ReservationBreakdownItem[];
}> => {
  const hotelId = getCurrentHotelId();
  const query = new URLSearchParams({ date });
  if (hotelId) query.set('hotelId', hotelId);

  const res = await apiFetch(`/api/revenue/reservations-breakdown?${query.toString()}`);
  return res;
};
