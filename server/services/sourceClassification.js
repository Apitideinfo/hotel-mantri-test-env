/**
 * HOTEL MANTRI — Server-Side Source Classification Engine
 * Centralized, authoritative mapping between Booking Sources, Source Types, and Database Categories.
 */

export const ALL_SOURCE_TYPES = [
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
];

export const STANDARD_SOURCES_BY_TYPE = {
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

export const ALL_STANDARD_BOOKING_SOURCES = Array.from(
  new Set(Object.values(STANDARD_SOURCES_BY_TYPE).flat())
);

export const getSourceCategoryFromType = (sourceType) => {
  switch (sourceType) {
    case 'OTA':
      return 'OTA';
    case 'Phone':
      return 'Phonebook';
    case 'Corporate':
    case 'Travel Agent':
      return 'Corporate/Agent';
    case 'Direct':
    case 'Walk-In':
    case 'Website':
    case 'WhatsApp':
    case 'Other':
    default:
      return 'Direct/Walking';
  }
};

export const getSourceTypeFromCategory = (category, sourceName = '') => {
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

export const getSourceTypeFromSource = (sourceName, customSources = []) => {
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

  const custom = customSources.find((s) => s.name?.trim().toLowerCase() === norm);
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
      return { sourceType: 'Direct', isKnown: true };
    }
  }

  for (const [st, sources] of Object.entries(STANDARD_SOURCES_BY_TYPE)) {
    if (sources.some((s) => s.toLowerCase() === norm)) {
      return { sourceType: st, isKnown: true };
    }
  }

  if (/whatsapp/i.test(norm)) return { sourceType: 'WhatsApp', isKnown: true };
  if (/website|web|online direct|portal/i.test(norm)) return { sourceType: 'Website', isKnown: true };
  if (/phone|call|tele/i.test(norm)) return { sourceType: 'Phone', isKnown: true };
  if (/agent|tour|travel|dmc/i.test(norm)) return { sourceType: 'Travel Agent', isKnown: true };
  if (/corp|company|ltd|pvt|enterprise|biz/i.test(norm)) return { sourceType: 'Corporate', isKnown: true };
  if (/makemytrip|mmt|booking\.com|goibibo|cleartrip|oyo|agoda|expedia|airbnb|treebo|fabhotels|easemytrip|trip\.com|hotels\.com|yatra|aiosell|channex/i.test(norm)) {
    return { sourceType: 'OTA', isKnown: true };
  }
  if (/walk\s*in/i.test(norm)) return { sourceType: 'Walk-In', isKnown: true };
  if (/direct|front desk/i.test(norm)) return { sourceType: 'Direct', isKnown: true };

  return { sourceType: 'Other', isKnown: false };
};

export const getCompatibleSourcesForType = (sourceType, customSources = []) => {
  const standard = STANDARD_SOURCES_BY_TYPE[sourceType] || [];
  const compatibleCustom = [];

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

export const isSourceCompatibleWithType = (sourceName, sourceType, customSources = []) => {
  const norm = (sourceName || '').trim().toLowerCase();
  if (!norm) return true;

  const compatible = getCompatibleSourcesForType(sourceType, customSources);
  if (compatible.some((s) => s.toLowerCase() === norm)) {
    return true;
  }

  const { sourceType: resolvedType } = getSourceTypeFromSource(sourceName, customSources);
  return resolvedType === sourceType;
};

export const synchronizeSourceAndType = (params) => {
  const sourceName = (params.sourceName ?? params.source ?? '').trim();
  const sourceType = params.sourceType ?? params.type ?? 'Direct';
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

  const isCompatible = isSourceCompatibleWithType(sourceName, sourceType, customSources);
  const sourceCategory = getSourceCategoryFromType(sourceType);

  if (isCompatible && sourceName.trim()) {
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

export const classifyCompanyUnified = (name, sources = []) => {
  const { sourceType } = getSourceTypeFromSource(name, sources);
  return getSourceCategoryFromType(sourceType);
};

export default {
  ALL_SOURCE_TYPES,
  STANDARD_OTA_CHANNELS,
  STANDARD_SOURCES_BY_TYPE,
  ALL_STANDARD_BOOKING_SOURCES,
  getSourceCategoryFromType,
  getSourceTypeFromCategory,
  getSourceTypeFromSource,
  getCompatibleSourcesForType,
  isSourceCompatibleWithType,
  synchronizeSourceAndType,
  classifyCompanyUnified,
};
