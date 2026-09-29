/**
 * Hotel Mantri — Authoritative Daily Hotel Summary Service
 *
 * Computes business-date summaries directly from authoritative PMS data sources:
 *   - rooms (inventory source of truth)
 *   - reservations (reservations, OTA bookings, check-ins, check-outs)
 *   - room_chart_entries (room chart stays & collections)
 *   - other_daily_entries (kitchen, F&B, other income)
 *   - day_close_records (day status: OPEN / CLOSED)
 *   - hotel_settings & hotels (owner contacts, hotel details)
 *
 * CRITICAL ACCOUNTING RULES:
 *   - Room revenue belongs to the actual occupied night / business date.
 *   - Collection belongs to the actual payment / collection date.
 *   - Room chart unavailable != hotel has no data. PMS reservations are authoritative.
 *   - No double counting of multi-room reservations or overlapping entries.
 */

import { supabaseServiceRole } from '../supabaseClient.js';
import { normalizeWhatsAppPhone } from './whatsappService.js';
import { generateAuthoritativeNightlyRevenue, reconcilePaymentLedger } from './authoritativeRevenue.js';

const supabase = supabaseServiceRole;

// ─── Number & Currency Formatters ─────────────────────────────────────────────

const toNum = (v) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtMoney = (n) => {
  const v = toNum(n);
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtInt = (n) => Math.round(toNum(n)).toLocaleString('en-IN');

const formatDateReadable = (dateStr) => {
  if (!dateStr || !dateStr.includes('-')) return dateStr || '';
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = months[parseInt(m, 10) - 1] || m;
  return `${d} ${monthName} ${y}`;
};

// ─── Resolve Hotel Owner WhatsApp Number ──────────────────────────────────────

/**
 * Resolves and normalizes the hotel owner's WhatsApp number.
 * Scoped strictly to hotel_id.
 *
 * Precedence:
 *   1. hotel_settings.whatsapp_number
 *   2. hotels.mobile
 *   3. hotel_settings.phone
 *   4. hotel_settings.manager_mobile
 */
export const resolveHotelOwnerWhatsApp = async (hotelId) => {
  if (!hotelId) return { valid: false, error: 'hotelId is required' };

  try {
    const [{ data: hotel }, { data: settings }] = await Promise.all([
      supabase.from('hotels').select('id, hotel_name, mobile, owner_name').eq('id', hotelId).maybeSingle(),
      supabase.from('hotel_settings').select('id, hotel_name, whatsapp_number, phone, manager_mobile').eq('id', hotelId).maybeSingle(),
    ]);

    const hotelName = settings?.hotel_name || hotel?.hotel_name || 'Hotel Property';
    const ownerName = hotel?.owner_name || '';

    const candidates = [
      { num: settings?.whatsapp_number, source: 'hotel_settings.whatsapp_number' },
      { num: hotel?.mobile, source: 'hotels.mobile' },
      { num: settings?.phone, source: 'hotel_settings.phone' },
      { num: settings?.manager_mobile, source: 'hotel_settings.manager_mobile' },
    ];

    for (const cand of candidates) {
      if (cand.num && typeof cand.num === 'string' && cand.num.trim()) {
        const norm = normalizeWhatsAppPhone(cand.num);
        if (norm.valid) {
          return {
            valid: true,
            phone: norm.normalized,
            formattedPhone: `+${norm.normalized}`,
            rawPhone: cand.num,
            source: cand.source,
            hotelName,
            ownerName,
          };
        }
      }
    }

    return {
      valid: false,
      error: 'No valid owner WhatsApp number configured for this hotel.',
      hotelName,
      ownerName,
    };
  } catch (err) {
    console.error('[DAILY_SUMMARY] resolveHotelOwnerWhatsApp error:', err.message);
    return { valid: false, error: err.message };
  }
};

// ─── Calculate Daily Summary ──────────────────────────────────────────────────

/**
 * Computes authoritative daily summary metrics for a hotel and business date.
 *
 * @param {Object} params
 * @param {string} params.hotelId - Hotel UUID
 * @param {string} params.businessDate - YYYY-MM-DD
 * @returns {Promise<Object>} Comprehensive summary object
 */
export const calculateDailySummary = async ({ hotelId, businessDate }) => {
  if (!hotelId || !businessDate) {
    throw new Error('hotelId and businessDate are required');
  }

  // 1. Fetch hotel metadata, rooms, settings, and day close status
  const [
    { data: hotel },
    { data: settings },
    { data: rooms },
    { data: reservations },
    { data: roomChartEntries },
    { data: otherDaily },
    { data: dayClose },
    { data: timelineEvents },
  ] = await Promise.all([
    supabase.from('hotels').select('*').eq('id', hotelId).maybeSingle(),
    supabase.from('hotel_settings').select('*').eq('id', hotelId).maybeSingle(),
    supabase.from('rooms').select('*').eq('hotel_id', hotelId).eq('is_active', true),
    supabase.from('reservations').select('*').eq('hotel_id', hotelId),
    supabase.from('room_chart_entries').select('*').eq('hotel_id', hotelId),
    supabase.from('other_daily_entries').select('*').eq('hotel_id', hotelId).eq('report_date', businessDate).maybeSingle(),
    supabase.from('day_close_records').select('*').eq('hotel_id', hotelId).eq('business_date', businessDate).eq('status', 'closed').maybeSingle(),
    supabase.from('booking_timeline').select('*').eq('hotel_id', hotelId),
  ]);

  const hotelName = settings?.hotel_name || hotel?.hotel_name || 'Hotel Property';
  const totalRooms = rooms && rooms.length > 0
    ? rooms.length
    : (settings?.total_rooms || hotel?.total_rooms || 20);

  const resList = reservations || [];
  const chartList = roomChartEntries || [];

  // ─── 2. Front Office & Stay Aggregation ──────────────────────────────────────
  // Date filtering using the authoritative businessDate
  const targetDate = businessDate.slice(0, 10);

  // Active reservations on businessDate (checkIn <= targetDate && checkOut > targetDate)
  // Checkout day is departure day, NOT an occupied night.
  const activeReservations = resList.filter((r) => {
    const ci = (r.check_in_date || '').slice(0, 10);
    const co = (r.check_out_date || '').slice(0, 10);
    if (!ci || !co) return false;
    const status = (r.status || '').toLowerCase();
    if (status === 'cancelled' || status === 'no_show') return false;
    return ci <= targetDate && co > targetDate;
  });

  // Stays in room_chart_entries on businessDate
  const activeChartEntries = chartList.filter((e) => {
    const arr = (e.arrival || e.report_date || '').slice(0, 10);
    const dep = (e.departure || e.report_date || '').slice(0, 10);
    if (e.report_date === targetDate && (!e.arrival || !e.departure)) return true;
    return arr <= targetDate && dep > targetDate;
  });

  // Unified occupied rooms tracking to prevent double-counting
  const occupiedRoomSet = new Set();
  const occupiedStays = [];

  // Track room chart entries first
  for (const entry of activeChartEntries) {
    const roomKey = entry.room_no ? String(entry.room_no).trim() : `chart_${entry.id}`;
    occupiedRoomSet.add(roomKey);
    occupiedStays.push({
      type: 'chart',
      roomNo: entry.room_no || 'Unassigned',
      guestName: entry.guest_name || 'Guest',
      rate: toNum(entry.room_rate || entry.total),
      source: entry.company || entry.source_category || 'Direct',
      payCash: toNum(entry.pay_cash),
      payUpi: toNum(entry.pay_upi),
      payCard: toNum(entry.pay_card),
      payBank: toNum(entry.pay_bank),
      payAdvance: toNum(entry.pay_advance),
      payBalance: toNum(entry.pay_balance),
      reservationId: entry.reservation_id,
    });
  }

  // Add reservations that aren't already represented in room_chart_entries
  for (const res of activeReservations) {
    const roomKey = res.room_no && res.room_no !== 'TBD' && res.room_no !== 'Unassigned'
      ? String(res.room_no).trim()
      : null;

    // Check if linked or same room already recorded
    const isAlreadyPresent = occupiedStays.some(
      (s) => (s.reservationId && s.reservationId === res.id) || (roomKey && s.roomNo === roomKey)
    );

    if (!isAlreadyPresent) {
      if (roomKey) occupiedRoomSet.add(roomKey);
      else occupiedRoomSet.add(`res_${res.id}`);

      const nights = Math.max(1, toNum(res.nights) || 1);
      const dailyRate = toNum(res.rate) || (toNum(res.invoice_total) / nights);

      occupiedStays.push({
        type: 'reservation',
        roomNo: res.room_no || 'Unassigned',
        guestName: res.guest_name || 'Guest',
        rate: dailyRate,
        source: res.source_name || res.source_category || 'Direct',
        payCash: toNum(res.pay_cash),
        payUpi: toNum(res.pay_upi),
        payCard: toNum(res.pay_card),
        payBank: toNum(res.pay_bank),
        payAdvance: toNum(res.advance_paid),
        payBalance: Math.max(0, toNum(res.invoice_total) - (toNum(res.advance_paid) + toNum(res.pay_cash) + toNum(res.pay_upi) + toNum(res.pay_card) + toNum(res.pay_bank))),
        reservationId: res.id,
      });
    }
  }

  const occupiedCount = occupiedRoomSet.size;
  const vacantCount = Math.max(0, totalRooms - occupiedCount);
  const occupancyPercent = totalRooms > 0 ? (occupiedCount / totalRooms) * 100 : 0;

  // ─── 3. Arrivals & Departures ───────────────────────────────────────────────
  const arrivalsList = resList.filter((r) => {
    const ci = (r.check_in_date || '').slice(0, 10);
    const status = (r.status || '').toLowerCase();
    return ci === targetDate && status !== 'cancelled' && status !== 'no_show';
  });

  const departuresList = resList.filter((r) => {
    const co = (r.check_out_date || '').slice(0, 10);
    const status = (r.status || '').toLowerCase();
    return co === targetDate && status !== 'cancelled' && status !== 'no_show';
  });

  const pendingCheckins = arrivalsList.filter((r) => (r.status || '').toLowerCase() === 'confirmed').length;
  const pendingCheckouts = departuresList.filter((r) => (r.status || '').toLowerCase() === 'checked_in').length;
  const inHouseGuests = occupiedCount;

  // ─── 4. Room Status Breakdown ───────────────────────────────────────────────
  let outOfOrderCount = 0;
  let blockedCount = 0;
  if (rooms && rooms.length > 0) {
    outOfOrderCount = rooms.filter((rm) => (rm.room_status || '').toLowerCase().includes('order') || (rm.room_status || '').toLowerCase().includes('maintenance')).length;
    blockedCount = rooms.filter((rm) => (rm.room_status || '').toLowerCase().includes('block')).length;
  }
  const availableCount = Math.max(0, totalRooms - occupiedCount - outOfOrderCount - blockedCount);

  // ─── 5. Revenue Calculation ─────────────────────────────────────────────────
  // Room revenue belongs strictly to the occupied night on businessDate
  const nightlyRevenues = generateAuthoritativeNightlyRevenue({
    hotelId,
    reservations: resList,
    roomChartEntries: chartList,
    fromDate: targetDate,
    toDate: targetDate,
  });
  const roomRevenue = nightlyRevenues.reduce((sum, nr) => sum + toNum(nr.gross_room_revenue), 0);
  const kitchenRevenue = toNum(otherDaily?.kitchen);
  const otherIncome = toNum(otherDaily?.other_income);
  const otherRevenue = kitchenRevenue + otherIncome;
  const grossRevenue = roomRevenue + otherRevenue;

  // ─── 6. Collection Calculation ──────────────────────────────────────────────
  // Collections made on businessDate (strictly by actual payment transaction date)
  const paymentTransactions = reconcilePaymentLedger({
    timelineEvents: timelineEvents || [],
    reservations: resList,
    roomChartEntries: chartList,
    hotelId,
  });

  let cashCollection = 0;
  let digitalCollection = 0;
  let otaCollection = 0;
  let pendingDue = 0;

  for (const tx of paymentTransactions) {
    if (tx.payment_date !== targetDate) continue;
    if (tx.status !== 'successful') continue;
    const amt = toNum(tx.amount);
    switch (tx.payment_method) {
      case 'Cash':
        cashCollection += amt;
        break;
      case 'UPI':
      case 'Card':
      case 'Bank':
      case 'Gateway':
      case 'Cheque':
        digitalCollection += amt;
        break;
      case 'OTA':
        otaCollection += amt;
        break;
      default:
        cashCollection += amt;
    }
  }

  // Pending balance for active/departing stays
  for (const s of occupiedStays) {
    pendingDue += toNum(s.payBalance);
  }

  const totalCollection = cashCollection + digitalCollection + otaCollection;

  // ─── 7. Performance (ADR & RevPAR) ──────────────────────────────────────────
  const adr = occupiedCount > 0 ? roomRevenue / occupiedCount : 0;
  const revpar = totalRooms > 0 ? roomRevenue / totalRooms : 0;

  // ─── 8. Orders & OTA Breakdown ──────────────────────────────────────────────
  const otaChannelCounts = {};
  let totalOtaBookings = 0;
  let totalOtaRevenue = 0;

  for (const r of resList) {
    const ci = (r.check_in_date || '').slice(0, 10);
    const co = (r.check_out_date || '').slice(0, 10);
    const isActiveOrNew = (ci <= targetDate && co > targetDate) || ci === targetDate;
    if (!isActiveOrNew) continue;

    const sourceCat = (r.source_category || '').toLowerCase();
    const sourceName = r.source_name || r.booking_source || '';
    const isOta = sourceCat.includes('ota') ||
      /booking\.com|makemytrip|agoda|goibibo|airbnb|expedia/i.test(sourceName) ||
      /booking\.com|makemytrip|agoda|goibibo|airbnb|expedia/i.test(r.remarks || '');

    if (isOta) {
      let channel = 'Other OTAs';
      const combined = `${sourceName} ${r.remarks || ''}`.toLowerCase();
      if (combined.includes('booking.com')) channel = 'Booking.com';
      else if (combined.includes('makemytrip')) channel = 'MakeMyTrip';
      else if (combined.includes('agoda')) channel = 'Agoda';
      else if (combined.includes('goibibo')) channel = 'Goibibo';
      else if (combined.includes('airbnb')) channel = 'Airbnb';
      else if (combined.includes('expedia')) channel = 'Expedia';
      else if (sourceName.trim()) channel = sourceName.trim();

      otaChannelCounts[channel] = (otaChannelCounts[channel] || 0) + 1;
      totalOtaBookings += 1;
      totalOtaRevenue += toNum(r.rate) || toNum(r.invoice_total);
    }
  }

  // ─── 9. Attention Items ─────────────────────────────────────────────────────
  const unassignedCount = activeReservations.filter(
    (r) => !r.room_no || r.room_no === 'TBD' || r.room_no === 'Unassigned' || r.room_no === '0'
  ).length;

  const pendingPaymentsCount = occupiedStays.filter((s) => s.payBalance > 0).length;

  // Day status
  const dayStatus = dayClose ? 'CLOSED' : 'OPEN';

  // Check if hotel genuinely has no activity
  const hasData = occupiedCount > 0 ||
    arrivalsList.length > 0 ||
    departuresList.length > 0 ||
    roomRevenue > 0 ||
    totalCollection > 0 ||
    activeReservations.length > 0;

  return {
    hotelId,
    hotelName,
    businessDate,
    businessDateReadable: formatDateReadable(businessDate),
    hasData,
    dayStatus,

    // Inventory & Occupancy
    occupancy: {
      totalRooms,
      occupied: occupiedCount,
      vacant: vacantCount,
      percentage: Number(occupancyPercent.toFixed(1)),
    },

    // Front Office
    frontOffice: {
      arrivals: arrivalsList.length,
      departures: departuresList.length,
      inHouse: inHouseGuests,
      pendingCheckins,
      pendingCheckouts,
    },

    // Revenue
    revenue: {
      roomRevenue,
      otherRevenue,
      grossRevenue,
    },

    // Collection
    collection: {
      cash: cashCollection,
      digital: digitalCollection,
      ota: otaCollection,
      total: totalCollection,
      pendingDue,
    },

    // Room Status
    roomStatus: {
      available: availableCount,
      occupied: occupiedCount,
      outOfOrder: outOfOrderCount,
      blocked: blockedCount,
    },

    // Performance
    performance: {
      adr: Math.round(adr),
      revpar: Math.round(revpar),
    },

    // OTA Breakdown
    ota: {
      channels: otaChannelCounts,
      totalBookings: totalOtaBookings,
      totalRevenue: totalOtaRevenue,
    },

    // Operational Attention
    attention: {
      unassignedRooms: unassignedCount,
      pendingPaymentsCount,
      pendingPaymentsAmount: pendingDue,
    },
  };
};

// ─── Report Formatters ────────────────────────────────────────────────────────

/**
 * 1. Daily Hotel Summary (Full Overview)
 */
export const buildDailySummaryText = (s) => {
  const otaEntries = Object.entries(s.ota.channels);
  const otaSection = otaEntries.length > 0
    ? [
        '',
        '━━━━━━━━━━━━━━━━',
        '',
        '📡 OTA BOOKINGS',
        ...otaEntries.map(([ch, cnt]) => `${ch}: ${cnt}`),
        `Total OTA Bookings: ${s.ota.totalBookings}`,
      ]
    : [
        '',
        '━━━━━━━━━━━━━━━━',
        '',
        '📡 OTA BOOKINGS',
        'Total OTA Bookings: 0',
      ];

  const attentionItems = [];
  if (s.attention.unassignedRooms > 0) {
    attentionItems.push(`• Unassigned Rooms: ${s.attention.unassignedRooms}`);
  }
  if (s.attention.pendingPaymentsCount > 0) {
    attentionItems.push(`• Pending Payments: ${s.attention.pendingPaymentsCount} (${fmtMoney(s.attention.pendingPaymentsAmount)})`);
  }
  if (s.frontOffice.pendingCheckins > 0) {
    attentionItems.push(`• Pending Check-ins: ${s.frontOffice.pendingCheckins}`);
  }
  if (s.frontOffice.pendingCheckouts > 0) {
    attentionItems.push(`• Pending Check-outs: ${s.frontOffice.pendingCheckouts}`);
  }

  const attentionSection = attentionItems.length > 0
    ? [
        '',
        '━━━━━━━━━━━━━━━━',
        '',
        '⚠️ ATTENTION',
        ...attentionItems,
      ]
    : [
        '',
        '━━━━━━━━━━━━━━━━',
        '',
        '⚠️ ATTENTION',
        'All rooms assigned and operations on track.',
      ];

  const lines = [
    '🏨 *HOTEL MANTRI*',
    '📊 *DAILY HOTEL SUMMARY*',
    '',
    `Hotel: *${s.hotelName}*`,
    `Business Date: *${s.businessDateReadable}*`,
    `Day Status: *${s.dayStatus}*`,
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    '🏠 *OCCUPANCY*',
    `Total Rooms: ${fmtInt(s.occupancy.totalRooms)}`,
    `Occupied: ${fmtInt(s.occupancy.occupied)}`,
    `Vacant: ${fmtInt(s.occupancy.vacant)}`,
    `Occupancy: *${s.occupancy.percentage}%*`,
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    '🛎️ *FRONT OFFICE*',
    `Arrivals: ${s.frontOffice.arrivals}`,
    `Departures: ${s.frontOffice.departures}`,
    `In-House Guests: ${s.frontOffice.inHouse}`,
    `Pending Check-ins: ${s.frontOffice.pendingCheckins}`,
    `Pending Check-outs: ${s.frontOffice.pendingCheckouts}`,
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    '💰 *REVENUE*',
    `Room Revenue: *${fmtMoney(s.revenue.roomRevenue)}*`,
    `Other Revenue: ${fmtMoney(s.revenue.otherRevenue)}`,
    `Gross Revenue: *${fmtMoney(s.revenue.grossRevenue)}*`,
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    '💳 *COLLECTION*',
    `Cash: ${fmtMoney(s.collection.cash)}`,
    `Digital/UPI/Bank: ${fmtMoney(s.collection.digital)}`,
    `OTA Collection: ${fmtMoney(s.collection.ota)}`,
    `Total Collection: *${fmtMoney(s.collection.total)}*`,
    `Pending / Due: *${fmtMoney(s.collection.pendingDue)}*`,
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    '🛏️ *ROOM STATUS*',
    `Available: ${s.roomStatus.available}`,
    `Occupied: ${s.roomStatus.occupied}`,
    `Out of Order: ${s.roomStatus.outOfOrder}`,
    `Blocked: ${s.roomStatus.blocked}`,
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    '📈 *PERFORMANCE*',
    `ADR: ${fmtMoney(s.performance.adr)}`,
    `RevPAR: ${fmtMoney(s.performance.revpar)}`,
    ...otaSection,
    ...attentionSection,
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    'Generated by *Hotel Mantri*',
  ];

  return lines.join('\n');
};

/**
 * 2. Morning Summary (Owner Morning Briefing)
 */
export const buildMorningSummaryText = (s) => {
  const lines = [
    `☀️ *GOOD MORNING — ${s.hotelName.toUpperCase()}*`,
    '',
    `Business Date: *${s.businessDateReadable}*`,
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    `Today's Arrivals: *${s.frontOffice.arrivals}*`,
    `Today's Departures: *${s.frontOffice.departures}*`,
    `In-House: *${s.frontOffice.inHouse}*`,
    '',
    `Occupancy: *${s.occupancy.percentage}%* (${s.occupancy.occupied}/${s.occupancy.totalRooms} rooms)`,
    '',
    `Expected Room Revenue: *${fmtMoney(s.revenue.roomRevenue)}*`,
    `Expected Collection: *${fmtMoney(s.collection.total)}*`,
    `Pending Payments: *${fmtMoney(s.collection.pendingDue)}*`,
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    '⚠️ *Operational Attention:*',
    s.attention.unassignedRooms > 0
      ? `• ${s.attention.unassignedRooms} unassigned room(s)`
      : '• All arriving rooms assigned',
    s.attention.pendingPaymentsCount > 0
      ? `• ${s.attention.pendingPaymentsCount} pending payment(s) to collect`
      : '• No critical pending payments',
    '',
    'Have a productive day! 🏨',
    'Powered by *Hotel Mantri*',
  ];

  return lines.join('\n');
};

/**
 * 3. Evening / Closing Summary
 */
export const buildEveningSummaryText = (s) => {
  const lines = [
    `🌙 *DAILY CLOSING SUMMARY*`,
    `Hotel: *${s.hotelName}*`,
    `Business Date: *${s.businessDateReadable}*`,
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    `Occupancy: *${s.occupancy.percentage}%* (${s.occupancy.occupied}/${s.occupancy.totalRooms} rooms)`,
    '',
    '💰 *REVENUE*',
    `Room Revenue: ${fmtMoney(s.revenue.roomRevenue)}`,
    `Other Revenue: ${fmtMoney(s.revenue.otherRevenue)}`,
    `Gross Revenue: *${fmtMoney(s.revenue.grossRevenue)}*`,
    '',
    '💳 *COLLECTIONS*',
    `Cash: ${fmtMoney(s.collection.cash)}`,
    `Digital: ${fmtMoney(s.collection.digital)}`,
    `OTA: ${fmtMoney(s.collection.ota)}`,
    `Total Collection: *${fmtMoney(s.collection.total)}*`,
    `Pending / Due: *${fmtMoney(s.collection.pendingDue)}*`,
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    `Check-ins Completed: *${s.frontOffice.arrivals - s.frontOffice.pendingCheckins}*`,
    `Check-outs Completed: *${s.frontOffice.departures - s.frontOffice.pendingCheckouts}*`,
    `Day Status: *${s.dayStatus}*`,
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    'Generated by *Hotel Mantri*',
  ];

  return lines.join('\n');
};

/**
 * 4. OTA Summary
 */
export const buildOtaSummaryText = (s) => {
  const otaEntries = Object.entries(s.ota.channels);
  const channelsList = otaEntries.length > 0
    ? otaEntries.map(([ch, cnt]) => `${ch}: *${cnt}*`)
    : ['No active OTA bookings for this date.'];

  const lines = [
    '📡 *OTA CHANNELS SUMMARY*',
    `Hotel: *${s.hotelName}*`,
    `Business Date: *${s.businessDateReadable}*`,
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    ...channelsList,
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    `Total OTA Bookings: *${s.ota.totalBookings}*`,
    `OTA Revenue: *${fmtMoney(s.ota.totalRevenue)}*`,
    '',
    'Powered by *Hotel Mantri*',
  ];

  return lines.join('\n');
};

/**
 * Test WhatsApp Message
 */
export const buildTestWhatsAppText = (hotelName) => {
  return [
    '🏨 *Hotel Mantri*',
    '',
    'This is a test WhatsApp notification from Hotel Mantri.',
    '',
    `Hotel: *${hotelName || 'Hotel Property'}*`,
    '',
    '✓ WhatsApp notifications are configured successfully.',
  ].join('\n');
};

/**
 * New OTA Reservation Alert
 */
export const buildOtaReservationWhatsAppText = ({
  hotelName,
  reservation,
  otaBookingId,
  bookingSource,
  viewUrl = '',
}) => {
  const checkIn = reservation.check_in_date || '';
  const checkOut = reservation.check_out_date || '';
  const nights = Math.max(1, toNum(reservation.nights) || 1);
  const guestName = reservation.guest_name || 'Guest';
  const roomCategory = reservation.rate_plan || reservation.room_category || 'Standard';
  const amount = toNum(reservation.invoice_total) || toNum(reservation.rate);
  const paymentMode = reservation.payment_mode || 'OTA';

  const lines = [
    '🔔 *NEW OTA RESERVATION*',
    '',
    `Hotel: *${hotelName || 'Hotel'}*`,
    '',
    `Guest: *${guestName}*`,
    `Booking ID: *${otaBookingId || reservation.remarks || 'OTA-BOOKING'}*`,
    `Source: *${bookingSource || reservation.source_name || 'OTA'}*`,
    '',
    `Check-in: ${formatDateReadable(checkIn)}`,
    `Check-out: ${formatDateReadable(checkOut)}`,
    `Nights: ${nights}`,
    '',
    `Room: ${roomCategory}`,
    `Room No: ${reservation.room_no || 'Unassigned'}`,
    '',
    `Amount: *${fmtMoney(amount)}*`,
    `Payment: ${paymentMode}`,
    `Status: *Confirmed*`,
    ...(viewUrl ? ['', `View reservation: ${viewUrl}`] : []),
    '',
    'Powered by *Hotel Mantri*',
  ];

  return lines.join('\n');
};

export default {
  resolveHotelOwnerWhatsApp,
  calculateDailySummary,
  buildDailySummaryText,
  buildMorningSummaryText,
  buildEveningSummaryText,
  buildOtaSummaryText,
  buildTestWhatsAppText,
  buildOtaReservationWhatsAppText,
};
