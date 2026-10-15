import type { CompanySource, SourceCategory } from './types';

/**
 * Standard Source Types supported across the Hotel Mantri application.
 */
export type SourceType =
  | 'Direct'
  | 'Walk-In'
  | 'Website'
  | 'Phone'
  | 'WhatsApp'
  | 'OTA'
  | 'Corporate'
  | 'Travel Agent'
  | 'Other';

export const ALL_SOURCE_TYPES: SourceType[] = [
  'Direct',
  'Walk-In',
  'Website',
  'Phone',
  'WhatsApp',
  'OTA',
  'Corporate',
  'Travel Agent',
  'Other',
];

/**
 * Standard OTA Channels supported across channel managers and direct OTA connections.
 */
export const STANDARD_OTA_CHANNELS = [
  'Booking.com',
  'MakeMyTrip',
  'Goibibo',
  'Agoda',
  'Expedia',
  'Airbnb',
  'Cleartrip',
  'EaseMyTrip',
  'Hotels.com',
  'Trip.com',
  'Yatra',
  'Aiosell',
] as const;

/**
 * Standard built-in sources mapped by SourceType.
 */
export const STANDARD_SOURCES_BY_TYPE: Record<SourceType, string[]> = {
  'Direct': ['Direct', 'Front Desk'],
  'Walk-In': ['Walk-In'],
  'Website': ['Website', 'Direct Website', 'Hotel Website'],
  'Phone': ['Phone', 'Phone Booking', 'Telephone'],
  'WhatsApp': ['WhatsApp'],
  'OTA': [
    'Booking.com',
    'MakeMyTrip',
    'Goibibo',
    'Agoda',
    'Expedia',
    'Airbnb',
    'Cleartrip',
    'EaseMyTrip',
    'Hotels.com',
    'Trip.com',
    'Yatra',
    'Aiosell',
  ],
  'Corporate': ['Corporate', 'Corporate Client', 'Corporate Booking'],
  'Travel Agent': ['Travel Agent', 'Agent', 'Tour Operator'],
  'Other': ['Other Source'],
};

/**
 * Flat list of all standard built-in booking sources.
 */
export const ALL_STANDARD_BOOKING_SOURCES: string[] = Array.from(
  new Set(Object.values(STANDARD_SOURCES_BY_TYPE).flat())
);

/**
 * Map a UI SourceType to the Authoritative PostgreSQL database SourceCategory
 * ('OTA' | 'Direct/Walking' | 'Corporate/Agent' | 'Phonebook').
 */
export const getSourceCategoryFromType = (sourceType: SourceType): SourceCategory => {
  switch (sourceType) {
    case 'OTA':
      return 'OTA';
    case 'Phone':
      return 'Phonebook';
    case 'Corporate':
    case 'Travel Agent':
      return 'Corporate/Agent';
    case 'Walk-In':
    case 'Website':
    case 'WhatsApp':
    case 'Other':
    default:
      return 'Direct/Walking';
  }
};

/**
 * Map a database SourceCategory back to a UI SourceType.
 */
export const getSourceTypeFromCategory = (
  category: SourceCategory | string,
  sourceName?: string
): SourceType => {
  const normName = (sourceName || '').trim().toLowerCase();
  const normCat = (category || '').trim();

  if (normName) {
    if (/whatsapp/i.test(normName)) return 'WhatsApp';
    if (/website/i.test(normName)) return 'Website';
    if (/phone|call|tele/i.test(normName)) return 'Phone';
    if (/agent|tour|travel/i.test(normName)) return 'Travel Agent';
    if (/corp|company|business/i.test(normName)) return 'Corporate';
    if (/makemytrip|mmt|booking\.com|goibibo|cleartrip|oyo|agoda|expedia|airbnb|treebo|fabhotels|easemytrip|trip\.com|hotels\.com|yatra|aiosell/i.test(normName)) {
      return 'OTA';
    }
  }

  switch (normCat) {
    case 'OTA':
      return 'OTA';
    case 'Phonebook':
      return 'Phone';
    case 'Corporate/Agent':
      if (normName && /agent|travel|tour/i.test(normName)) return 'Travel Agent';
      return 'Corporate';
    case 'Direct/Walking':
    default:
      return 'Walk-In';
  }
};

/**
 * Determines the SourceType for a given Booking Source name, taking custom hotel sources into account.
 */
