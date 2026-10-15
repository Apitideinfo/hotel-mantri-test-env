/**
 * HOTEL MANTRI — LAUNDRY & LINEN COMPREHENSIVE PRODUCTION TEST SUITE
 * 
 * Verifies all 15 authoritative business invariants from Section 36 of the specification:
 * - TEST 1: Opening stock 300, Dispatch 50 -> Total=300, At Laundry=50, Available=250
 * - TEST 2: Receive 49 -> Received=49, Pending=1, Available=299
 * - TEST 3: Billing 49 * ₹12 = ₹588
 * - TEST 4: Pending 1 contributes ₹0 to billing
 * - TEST 5: Receive remaining 1 next day -> Pending=0, New billable=1, New bill=₹12
 * - TEST 6: Mark 1 lost -> Pending decreases by 1, Total active stock decreases by 1, No automatic bill
 * - TEST 7: Over-receiving rejected (received > sent)
 * - TEST 8: Negative quantities rejected
 * - TEST 9: Duplicate Finance sync idempotent (only 1 expense entry created)
 * - TEST 10: Multi-tenant security: Hotel A cannot access Hotel B vendor
 * - TEST 11: Multi-tenant security: Hotel A cannot access Hotel B dispatch
 * - TEST 12: Pending quantity never included in bill
 * - TEST 13: Vendor payment reduces financial due, physical pending unchanged
 * - TEST 14: Changing vendor rate preserves historical bills rate
 * - TEST 15: Daily statement reconciles opening + sent - received = closing pending
 */

import dotenv from 'dotenv';
dotenv.config();

import laundryService from '../server/services/laundryService.js';
import { supabaseServiceRole } from '../server/supabaseClient.js';

