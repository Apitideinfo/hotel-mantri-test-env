/**
 * HOTEL MANTRI — Day-Wise Revenue & Historical Accounting API Routes
 * 
 * Provides:
 * - GET /api/revenue/day-wise
 * - GET /api/revenue/reservations-breakdown
 */

import express from 'express';
import { requireHotelAccess as checkAuth } from '../middleware/auth.js';
import { calculateDayWiseRevenue } from '../services/RevenueCalculationService.js';

const router = express.Router();

/**
 * GET /api/revenue/day-wise
 * Fetches authoritative earned revenue, collections, ARR, RevPAR, and daily breakdown.
 */
router.get('/day-wise', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    if (!hotelId) {
      return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.' });
    }

    const { date, startDate, endDate, month, year } = req.query;

    const data = await calculateDayWiseRevenue({
      hotelId,
      date,
      startDate,
      endDate,
      month: month ? parseInt(month, 10) : undefined,
      year: year ? parseInt(year, 10) : undefined,
    });

    return res.json({
      success: true,
      ...data,
    });
  } catch (err) {
    console.error('[RevenueAPI /day-wise] Error:', err);
    return res.status(500).json({
      success: false,
      code: 'REVENUE_CALCULATION_ERROR',
      message: err.message || 'Failed to calculate day-wise revenue.',
    });
  }
});

/**
 * GET /api/revenue/reservations-breakdown
 * Returns the exact reservations that generated room revenue on a specific date.
 */
router.get('/reservations-breakdown', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    if (!hotelId) {
      return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.' });
    }

    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, code: 'DATE_REQUIRED', message: 'Date parameter is required (YYYY-MM-DD).' });
    }

    const data = await calculateDayWiseRevenue({
      hotelId,
      date,
    });

    return res.json({
      success: true,
      date: data.period.date,
      summary: data.summary,
      reservations: data.reservationsBreakdown,
    });
  } catch (err) {
    console.error('[RevenueAPI /reservations-breakdown] Error:', err);
    return res.status(500).json({
      success: false,
      code: 'RESERVATION_BREAKDOWN_ERROR',
      message: err.message || 'Failed to retrieve reservation breakdown for date.',
    });
  }
});

// Alias root GET to /day-wise
router.get('/', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    if (!hotelId) {
      return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.' });
    }

    const { date, startDate, endDate, month, year } = req.query;

    const data = await calculateDayWiseRevenue({
      hotelId,
      date,
      startDate,
      endDate,
      month: month ? parseInt(month, 10) : undefined,
      year: year ? parseInt(year, 10) : undefined,
    });

    return res.json({
      success: true,
      ...data,
    });
  } catch (err) {
    console.error('[RevenueAPI /] Error:', err);
    return res.status(500).json({
      success: false,
      code: 'REVENUE_CALCULATION_ERROR',
      message: err.message || 'Failed to calculate day-wise revenue.',
    });
  }
});

export default router;
