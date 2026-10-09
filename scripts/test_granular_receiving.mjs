import dotenv from 'dotenv';
dotenv.config();

import laundryService from '../server/services/laundryService.js';
import { supabaseServiceRole } from '../server/supabaseClient.js';

const HOTEL_ID = '9001eb1c-9d38-49d0-84f7-75244e8f4bf8';

async function testGranularReceiving() {
  console.log('--- Testing Granular Receiving: Received Clean, Damaged, Lost & Remaining Pending ---');
  const suffix = Date.now().toString(36);

  // 1. Create Linen Item
  const item = await laundryService.saveLinenItem(HOTEL_ID, {
    item_name: `Towel_Granular_${suffix}`,
    category: 'Bath Linen',
    unit: 'Pieces',
    standard_rate: 15,
    initial_stock: 0,
  }, 'Tester');

  // 2. Add 100 stock
  await laundryService.recordStockMovement(HOTEL_ID, {
    linen_item_id: item.id,
    movement_type: 'opening',
    quantity: 100,
    reason: 'Initial test batch',
  }, 'Tester');

  // 3. Create Vendor
  const vendor = await laundryService.saveVendor(HOTEL_ID, {
    vendor_name: `Vendor_Granular_${suffix}`,
    mobile_number: '9876543210',
  });

  // 4. Set rate ₹15
  await laundryService.saveVendorRate(HOTEL_ID, {
    vendor_id: vendor.id,
    linen_item_id: item.id,
    rate_per_piece: 15,
  });

  // 5. Dispatch 50 pieces
  const dispatch = await laundryService.createDispatch(HOTEL_ID, {
    dispatch_date: '2026-10-09',
    vendor_id: vendor.id,
    vendor_name: vendor.vendor_name,
    challan_no: `CH-${suffix}`,
    items: [{
      linen_item_id: item.id,
      item_name: item.item_name,
      sent_qty: 50,
      rate_per_piece: 15,
    }],
  }, 'Tester');

  console.log('Dispatch created with 50 pieces.');

  // 6. Receive: 45 Clean, 2 Damaged, 1 Lost, (2 Remaining Pending)
  const dispItem = dispatch.items[0];
  const recvRes = await laundryService.receiveLaundry(HOTEL_ID, {
    dispatch_id: dispatch.id,
    receipt_date: '2026-10-09',
    items: [{
      dispatch_item_id: dispItem.id,
      linen_item_id: item.id,
      item_name: item.item_name,
      received_now: 45,
      damaged_qty: 2,
      lost_qty: 1,
      is_billable: true,
      rate_applied: 15,
    }],
    remarks: '45 clean, 2 damaged, 1 lost, 2 pending',
    received_by: 'StaffTester',
  }, 'Tester');

  console.log('Receipt response status:', recvRes.status);
  console.log('Receipt billable amount:', recvRes.billable_amount);

  if (recvRes.status !== 'Partially Received') throw new Error(`Expected status 'Partially Received', got ${recvRes.status}`);
  if (recvRes.billable_amount !== 45 * 15) throw new Error(`Expected billable ₹${45 * 15}, got ₹${recvRes.billable_amount}`);

  // Check dispatch item tracking totals
  const { data: updatedDi } = await supabaseServiceRole
    .from('laundry_dispatch_items')
    .select('*')
    .eq('id', dispItem.id)
    .single();

  console.log(`Tracking columns: received=${updatedDi.total_received}, damaged=${updatedDi.total_damaged}, lost=${updatedDi.total_lost}`);
  if (Number(updatedDi.total_received) !== 45) throw new Error('total_received mismatch');
  if (Number(updatedDi.total_damaged) !== 2) throw new Error('total_damaged mismatch');
  if (Number(updatedDi.total_lost) !== 1) throw new Error('total_lost mismatch');

  // Verify stock movements: 1 lost recorded
  const { data: lostMvmt } = await supabaseServiceRole
    .from('linen_stock_movements')
    .select('*')
    .eq('linen_item_id', item.id)
    .eq('movement_type', 'lost_at_laundry')
    .maybeSingle();

  if (!lostMvmt || Number(lostMvmt.quantity) !== 1) {
    throw new Error('Expected 1 lost_at_laundry stock movement');
  }
  console.log('Verified lost_at_laundry stock movement recorded correctly.');

  // Verify dashboard returns items with dispatch
  const dash = await laundryService.getExecutiveDashboard(HOTEL_ID, '2026-10-09');
  const dInDash = dash.dispatches.find(d => d.id === dispatch.id);
  if (!dInDash || !dInDash.items || dInDash.items.length === 0) {
    throw new Error('Dashboard did not return dispatches with items!');
  }
  console.log('Verified getExecutiveDashboard returns dispatches with items!');

  console.log('ALL GRANULAR RECEIVING TESTS PASSED SUCCESSFULLY! ✓');
}

testGranularReceiving()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
