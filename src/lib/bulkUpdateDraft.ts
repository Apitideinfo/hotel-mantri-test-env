/**
 * Deterministic, immutable draft model and business key utilities for Bulk Update.
 * Guarantees that rates and availability exist in separate, non-colliding dimensions
 * and accumulate immutably across multiple date ranges, rooms, and rate plans.
 */

export interface BulkDraftItem {
  baseRate?: number;
  channelRate?: number;
  availability?: number | null;
  stopSell?: boolean;
  minStay?: number | null;
  maxStay?: number | null;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
}

export type BulkDraftMap = Record<string, BulkDraftItem>;

export interface BulkInventoryPatch {
  hotelId?: string;
  date: string;
  roomCategoryId: string;
  ratePlanId?: string | null;
  baseRate?: number;
  channelRate?: number;
  availability?: number | null;
  stopSell?: boolean;
  minStay?: number | null;
  maxStay?: number | null;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
}

/**
 * Normalizes user date input into standard YYYY-MM-DD format.
 * Supports DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, and YYYY/MM/DD formats.
 */
export const normalizeToISODate = (dStr: string): string => {
  if (!dStr || typeof dStr !== 'string') return '';
  const trimmed = dStr.trim();
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return '';
};

/**
 * Pure UTC-based date addition. Eliminates browser and timezone shifts.
 */
export const addDays = (dateStr: string, n: number): string => {
  const norm = normalizeToISODate(dateStr);
  if (!norm) return '';
  const [y, m, d] = norm.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const rY = dt.getUTCFullYear();
  const rM = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const rD = String(dt.getUTCDate()).padStart(2, '0');
  return `${rY}-${rM}-${rD}`;
};

/**
 * Generates an inclusive array of YYYY-MM-DD dates between start and end.
 * Handles single day, cross-month, cross-year, and December dates cleanly.
 */
