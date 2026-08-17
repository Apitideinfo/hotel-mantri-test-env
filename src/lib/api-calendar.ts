import { supabase } from './supabase';
import { getCurrentHotelId } from './api';
import type { HotSeason } from './types';

export const getHotSeasons = async (): Promise<HotSeason[]> => {
  const { data, error } = await supabase
    .from('hot_seasons')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('start_date', { ascending: true });
  if (error) {
    // If the table doesn't exist yet (e.g. migration not run), just return empty array gracefully
    if (error.code === '42P01') return [];
    throw error;
  }
  return (data as HotSeason[]) ?? [];
};

export const addHotSeason = async (
  name: string,
  start_date: string,
  end_date: string
): Promise<HotSeason> => {
  const { data, error } = await supabase
    .from('hot_seasons')
    .insert({
      hotel_id: getCurrentHotelId(),
      name,
      start_date,
      end_date,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as HotSeason;
};

export const deleteHotSeason = async (id: string): Promise<void> => {
  const { error } = await supabase.from('hot_seasons').delete().eq('id', id);
  if (error) throw error;
};

/**
 * Checks if a given date string (YYYY-MM-DD) is considered a Hot Season date.
 * A date is a Hot Season date if it falls on a Weekend (Saturday or Sunday)
 * or falls within any of the admin-configured Hot Season date ranges.
 */
export const isHotSeasonDate = (dateStr: string, hotSeasons: HotSeason[]): boolean => {
  if (!dateStr) return false;
  
  // Check if weekend (Saturday = 6, Sunday = 0)
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  if (day === 0 || day === 6) {
    return true;
  }
  
  // Check if within any configured hot season
  return hotSeasons.some((hs) => {
    return dateStr >= hs.start_date && dateStr <= hs.end_date;
  });
};
