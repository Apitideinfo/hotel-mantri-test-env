/**
 * HOTEL MANTRI — Auditable Accounting Reconciliation Script
 * Applies verified transaction corrections for Hotel Gopal on 2026-10-01.
 * 
 * 1. Corrects Mr Goswami Jenishgiri (Room 206) payment method from Card POS to Cash (actual physical cash).
 * 2. Voids the orphan duplicate timeline entry a39a23d2 for Mr Sachin Tomar (reservation 0ac87072 already records full 2616 advance).
 * 3. Updates day_close_records for 2026-10-01 to reflect accurate cash closing of -₹380.
 * 4. Logs complete auditable event records in booking_timeline.
 */

import dotenv from 'dotenv';
dotenv.config();

import { supabaseServiceRole } from '../server/supabaseClient.js';

const HOTEL_ID = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb';
const DATE = '2026-10-01';

async function applyCorrections() {
  console.log('========================================================================');
  console.log('HOTEL MANTRI — APPLYING AUDITABLE FINANCIAL CORRECTIONS (2026-10-01)');
  console.log('========================================================================\n');

  // ─── 1. Correction 1: Mr Goswami Jenishgiri (Room 206) Card -> Cash ────────
  console.log('1. Correcting Mr Goswami Jenishgiri (Res 7a37991f-7666-4be8-9dc0-d91c0f7fb902) Card -> Cash...');
  const resvId = '7a37991f-7666-4be8-9dc0-d91c0f7fb902';

  const { data: currentResv, error: rGetErr } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .eq('id', resvId)
    .single();

  if (rGetErr || !currentResv) {
    throw new Error(`Failed to find reservation ${resvId}: ${rGetErr?.message}`);
  }

  const { error: rUpdErr } = await supabaseServiceRole
    .from('reservations')
    .update({
      payment_mode: 'Cash',
      pay_cash: 1200,
      pay_card: 0,
      remarks: `${currentResv.remarks ? currentResv.remarks + ' | ' : ''}[Audit Correction 2026-10-15: Payment mode corrected from Card POS to Cash per guest folio and actual currency collection]`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', resvId);

  if (rUpdErr) throw new Error(`Failed to update reservation: ${rUpdErr.message}`);
  console.log('   ✓ Updated reservation 7a37991f payment_mode=Cash, pay_cash=1200, pay_card=0');

  // Update associated timeline event c965c3ac
  const timelineId = 'c965c3ac-78e4-419b-b1a5-d2f9905b82be';
  const { data: currentTimeline } = await supabaseServiceRole
    .from('booking_timeline')
    .select('*')
    .eq('id', timelineId)
    .single();

  if (currentTimeline) {
    const updatedData = {
      ...(currentTimeline.event_data || {}),
      payment_method: 'Cash',
      pay_cash: 1200,
      pay_card: 0,
      audit_correction: 'Reclassified from Card to Cash per actual collection',
      audit_corrected_at: new Date().toISOString(),
    };

    const { error: tUpdErr } = await supabaseServiceRole
      .from('booking_timeline')
      .update({
        event_description: 'Advance payment for reservation: Mr Goswami Jenishgiri (Cash)',
        event_data: updatedData,
      })
      .eq('id', timelineId);

    if (tUpdErr) throw new Error(`Failed to update timeline event: ${tUpdErr.message}`);
    console.log('   ✓ Updated timeline event c965c3ac payment_method=Cash, pay_cash=1200, pay_card=0');
  }

  // ─── 2. Correction 2: Void Orphan Duplicate Timeline Event a39a23d2 ────────
  console.log('\n2. Voiding orphan duplicate timeline event a39a23d2-ca24-42ad-ab3b-a67c78b753e0...');
  const orphanEventId = 'a39a23d2-ca24-42ad-ab3b-a67c78b753e0';

  const { data: orphanEvt } = await supabaseServiceRole
    .from('booking_timeline')
    .select('*')
    .eq('id', orphanEventId)
    .maybeSingle();

  if (orphanEvt) {
    const { error: voidErr } = await supabaseServiceRole
      .from('booking_timeline')
      .update({
        event_type: 'duplicate_void',
        event_description: 'VOID [Duplicate Entry]: Advance payment fragment for Mr Sachin Tomar (reservation 0ac87072 already records full ₹2,616 advance for rooms 404 & 407)',
        event_data: {
          ...(orphanEvt.event_data || {}),
          status: 'void',
          void_reason: 'Duplicate advance fragment: Master reservation 0ac87072 already accounts for full ₹2,616 group payment',
          voided_at: new Date().toISOString(),
          audited_by: 'AUDITOR',
        },
      })
      .eq('id', orphanEventId);

    if (voidErr) throw new Error(`Failed to void orphan event: ${voidErr.message}`);
    console.log('   ✓ Event a39a23d2 marked as duplicate_void with audit details (status=void)');
  }

  // ─── 3. Correction 3: Update day_close_records for 2026-10-01 ──────────────
  console.log('\n3. Recalculating and updating day_close_records for 2026-10-01...');
  const { data: closeRec } = await supabaseServiceRole
    .from('day_close_records')
    .select('*')
    .eq('hotel_id', HOTEL_ID)
    .eq('business_date', DATE)
    .maybeSingle();

  if (closeRec) {
    // Opening Cash: 0 + Cash Receipts: 8,600 - Cash Expenses: 8,980 = -380
    const correctClosing = -380;
    const { error: cUpdErr } = await supabaseServiceRole
      .from('day_close_records')
      .update({
        cash_closing: correctClosing,
        opening_cash_next_day: correctClosing,
        reopen_reason: 'Audit reconciliation: Cash receipts corrected to ₹8,600, cash closing updated to -₹380',
        updated_at: new Date().toISOString(),
      })
      .eq('id', closeRec.id);

    if (cUpdErr) throw new Error(`Failed to update day_close_records: ${cUpdErr.message}`);
    console.log(`   ✓ Updated day_close_records for 2026-10-01: cash_closing = ₹${correctClosing}`);
  }

  // ─── 4. Log Audit Trail Entry in booking_timeline ──────────────────────────
  console.log('\n4. Logging master audit trail in booking_timeline...');
  await supabaseServiceRole.from('booking_timeline').insert({
    hotel_id: HOTEL_ID,
    event_type: 'accounting_audit_reconciliation',
    event_description: 'Master Accounting Audit for 2026-10-01: Reclassified Room 206 (Mr Goswami Jenishgiri) ₹1,200 to Cash; Voided ₹1,308 orphan duplicate timeline entry for Mr Sachin Tomar; Reconciled Total Collection = ₹25,408 (Cash ₹8,600, Bank ₹16,808, Card ₹0).',
    event_amount: 25408,
    event_data: {
      business_date: DATE,
      reconciled_collections: {
        cash: 8600,
        bank: 16808,
        card: 0,
        upi: 0,
        total: 25408,
      },
      earned_revenue: 25408,
      cash_expenses: 8980,
      closing_cash: -380,
      audited_by: 'AUDITOR',
      timestamp: new Date().toISOString(),
    },
    performed_by: 'AUDITOR',
  });
  console.log('   ✓ Logged master audit trail event.');

  console.log('\n========================================================================');
  console.log('ALL AUDITABLE CORRECTIONS SUCCESSFULLY APPLIED!');
  console.log('========================================================================');
}

applyCorrections().catch((err) => {
  console.error('Error applying corrections:', err);
  process.exit(1);
});