export const daysBetween = (start: string, end: string): string[] => {
  const s = normalizeToISODate(start);
  const e = normalizeToISODate(end);
  if (!s || !e || s > e) return [];
  const days: string[] = [];
  let cur = s;
  let guard = 0;
  while (cur <= e && guard < 400) {
    days.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return days;
};

/**
 * Creates a unique deterministic composite business key for an editable rate/inventory tuple.
 */
export const getBulkKey = (
  hotelId: string,
  date: string,
  roomCategoryId: string,
  ratePlanId?: string | null
): string => {
  const safeHotel = hotelId || 'hotel';
  const safeDate = normalizeToISODate(date) || date;
  const safeCat = roomCategoryId || 'cat';
  const safePlan = ratePlanId && ratePlanId !== 'default' ? ratePlanId : 'all';
  return `${safeHotel}|${safeDate}|${safeCat}|${safePlan}`;
};

/**
 * Parses a composite key back into its business dimensions.
 */
export const parseBulkKey = (key: string): {
  hotelId: string;
  date: string;
  roomCategoryId: string;
  ratePlanId: string | null;
} => {
  const parts = key.split('|');
  return {
    hotelId: parts[0] || '',
    date: normalizeToISODate(parts[1] || '') || parts[1] || '',
    roomCategoryId: parts[2] || '',
    ratePlanId: parts[3] === 'all' || !parts[3] ? null : parts[3],
  };
};

/**
 * Immutably merges incoming field patches into existing draft state.
 * Never replaces an entire record or discards previously edited dimensions.
 */
export const mergeBulkDraft = (
  prev: BulkDraftMap,
  updates: Record<string, Partial<BulkDraftItem>>
): BulkDraftMap => {
  const next: BulkDraftMap = { ...prev };

  for (const [key, patch] of Object.entries(updates)) {
    const existing = next[key] || {};
    const merged: BulkDraftItem = { ...existing };

    if (patch.baseRate !== undefined) merged.baseRate = patch.baseRate;
    if (patch.channelRate !== undefined) merged.channelRate = patch.channelRate;
    if (patch.availability !== undefined) merged.availability = patch.availability;
    if (patch.stopSell !== undefined) merged.stopSell = patch.stopSell;
    if (patch.minStay !== undefined) merged.minStay = patch.minStay;
    if (patch.maxStay !== undefined) merged.maxStay = patch.maxStay;
    if (patch.closedToArrival !== undefined) merged.closedToArrival = patch.closedToArrival;
    if (patch.closedToDeparture !== undefined) merged.closedToDeparture = patch.closedToDeparture;

    // Only retain keys that have at least one defined property
    const hasAny = Object.values(merged).some((v) => v !== undefined);
    if (hasAny) {
      next[key] = merged;
    } else {
      delete next[key];
    }
  }

  return next;
};

/**
 * Removes a single composite key from the draft map.
 */
export const removeDraftItem = (
  prev: BulkDraftMap,
  key: string
): BulkDraftMap => {
  const next = { ...prev };
  delete next[key];
  return next;
};

/**
 * Clears all drafts.
 */
export const clearDraft = (): BulkDraftMap => {
  return {};
};

/**
 * Converts a draft map into a deterministic patch payload array for backend persistence.
 * Filters out empty or no-op items.
 */
export const buildPatchListFromDraft = (
  drafts: BulkDraftMap,
  hotelId?: string | null
): BulkInventoryPatch[] => {
  const patches: BulkInventoryPatch[] = [];

  for (const [key, item] of Object.entries(drafts)) {
    const parsed = parseBulkKey(key);
    const safeHotelId = hotelId || parsed.hotelId;

    const patch: BulkInventoryPatch = {
      hotelId: safeHotelId,
      date: parsed.date,
      roomCategoryId: parsed.roomCategoryId,
      ratePlanId: parsed.ratePlanId,
    };

    let hasChange = false;

    if (item.baseRate !== undefined) {
      patch.baseRate = item.baseRate;
      hasChange = true;
    }
    if (item.channelRate !== undefined) {
      patch.channelRate = item.channelRate;
      hasChange = true;
    }
    if (item.availability !== undefined) {
      patch.availability = item.availability;
      hasChange = true;
    }
    if (item.stopSell !== undefined) {
      patch.stopSell = item.stopSell;
      hasChange = true;
    }
    if (item.minStay !== undefined) {
      patch.minStay = item.minStay;
      hasChange = true;
    }
    if (item.maxStay !== undefined) {
      patch.maxStay = item.maxStay;
      hasChange = true;
    }
    if (item.closedToArrival !== undefined) {
      patch.closedToArrival = item.closedToArrival;
      hasChange = true;
    }
    if (item.closedToDeparture !== undefined) {
      patch.closedToDeparture = item.closedToDeparture;
      hasChange = true;
    }

    if (hasChange) {
      patches.push(patch);
    }
  }

  // Sort deterministically by date, then categoryId, then ratePlanId
  return patches.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.roomCategoryId !== b.roomCategoryId) return a.roomCategoryId.localeCompare(b.roomCategoryId);
    return (a.ratePlanId || '').localeCompare(b.ratePlanId || '');
  });
};

/**
 * Summarizes the active draft map for user review and badge tracking.
 */
export const summarizeDraft = (drafts: BulkDraftMap) => {
  const keys = Object.keys(drafts);
  const dates = new Set<string>();
  const categories = new Set<string>();
  let rateChangesCount = 0;
  let availabilityChangesCount = 0;
  let restrictionChangesCount = 0;

  for (const [key, item] of Object.entries(drafts)) {
    const parsed = parseBulkKey(key);
    if (parsed.date) dates.add(parsed.date);
    if (parsed.roomCategoryId) categories.add(parsed.roomCategoryId);

    if (item.baseRate !== undefined || item.channelRate !== undefined) {
      rateChangesCount++;
    }
    if (item.availability !== undefined) {
      availabilityChangesCount++;
    }
    if (
      item.stopSell !== undefined ||
      item.minStay !== undefined ||
      item.maxStay !== undefined ||
      item.closedToArrival !== undefined ||
      item.closedToDeparture !== undefined
    ) {
      restrictionChangesCount++;
    }
  }

  return {
    totalItems: keys.length,
    uniqueDates: dates.size,
    uniqueCategories: categories.size,
    rateChangesCount,
    availabilityChangesCount,
    restrictionChangesCount,
    totalRates: rateChangesCount,
    totalAvailabilities: availabilityChangesCount,
    totalRestrictions: restrictionChangesCount,
    hasUnsavedChanges: keys.length > 0,
  };
};