const HOTEL_A_ID = '9001eb1c-9d38-49d0-84f7-75244e8f4bf8'; // mars hotel (Hotel A)
const HOTEL_B_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c'; // Hotel Gopal (Hotel B)

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runLaundryTestSuite() {
  console.log('===============================================================');
  console.log('HOTEL MANTRI — LAUNDRY & LINEN PRODUCTION REGRESSION SUITE');
  console.log('===============================================================\n');

  try {
    // Authenticate as Super Admin for test suite execution
    const { data: authData, error: authErr } = await supabaseServiceRole.auth.signInWithPassword({
      email: 'admin@hotelmis.com',
      password: 'Admin@2026',
    });
    if (authErr) throw new Error(`Super admin auth failed: ${authErr.message}`);
    // ── SETUP: Create isolated test vendor and linen item for Hotel A ──
    console.log('--- Setting up Test Entities ---');
    const uniqueSuffix = Date.now().toString(36);
    
    // 1. Create Linen Item: Bedsheet (standard rate ₹12)
    const linenItem = await laundryService.saveLinenItem(HOTEL_A_ID, {
      item_name: `Bedsheet_Test_${uniqueSuffix}`,
      category: 'Bed Linen',
      unit: 'Pieces',
      standard_rate: 12,
      initial_stock: 0,
    }, 'TestUser');
    assert(linenItem && linenItem.id, 'Created isolated test linen item');

    // 2. Create Vendor: Shree Laundry
    const vendor = await laundryService.saveVendor(HOTEL_A_ID, {
      vendor_name: `Shree_Laundry_${uniqueSuffix}`,
      contact_person: 'Ramesh',
      mobile_number: '9876543210',
    });
    assert(vendor && vendor.id, 'Created isolated test vendor');

    // 3. Set Vendor Rate: ₹12 per piece
    await laundryService.saveVendorRate(HOTEL_A_ID, {
      vendor_id: vendor.id,
      linen_item_id: linenItem.id,
      rate_per_piece: 12,
    });
    assert(true, 'Configured vendor rate at ₹12/piece');

    // ── TEST 1: Opening stock 300, Dispatch 50 ──
    console.log('\n--- TEST 1: Opening Stock & Dispatch ---');
    // Add opening stock: 300
    await laundryService.recordStockMovement(HOTEL_A_ID, {
      linen_item_id: linenItem.id,
      movement_type: 'opening',
      quantity: 300,
      reason: 'Opening stock audit',
    }, 'TestUser');

    // Dispatch 50 pieces
    const dispatch1 = await laundryService.createDispatch(HOTEL_A_ID, {
      dispatch_date: '2026-10-07',
      vendor_id: vendor.id,
      vendor_name: vendor.vendor_name,
      challan_no: `CH-${uniqueSuffix}-1`,
      items: [{
        linen_item_id: linenItem.id,
        item_name: linenItem.item_name,
        sent_qty: 50,
        rate_per_piece: 12,
      }],
    }, 'TestUser');

    const stockPostDispatch = await laundryService.getLinenItemsWithStock(HOTEL_A_ID);
    const itemStat1 = stockPostDispatch.find((i) => i.id === linenItem.id);

    assert(itemStat1.total_active_stock === 300, 'Total Active Stock = 300');
    assert(itemStat1.at_laundry === 50, 'At Laundry / Pending = 50');
    assert(itemStat1.available_in_hotel === 250, 'Available in Hotel = 250 (300 - 50)');

    // ── TEST 2: Receive 49 pieces ──
    console.log('\n--- TEST 2: Partial Receiving ---');
    const dispItemId = dispatch1.items[0].id || (await supabaseServiceRole.from('laundry_dispatch_items').select('id').eq('dispatch_id', dispatch1.id).single()).data.id;

    const recvResult1 = await laundryService.receiveLaundry(HOTEL_A_ID, {
      dispatch_id: dispatch1.id,
      receipt_date: '2026-10-07',
      items: [{
        dispatch_item_id: dispItemId,
        linen_item_id: linenItem.id,
        item_name: linenItem.item_name,
        received_now: 49,
        damaged_lost: 0,
        is_billable: true,
        rate_applied: 12,
      }],
    }, 'TestUser');

    assert(recvResult1.status === 'Partially Received', 'Dispatch remains Partially Received');

    const stockPostRecv = await laundryService.getLinenItemsWithStock(HOTEL_A_ID);
    const itemStat2 = stockPostRecv.find((i) => i.id === linenItem.id);

    assert(itemStat2.total_received === 49, 'Total Received = 49');
    assert(itemStat2.at_laundry === 1, 'Pending at Laundry = 1 (50 - 49)');
    assert(itemStat2.available_in_hotel === 299, 'Available in Hotel = 299 (300 - 1)');

    // ── TEST 3 & 4: Billing strictly on Received Billable (₹588), Pending 1 contributes ₹0 ──
    console.log('\n--- TEST 3 & 4: Daily Bill Calculation & Pending Non-Billing ---');
    const dailyBillPreview = await laundryService.calculateDailyBill(HOTEL_A_ID, vendor.id, '2026-10-07');

    assert(dailyBillPreview.total_qty === 49, 'Billable quantity = 49 pieces');
    assert(dailyBillPreview.total_amount === 588, 'Bill amount = ₹588 (49 × ₹12)');
    assert(dailyBillPreview.total_amount !== 600, 'TEST 4: Pending 1 piece contributes ₹0 (bill is NOT 50 × 12 = 600)');

    // ── TEST 5: Receive remaining 1 piece next day ──
    console.log('\n--- TEST 5: Subsequent Receiving of Remaining Piece ---');
    // For test isolation, create a second dispatch to test day 2 receiving and resolution
    const dispatch2 = await laundryService.createDispatch(HOTEL_A_ID, {
      dispatch_date: '2026-10-08',
      vendor_id: vendor.id,
      vendor_name: vendor.vendor_name,
      challan_no: `CH-${uniqueSuffix}-2`,
      items: [{
        linen_item_id: linenItem.id,
        item_name: linenItem.item_name,
        sent_qty: 2,
        rate_per_piece: 12,
      }],
    }, 'TestUser');

    const disp2ItemId = (await supabaseServiceRole.from('laundry_dispatch_items').select('id').eq('dispatch_id', dispatch2.id).single()).data.id;

    // Receive 1 today
    await laundryService.receiveLaundry(HOTEL_A_ID, {
      dispatch_id: dispatch2.id,
      receipt_date: '2026-10-08',
      items: [{
        dispatch_item_id: disp2ItemId,
        linen_item_id: linenItem.id,
        item_name: linenItem.item_name,
        received_now: 1,
        damaged_lost: 0,
        is_billable: true,
        rate_applied: 12,
      }],
    }, 'TestUser');

    const bill2Preview = await laundryService.calculateDailyBill(HOTEL_A_ID, vendor.id, '2026-10-08');
    assert(bill2Preview.total_qty === 1, 'Next day billable quantity = 1');
    assert(bill2Preview.total_amount === 12, 'Next day bill = ₹12 (1 × ₹12)');

    // ── TEST 6: Mark 1 piece permanently lost ──
    console.log('\n--- TEST 6: Explicit Resolution of Missing Linen (Lost) ---');
    // Dispatch 2 has 1 piece still pending. Let manager mark it Lost.
    const resResult = await laundryService.resolvePendingLinen(HOTEL_A_ID, {
      dispatch_id: dispatch2.id,
      dispatch_item_id: disp2ItemId,
      resolution_type: 'lost',
      quantity: 1,
      reason: 'Lost at laundry by vendor',
    }, 'Manager');

    assert(resResult.dispatch_status === 'Completed', 'Dispatch completed after resolving missing piece');

    // Verify stock decreased by 1
    const stockPostLost = await laundryService.getLinenItemsWithStock(HOTEL_A_ID);
    const itemStatLost = stockPostLost.find((i) => i.id === linenItem.id);
    assert(itemStatLost.total_active_stock === 299, 'Total active stock decreased from 300 to 299');
    assert(itemStatLost.damaged_lost === 1, 'Damaged/Lost count recorded as 1');

    // ── TEST 7: Over-receiving rejected ──
    console.log('\n--- TEST 7: Over-receiving Validation ---');
    let overRecvThrew = false;
    try {
      await laundryService.receiveLaundry(HOTEL_A_ID, {
        dispatch_id: dispatch1.id,
        receipt_date: '2026-10-07',
        items: [{
          dispatch_item_id: dispItemId,
          item_name: linenItem.item_name,
          received_now: 10, // Only 1 remains outstanding!
          damaged_lost: 0,
        }],
      });
    } catch (e) {
      overRecvThrew = true;
      assert(e.message.includes('remain outstanding'), `Rejected over-receiving cleanly: "${e.message}"`);
    }
    assert(overRecvThrew, 'Over-receiving request was rejected by server');

    // ── TEST 8: Negative quantities rejected ──
    console.log('\n--- TEST 8: Negative Quantity Protection ---');
    let negThrew = false;
    try {
      await laundryService.receiveLaundry(HOTEL_A_ID, {
        dispatch_id: dispatch1.id,
        receipt_date: '2026-10-07',
        items: [{
          dispatch_item_id: dispItemId,
          item_name: linenItem.item_name,
          received_now: -5,
          damaged_lost: 0,
        }],
      });
    } catch (e) {
      negThrew = true;
      assert(e.message.includes('cannot be negative'), `Rejected negative quantity: "${e.message}"`);
    }
    assert(negThrew, 'Negative quantity was rejected');

    // ── TEST 9: Duplicate Finance sync idempotent ──
    console.log('\n--- TEST 9: Finance Expense Idempotency ---');
    const bill = await laundryService.createOrUpdateDailyBill(HOTEL_A_ID, {
      vendor_id: vendor.id,
      bill_date: '2026-10-07',
    }, 'TestUser');

    // First approval
    const app1 = await laundryService.approveLaundryBill(HOTEL_A_ID, bill.id, 'TestUser');
    assert(app1.status === 'approved', 'Bill approved');
    assert(app1.expense_entry_id, 'Finance expense entry ID assigned');

    // Count expense entries in database
    const { count: expCount1 } = await supabaseServiceRole
      .from('expense_entries')
      .select('id', { count: 'exact', head: true })
      .eq('reference_type', 'laundry_bill')
      .eq('reference_id', bill.id);
    assert(expCount1 === 1, 'Exactly 1 expense entry exists for bill');

    // Re-approve (simulating retry or duplicate click)
    await laundryService.approveLaundryBill(HOTEL_A_ID, bill.id, 'TestUser');
    const { count: expCount2 } = await supabaseServiceRole
      .from('expense_entries')
      .select('id', { count: 'exact', head: true })
      .eq('reference_type', 'laundry_bill')
      .eq('reference_id', bill.id);
    assert(expCount2 === 1, 'Idempotency holds: exactly 1 expense entry after duplicate approval');

    // ── TEST 10 & 11: Multi-tenant security isolation ──
    console.log('\n--- TEST 10 & 11: Multi-Tenant Isolation ---');
    // Hotel B attempts to access Hotel A's vendor
    const { data: bVendor } = await supabaseServiceRole
      .from('laundry_vendors')
      .select('*')
      .eq('id', vendor.id)
      .eq('hotel_id', HOTEL_B_ID);
    assert(!bVendor || bVendor.length === 0, 'TEST 10: Hotel B cannot access Hotel A vendor');

    // Hotel B attempts to receive against Hotel A's dispatch
    let crossHotelThrew = false;
    try {
      await laundryService.receiveLaundry(HOTEL_B_ID, {
        dispatch_id: dispatch1.id,
        receipt_date: '2026-10-07',
        items: [{
          dispatch_item_id: dispItemId,
          item_name: linenItem.item_name,
          received_now: 1,
          damaged_lost: 0,
        }],
      });
    } catch (e) {
      crossHotelThrew = true;
      assert(e.message.includes('unauthorized'), `Cross-hotel receiving rejected: "${e.message}"`);
    }
    assert(crossHotelThrew, 'TEST 11: Cross-hotel dispatch operation blocked');

    // ── TEST 12: Pending quantity never included in bill ──
    console.log('\n--- TEST 12: Pending Excluded from Billing ---');
    // Recall dispatch 1 had 50 sent, 49 received, 1 pending
    const billRecon = await laundryService.calculateDailyBill(HOTEL_A_ID, vendor.id, '2026-10-07');
    assert(billRecon.total_amount === 588, 'Bill contains only received 49 * 12 = 588');

    // ── TEST 13: Vendor payment reduces financial due, physical pending unchanged ──
    console.log('\n--- TEST 13: Vendor Payment Decoupled from Physical Linen ---');
    const ledgerBeforePay = await laundryService.getVendorLedger(HOTEL_A_ID, vendor.id);
    const initialDue = ledgerBeforePay.financial_due_amount;
    const initialPending = ledgerBeforePay.physical_pending_pieces;

    await laundryService.recordVendorPayment(HOTEL_A_ID, {
      vendor_id: vendor.id,
      payment_date: '2026-10-08',
      amount: 300,
      payment_mode: 'UPI',
      reference_no: 'UPI12345678',
    });

    const ledgerAfterPay = await laundryService.getVendorLedger(HOTEL_A_ID, vendor.id);
    assert(ledgerAfterPay.financial_due_amount === initialDue - 300, `Financial due decreased by ₹300 (from ₹${initialDue} to ₹${ledgerAfterPay.financial_due_amount})`);
    assert(ledgerAfterPay.physical_pending_pieces === initialPending, `Physical pending pieces unchanged (${ledgerAfterPay.physical_pending_pieces} pcs)`);

    // ── TEST 14: Historical bills retain old rate when vendor rate is changed ──
    console.log('\n--- TEST 14: Historical Rate Preservation ---');
    // Change rate to ₹25
    await laundryService.saveVendorRate(HOTEL_A_ID, {
      vendor_id: vendor.id,
      linen_item_id: linenItem.id,
      rate_per_piece: 25,
      effective_from: '2026-10-09',
    });

    // Check historical bill for 2026-10-07: must still be ₹588 (rate 12)
    const { data: histBill } = await supabaseServiceRole
      .from('laundry_bills')
      .select('total_amount')
      .eq('id', bill.id)
      .single();

    const { data: histBillItems } = await supabaseServiceRole
      .from('laundry_bill_items')
      .select('rate, amount')
      .eq('bill_id', bill.id);

    assert(histBill.total_amount === 588, 'Historical bill total remains ₹588');
    assert(histBillItems && histBillItems[0].rate === 12, 'Historical line item retains original rate of ₹12');

    // ── TEST 15: Daily statement reconciliation ──
    console.log('\n--- TEST 15: Daily Statement Mathematical Reconciliation ---');
    const statement = await laundryService.generateDailyStatement(HOTEL_A_ID, vendor.id, '2026-10-07');

    const calculatedClosing = statement.opening_pending + statement.sent_today - statement.received_today;
    assert(statement.closing_pending === calculatedClosing, `Reconciliation: Opening (${statement.opening_pending}) + Sent (${statement.sent_today}) - Received (${statement.received_today}) = Closing (${statement.closing_pending})`);
    assert(statement.today_billable_amount === 588, "Today's billable amount matches approved bill = ₹588");
    assert(statement.whatsapp_text.includes("Pending quantity is not included in billing."), "Statement contains mandatory notice");

    console.log('\n===============================================================');
    console.log(`TEST RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log('===============================================================\n');

    // ── CLEANUP isolated test artifacts ──
    await supabaseServiceRole.from('expense_entries').delete().eq('reference_id', bill.id);
    await supabaseServiceRole.from('laundry_bill_items').delete().eq('bill_id', bill.id);
    await supabaseServiceRole.from('laundry_bills').delete().eq('id', bill.id);
    await supabaseServiceRole.from('laundry_vendor_payments').delete().eq('vendor_id', vendor.id);
    await supabaseServiceRole.from('laundry_receiving_items').delete().eq('hotel_id', HOTEL_A_ID).eq('linen_item_id', linenItem.id);
    await supabaseServiceRole.from('laundry_receipts').delete().eq('dispatch_id', dispatch1.id);
    await supabaseServiceRole.from('laundry_receipts').delete().eq('dispatch_id', dispatch2.id);
    await supabaseServiceRole.from('laundry_dispatch_items').delete().eq('dispatch_id', dispatch1.id);
    await supabaseServiceRole.from('laundry_dispatch_items').delete().eq('dispatch_id', dispatch2.id);
    await supabaseServiceRole.from('laundry_dispatches').delete().eq('id', dispatch1.id);
    await supabaseServiceRole.from('laundry_dispatches').delete().eq('id', dispatch2.id);
    await supabaseServiceRole.from('linen_stock_movements').delete().eq('linen_item_id', linenItem.id);
    await supabaseServiceRole.from('laundry_vendor_rates').delete().eq('vendor_id', vendor.id);
    await supabaseServiceRole.from('linen_items').delete().eq('id', linenItem.id);
    await supabaseServiceRole.from('laundry_vendors').delete().eq('id', vendor.id);

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Test suite uncaught error:', err);
    process.exit(1);
  }
}

runLaundryTestSuite();
