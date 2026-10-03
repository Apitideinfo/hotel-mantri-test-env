import type { RoomChartEntry, HotelSettings, CompanySource, RoomCategory, Room, SourceCategory, PayMode, FrontOfficeRole, HotSeason } from '@/lib/types';
import type { Reservation } from '@/lib/types-reservations';

export type ViewMode = 'day' | 'week';

export interface BoardBooking {
  id: string;
  type: 'entry' | 'reservation';
  roomNo: string;
  guestName: string;
  sourceCategory: string;
  sourceName: string;
  status: string;
  paymentMode: string;
  checkIn: string;
  checkOut: string;
  rate: number;
  nights: number;
  phone: string;
  email: string;
  remarks: string;
  isComplimentary: boolean;
  hasPayment: boolean;
  vipType: string;
  raw: RoomChartEntry | Reservation;
  rawReservation?: Reservation | null;
  rawEntry?: RoomChartEntry | null;
}

export interface TodayStats {
  occupied: number;
  vacant: number;
  arrivals: number;
  departures: number;
  futureBookings: number;
  todayRevenue: number;
  missingTariff: number;
  missingPayment: number;
}
