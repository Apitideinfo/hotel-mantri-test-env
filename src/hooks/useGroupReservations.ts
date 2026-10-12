import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Reservation } from '@/lib/types-reservations';

export interface UseGroupReservationsResult {
  groupReservations: Reservation[];
  loadingGroup: boolean;
  refreshGroup: () => Promise<void>;
}

/**
 * Custom hook to fetch, deduplicate, and sort multi-room group reservations.
 * Decouples raw database PostgREST querying from presentation components.
 */
export const useGroupReservations = (
  groupId?: string | null,
  currentResId?: string | null,
): UseGroupReservationsResult => {
  const [groupReservations, setGroupReservations] = useState<Reservation[]>([]);
  const [loadingGroup, setLoadingGroup] = useState(false);

  const fetchGroup = async () => {
    if (!groupId || groupId.trim() === '') {
      setGroupReservations([]);
      return;
    }

    setLoadingGroup(true);
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('group_id', groupId);

      if (!error && data && data.length > 0) {
        const isPhysical = (rm?: string | null) => {
          const norm = (rm || '').trim().toLowerCase();
          return Boolean(norm && norm !== 'unassigned' && norm !== 'tbd');
        };
        const list = data as Reservation[];
        const seenPhysical = new Set<string>();
        const seenIds = new Set<string>();
        const unique: Reservation[] = [];

        // If currentResId exists in list, prioritize it
        const currentItem = list.find((r) => r.id === currentResId);
        if (currentItem) {
          if (isPhysical(currentItem.room_no)) {
            seenPhysical.add((currentItem.room_no || '').trim().toLowerCase());
          }
          seenIds.add(currentItem.id);
          unique.push(currentItem);
        }

        for (const r of list) {
          if (r.id === currentResId) continue;
          const norm = (r.room_no || '').trim().toLowerCase();
          if (isPhysical(r.room_no)) {
            if (seenPhysical.has(norm)) continue;
            seenPhysical.add(norm);
          } else {
            if (seenIds.has(r.id)) continue;
            seenIds.add(r.id);
          }
          unique.push(r);
        }

        // Natural sort by room number
        unique.sort((a, b) => (a.room_no || '').localeCompare(b.room_no || '', undefined, { numeric: true }));

        setGroupReservations(unique.length > 1 ? unique : []);
      } else {
        setGroupReservations([]);
      }
    } catch {
      setGroupReservations([]);
    } finally {
      setLoadingGroup(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (groupId && groupId.trim() !== '') {
      fetchGroup();
    } else {
      setGroupReservations([]);
    }
    return () => {
      active = false;
    };
  }, [groupId, currentResId]);

  return {
    groupReservations,
    loadingGroup,
    refreshGroup: fetchGroup,
  };
};