export const getSourceTypeFromSource = (
  sourceName: string,
  customSources: CompanySource[] = []
): { sourceType: SourceType; isKnown: boolean } => {
  const norm = (sourceName || '').trim().toLowerCase();
  if (!norm) {
    return { sourceType: 'Direct', isKnown: true };
  }

  // Exact matches for primary direct/walk-in
  if (norm === 'walk-in' || norm === 'walk in') {
    return { sourceType: 'Walk-In', isKnown: true };
  }
  if (norm === 'direct' || norm === 'front desk') {
    return { sourceType: 'Direct', isKnown: true };
  }

  // 1. Check custom hotel sources from company_sources table
  const custom = customSources.find((s) => s.name.trim().toLowerCase() === norm);
  if (custom) {
    if (custom.source_category === 'OTA') return { sourceType: 'OTA', isKnown: true };
    if (custom.source_category === 'Phonebook') return { sourceType: 'Phone', isKnown: true };
    if (custom.source_category === 'Corporate/Agent') {
      const isAgent = /agent|travel|tour/i.test(custom.name);
      return { sourceType: isAgent ? 'Travel Agent' : 'Corporate', isKnown: true };
    }
    if (custom.source_category === 'Direct/Walking') {
      if (/website/i.test(custom.name)) return { sourceType: 'Website', isKnown: true };
      if (/whatsapp/i.test(custom.name)) return { sourceType: 'WhatsApp', isKnown: true };
      return { sourceType: 'Walk-In', isKnown: true };
    }
  }

  // 2. Check standard sources by type mapping
  for (const [st, sources] of Object.entries(STANDARD_SOURCES_BY_TYPE) as [SourceType, string[]][]) {
    if (sources.some((s) => s.toLowerCase() === norm)) {
      return { sourceType: st, isKnown: true };
    }
  }

  // 3. Pattern / Regex matching for known channels
  if (/whatsapp/i.test(norm)) return { sourceType: 'WhatsApp', isKnown: true };
  if (/website|web|online direct|portal/i.test(norm)) return { sourceType: 'Website', isKnown: true };
  if (/phone|call|tele/i.test(norm)) return { sourceType: 'Phone', isKnown: true };
  if (/agent|tour|travel|dmc/i.test(norm)) return { sourceType: 'Travel Agent', isKnown: true };
  if (/corp|company|ltd|pvt|enterprise|biz/i.test(norm)) return { sourceType: 'Corporate', isKnown: true };
  if (/makemytrip|mmt|booking\.com|goibibo|cleartrip|oyo|agoda|expedia|airbnb|treebo|fabhotels|easemytrip|trip\.com|hotels\.com|yatra|aiosell|channex/i.test(norm)) {
    return { sourceType: 'OTA', isKnown: true };
  }
  if (/walk\s*in|direct/i.test(norm)) return { sourceType: 'Walk-In', isKnown: true };

  // 4. Unknown custom source — explicitly categorized as Other instead of silently becoming Direct
  return { sourceType: 'Other', isKnown: false };
};

/**
 * Returns all compatible Booking Sources for a given SourceType, merging standard options
 * and hotel-specific CompanySource records.
 */
export const getCompatibleSourcesForType = (
  sourceType: SourceType,
  customSources: CompanySource[] = []
): string[] => {
  const standard = STANDARD_SOURCES_BY_TYPE[sourceType] || [];
  const compatibleCustom: string[] = [];

  for (const cs of customSources) {
    const csType = getSourceTypeFromSource(cs.name, customSources).sourceType;
    if (csType === sourceType) {
      if (!standard.some((s) => s.toLowerCase() === cs.name.trim().toLowerCase())) {
        compatibleCustom.push(cs.name.trim());
      }
    }
  }

  return [...standard, ...compatibleCustom];
};

/**
 * Checks if a specific Booking Source is compatible with a given SourceType.
 */
export const isSourceCompatibleWithType = (
  sourceName: string,
  sourceType: SourceType,
  customSources: CompanySource[] = []
): boolean => {
  const norm = (sourceName || '').trim().toLowerCase();
  if (!norm) return true;

  const compatible = getCompatibleSourcesForType(sourceType, customSources);
  if (compatible.some((s) => s.toLowerCase() === norm)) {
    return true;
  }

  const { sourceType: resolvedType } = getSourceTypeFromSource(sourceName, customSources);
  return resolvedType === sourceType;
};

/**
 * Authoritative Synchronization Engine.
 * 
 * Rules:
 * - Changing either field immediately updates the other field's valid state.
 * - Preserve a specific source when it is already compatible with the selected type.
 * - If multiple sources match a type, do not arbitrarily pick one if current is valid.
 * - Unknown sources are handled explicitly instead of silently classified as Direct.
 */
export interface SynchronizeSourceParams {
  sourceName?: string;
  source?: string;
  sourceType?: SourceType;
  type?: SourceType;
  changedField: 'source' | 'type' | 'category';
  customSources?: CompanySource[];
  hotelSources?: CompanySource[];
}

export interface SynchronizeSourceResult {
  sourceName: string;
  source: string;
  sourceType: SourceType;
  type: SourceType;
  sourceCategory: SourceCategory;
  category: SourceCategory;
  isKnown: boolean;
}

export const synchronizeSourceAndType = (params: SynchronizeSourceParams): SynchronizeSourceResult => {
  const sourceName = (params.sourceName ?? params.source ?? '').trim();
  const sourceType = (params.sourceType ?? params.type ?? 'Direct') as SourceType;
  const customSources = params.customSources ?? params.hotelSources ?? [];
  const changedField = params.changedField;

  if (changedField === 'source') {
    const { sourceType: newType, isKnown } = getSourceTypeFromSource(sourceName, customSources);
    const sourceCategory = getSourceCategoryFromType(newType);
    return {
      sourceName,
      source: sourceName,
      sourceType: newType,
      type: newType,
      sourceCategory,
      category: sourceCategory,
      isKnown,
    };
  }

  // changedField === 'type' or 'category'
  const isCompatible = isSourceCompatibleWithType(sourceName, sourceType, customSources);
  const sourceCategory = getSourceCategoryFromType(sourceType);

  if (isCompatible && sourceName.trim()) {
    // Preserve existing source if compatible
    return {
      sourceName,
      source: sourceName,
      sourceType,
      type: sourceType,
      sourceCategory,
      category: sourceCategory,
      isKnown: true,
    };
  }

  // If source was not compatible, default to first compatible source
  const compatibleSources = getCompatibleSourcesForType(sourceType, customSources);
  const fallbackSource = compatibleSources[0] || (sourceType === 'Other' ? (sourceName || 'Other') : sourceType);

  return {
    sourceName: fallbackSource,
    source: fallbackSource,
    sourceType,
    type: sourceType,
    sourceCategory,
    category: sourceCategory,
    isKnown: true,
  };
};

/**
 * Unified company classifier for Room Chart & reporting modules.
 */
export const classifyCompanyUnified = (
  name: string,
  sources: CompanySource[] = []
): SourceCategory => {
  const { sourceType } = getSourceTypeFromSource(name, sources);
  return getSourceCategoryFromType(sourceType);
};
