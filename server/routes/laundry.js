/**
 * HOTEL MANTRI — LAUNDRY & LINEN API ROUTES
 * 
 * Express routes mounting authoritative server-side laundry operations:
 * - /api/laundry/dashboard
 * - /api/laundry/linen-items
 * - /api/laundry/stock-movements
 * - /api/laundry/vendors
 * - /api/laundry/vendor-rates
 * - /api/laundry/dispatches
 * - /api/laundry/receive
 * - /api/laundry/resolve
 * - /api/laundry/bills/calculate
 * - /api/laundry/bills/generate
 * - /api/laundry/bills/approve
 * - /api/laundry/payments
 * - /api/laundry/vendor-ledger
 * - /api/laundry/statement
 * - /api/laundry/statement/whatsapp
 */

import express from 'express';
import { requireHotelAccess as checkAuth } from '../middleware/auth.js';
import laundryService from '../services/laundryService.js';

const router = express.Router();

// ── 1. Composite Dashboard ───────────────────────────────────────────────────
router.get('/dashboard', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { date } = req.query;
    const data = await laundryService.getExecutiveDashboard(hotelId, date);
    return res.json({ success: true, ...data });
  } catch (err) {
    console.error('[LaundryAPI /dashboard] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── 2. Linen Items Master ─────────────────────────────────────────────────────
router.get('/linen-items', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const items = await laundryService.getLinenItemsWithStock(hotelId);
    return res.json({ success: true, items });
  } catch (err) {
    console.error('[LaundryAPI /linen-items] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/linen-items', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const userId = req.user?.id || req.auth?.userId;
    const item = await laundryService.saveLinenItem(hotelId, req.body, userId);
    return res.json({ success: true, item });
  } catch (err) {
    console.error('[LaundryAPI POST /linen-items] Error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/linen-items/seed-defaults', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const userId = req.user?.id || req.auth?.userId;
    const created = await laundryService.seedStandardLinenItems(hotelId, userId);
    return res.json({ success: true, created, count: created.length });
  } catch (err) {
    console.error('[LaundryAPI POST /linen-items/seed-defaults] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── 3. Stock Movements & Ledger ──────────────────────────────────────────────
router.get('/stock-movements', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { linen_item_id, fromDate, toDate, limit } = req.query;
    const movements = await laundryService.getStockMovements(hotelId, {
      linen_item_id,
      fromDate,
      toDate,
      limit: limit ? parseInt(limit, 10) : 100,
    });
    return res.json({ success: true, movements });
  } catch (err) {
    console.error('[LaundryAPI /stock-movements] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/stock-movements', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const userId = req.user?.id || req.auth?.userId;
    const movement = await laundryService.recordStockMovement(hotelId, req.body, userId);
    return res.json({ success: true, movement });
  } catch (err) {
    console.error('[LaundryAPI POST /stock-movements] Error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── 4. Vendors & Rates ────────────────────────────────────────────────────────
router.get('/vendors', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const vendors = await laundryService.getVendors(hotelId);
    return res.json({ success: true, vendors });
  } catch (err) {
    console.error('[LaundryAPI /vendors] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/vendors', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const vendor = await laundryService.saveVendor(hotelId, req.body);
    return res.json({ success: true, vendor });
  } catch (err) {
    console.error('[LaundryAPI POST /vendors] Error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/vendor-rates', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { vendor_id } = req.query;
    if (!vendor_id) return res.status(400).json({ success: false, error: 'Vendor ID is required.' });
    const rates = await laundryService.getVendorRates(hotelId, vendor_id);
    return res.json({ success: true, rates });
  } catch (err) {
    console.error('[LaundryAPI /vendor-rates] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/vendor-rates', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const rate = await laundryService.saveVendorRate(hotelId, req.body);
    return res.json({ success: true, rate });
  } catch (err) {
    console.error('[LaundryAPI POST /vendor-rates] Error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── 5. Dispatches ─────────────────────────────────────────────────────────────
router.post('/dispatches', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const userId = req.user?.id || req.auth?.userId;
    const dispatch = await laundryService.createDispatch(hotelId, req.body, userId);
    return res.json({ success: true, dispatch });
  } catch (err) {
    console.error('[LaundryAPI POST /dispatches] Error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── 6. Receiving & Invariant Enforcement ──────────────────────────────────────
router.post('/receive', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const userId = req.user?.id || req.auth?.userId;
    const result = await laundryService.receiveLaundry(hotelId, req.body, userId);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[LaundryAPI POST /receive] Error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── 7. Resolve Pending / Lost / Damaged ───────────────────────────────────────
router.post('/resolve', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const userId = req.user?.id || req.auth?.userId;
    const result = await laundryService.resolvePendingLinen(hotelId, req.body, userId);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[LaundryAPI POST /resolve] Error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── 8. Billing & Finance Sync ─────────────────────────────────────────────────
router.get('/bills/calculate', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { vendor_id, date } = req.query;
    if (!vendor_id || !date) {
      return res.status(400).json({ success: false, error: 'Vendor ID and date are required.' });
    }
    const preview = await laundryService.calculateDailyBill(hotelId, vendor_id, date);
    return res.json({ success: true, preview });
  } catch (err) {
    console.error('[LaundryAPI /bills/calculate] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/bills/generate', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const userId = req.user?.id || req.auth?.userId;
    const bill = await laundryService.createOrUpdateDailyBill(hotelId, req.body, userId);
    return res.json({ success: true, bill });
  } catch (err) {
    console.error('[LaundryAPI POST /bills/generate] Error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/bills/approve', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const userId = req.user?.id || req.auth?.userId;
    const { bill_id } = req.body;
    if (!bill_id) return res.status(400).json({ success: false, error: 'Bill ID is required.' });

    const approvedBill = await laundryService.approveLaundryBill(hotelId, bill_id, userId);
    return res.json({ success: true, bill: approvedBill, message: 'Bill approved and synced to Finance.' });
  } catch (err) {
    console.error('[LaundryAPI POST /bills/approve] Error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── 9. Vendor Ledger & Payments ───────────────────────────────────────────────
router.post('/payments', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const userId = req.user?.id || req.auth?.userId;
    const payment = await laundryService.recordVendorPayment(hotelId, req.body, userId);
    return res.json({ success: true, payment });
  } catch (err) {
    console.error('[LaundryAPI POST /payments] Error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/vendor-ledger', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { vendor_id, fromDate, toDate } = req.query;
    if (!vendor_id) return res.status(400).json({ success: false, error: 'Vendor ID is required.' });

    const ledger = await laundryService.getVendorLedger(hotelId, vendor_id, { fromDate, toDate });
    return res.json({ success: true, ledger });
  } catch (err) {
    console.error('[LaundryAPI /vendor-ledger] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── 10. Daily Statement & WhatsApp ────────────────────────────────────────────
router.get('/statement', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const { vendor_id, date } = req.query;
    if (!vendor_id || !date) {
      return res.status(400).json({ success: false, error: 'Vendor ID and date are required.' });
    }

    const statement = await laundryService.generateDailyStatement(hotelId, vendor_id, date);
    return res.json({ success: true, statement });
  } catch (err) {
    console.error('[LaundryAPI /statement] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/statement/whatsapp', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    const userId = req.user?.id || req.auth?.userId;
    const result = await laundryService.sendDailyWhatsAppStatement(hotelId, req.body, userId);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[LaundryAPI POST /statement/whatsapp] Error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
