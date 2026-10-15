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

export interface DraftValidationResult {
  validDrafts: BulkDraftMap;
  removedItems: { key: string; reason: string; item: BulkDraftItem }[];
  removedCount: number;
  remainingCount: number;
}

/**
 * Validates every draft entry against the current hotel property and its active categories/rate plans.
 * Automatically purges foreign-tenant items, returning only valid entries.
 */
export const validateAndFilterDraft = (
  drafts: BulkDraftMap,
  currentHotelId: string,
  validCategories: { id: string }[],
  validRatePlans?: { id: string }[]
): DraftValidationResult => {
  const validDrafts: BulkDraftMap = {};
  const removedItems: { key: string; reason: string; item: BulkDraftItem }[] = [];
  const validCatSet = new Set((validCategories || []).map((c) => c.id));
  const validPlanSet = validRatePlans ? new Set(validRatePlans.map((p) => p.id)) : null;

  for (const [key, item] of Object.entries(drafts || {})) {
    const parsed = parseBulkKey(key);

    // 1. Hotel Tenant Isolation: If draft explicitly specifies a foreign hotel ID, reject
    if (parsed.hotelId && currentHotelId && parsed.hotelId !== 'hotel' && parsed.hotelId !== currentHotelId) {
      removedItems.push({ key, reason: 'foreign_hotel', item });
      continue;
    }

    // 2. Room Category Ownership: Must exist in current hotel's room categories
    if (!parsed.roomCategoryId || (validCatSet.size > 0 && !validCatSet.has(parsed.roomCategoryId))) {
      removedItems.push({ key, reason: 'invalid_room_category_for_hotel', item });
      continue;
    }

    // 3. Rate Plan Ownership: If rate plan specified, must belong to current hotel
    if (parsed.ratePlanId && validPlanSet && validPlanSet.size > 0 && !validPlanSet.has(parsed.ratePlanId)) {
      removedItems.push({ key, reason: 'invalid_rate_plan_for_hotel', item });
      continue;
    }

    // Valid: re-key canonically to current hotel ID
    const canonicalKey = getBulkKey(
      currentHotelId || parsed.hotelId,
      parsed.date,
      parsed.roomCategoryId,
      parsed.ratePlanId
    );
    validDrafts[canonicalKey] = item;
  }

  return {
    validDrafts,
    removedItems,
    removedCount: removedItems.length,
    remainingCount: Object.keys(validDrafts).length,
  };
};

/**
 * Storage key namespaced strictly by hotel ID to prevent cross-tenant draft leakage.
 */
export const getTenantDraftStorageKey = (hotelId: string): string => {
  return `bulkInventoryDraft:${hotelId || 'default'}`;
};

/**
 * Loads persisted draft for a specific hotel, validating against current categories.
 */
export const loadTenantDraft = (
  hotelId: string,
  validCategories?: { id: string }[],
  validRatePlans?: { id: string }[]
): { drafts: BulkDraftMap; removedCount: number } => {
  if (typeof window === 'undefined' || !hotelId) return { drafts: {}, removedCount: 0 };
  const key = getTenantDraftStorageKey(hotelId);
  try {
    const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
    if (!raw) return { drafts: {}, removedCount: 0 };
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { drafts: {}, removedCount: 0 };

    if (validCategories && validCategories.length > 0) {
      const validated = validateAndFilterDraft(parsed, hotelId, validCategories, validRatePlans);
      if (validated.removedCount > 0) {
        saveTenantDraft(hotelId, validated.validDrafts);
      }
      return { drafts: validated.validDrafts, removedCount: validated.removedCount };
    }
    return { drafts: parsed, removedCount: 0 };
  } catch {
    return { drafts: {}, removedCount: 0 };
  }
};

/**
 * Persists tenant-scoped draft into sessionStorage.
 */
export const saveTenantDraft = (hotelId: string, drafts: BulkDraftMap): void => {
  if (typeof window === 'undefined' || !hotelId) return;
  const key = getTenantDraftStorageKey(hotelId);
  try {
    if (Object.keys(drafts).length === 0) {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, JSON.stringify(drafts));
    }
  } catch {}
};

/**
 * Clears draft for a specific hotel.
 */
export const clearTenantDraft = (hotelId: string): void => {
  if (typeof window === 'undefined' || !hotelId) return;
  const key = getTenantDraftStorageKey(hotelId);
  try {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  } catch {}
};

/**
 * Converts a draft map into a deterministic patch payload array for backend persistence.
 * Filters out empty, no-op, foreign-hotel, and foreign-category items.
 */
export const buildPatchListFromDraft = (
  drafts: BulkDraftMap,
  hotelId?: string | null,
  validCategories?: { id: string }[]
): BulkInventoryPatch[] => {
  const patches: BulkInventoryPatch[] = [];
  const validCatSet = validCategories && validCategories.length > 0 ? new Set(validCategories.map((c) => c.id)) : null;

  for (const [key, item] of Object.entries(drafts)) {
    const parsed = parseBulkKey(key);

    // Strict Tenant Check: Never reassign foreign hotel drafts
    if (parsed.hotelId && hotelId && parsed.hotelId !== 'hotel' && parsed.hotelId !== hotelId) {
      continue;
    }

    // Strict Room Category Check: Never submit categories outside authorized hotel
    if (validCatSet && !validCatSet.has(parsed.roomCategoryId)) {
      continue;
    }

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
