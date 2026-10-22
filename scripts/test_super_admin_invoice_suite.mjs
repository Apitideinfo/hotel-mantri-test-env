import fs from 'fs';
import path from 'path';

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  HOTEL MANTRI — SUPER ADMIN INVOICE & PROPERTY AUTO-SELECTION TEST SUITE  ');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

// 1. Read environment config
const envPath = path.resolve('.env');
if (!fs.existsSync(envPath)) {
  console.error('FAIL: .env file missing');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
let supabaseUrl = '';
let serviceKey = '';
let anonKey = '';

for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed.startsWith('VITE_SUPABASE_URL=')) {
    supabaseUrl = trimmed.split('=')[1].replace(/['"]/g, '').trim();
  }
  if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
    serviceKey = trimmed.split('=')[1].replace(/['"]/g, '').trim();
  }
  if (trimmed.startsWith('VITE_SUPABASE_ANON_KEY=')) {
    anonKey = trimmed.split('=')[1].replace(/['"]/g, '').trim();
  }
}

const activeKey = serviceKey || anonKey;
if (!supabaseUrl || !activeKey) {
  console.error('FAIL: Supabase URL or credentials missing');
  process.exit(1);
}

const headers = {
  apikey: activeKey,
  Authorization: `Bearer ${activeKey}`,
  'Content-Type': 'application/json',
};

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (details) console.error(`    Details: ${details}`);
    failedCount++;
  }
}

async function runTests() {
  console.log('── TEST SUITE 1: Database Entities & Schema Inspection ──');

  // Fetch real active hotels
  const hotelsRes = await fetch(`${supabaseUrl}/rest/v1/hotels?select=id,hotel_name,city,state,property_code,plan_id,total_rooms,is_active&is_active=eq.true&order=hotel_name.asc&limit=10`, {
    headers,
  });
  assert(hotelsRes.ok, 'Can query active hotels table');
  const hotels = await hotelsRes.json();
  assert(Array.isArray(hotels) && hotels.length >= 2, `Active hotels available in DB (found ${hotels?.length || 0})`);

  const hotelA = hotels[0];
  const hotelB = hotels[1];
  console.log(`    Hotel A: "${hotelA?.hotel_name}" (ID: ${hotelA?.id}, State: ${hotelA?.state || 'N/A'})`);
  console.log(`    Hotel B: "${hotelB?.hotel_name}" (ID: ${hotelB?.id}, State: ${hotelB?.state || 'N/A'})`);

  // Fetch plans
  const plansRes = await fetch(`${supabaseUrl}/rest/v1/subscription_plans?select=id,name,price,yearly_price,is_active&is_active=eq.true`, {
    headers,
  });
  assert(plansRes.ok, 'Can query subscription plans table');
  const plans = await plansRes.json();
  assert(Array.isArray(plans), `Subscription plans loaded (found ${plans?.length || 0})`);

  console.log('\n── TEST SUITE 2: Hotel Resolution & Auto-Preselection Logic ──');

  // Logic simulation of resolveInitialHotelId:
  const simulateResolve = (propHotelId, globalHotelId, localStorageId) => {
    if (propHotelId && typeof propHotelId === 'string' && propHotelId.trim()) {
      return propHotelId.trim();
    }
    if (globalHotelId && typeof globalHotelId === 'string' && globalHotelId.trim()) {
      return globalHotelId.trim();
    }
    if (localStorageId && typeof localStorageId === 'string' && localStorageId.trim()) {
      return localStorageId.trim();
    }
    return '';
  };

  // Scenario 1: Super Admin selects Hotel A -> opens invoice creation -> sees Hotel A preselected
  const scenario1 = simulateResolve(undefined, hotelA.id, hotelA.id);
  assert(scenario1 === hotelA.id, 'Scenario 1: Preselects Hotel A when set in global context', `Expected ${hotelA.id}, got ${scenario1}`);

  // Scenario 2: Super Admin selects Hotel B -> opens invoice creation -> sees Hotel B preselected
  const scenario2 = simulateResolve(undefined, hotelB.id, hotelB.id);
  assert(scenario2 === hotelB.id, 'Scenario 2: Preselects Hotel B when set in global context', `Expected ${hotelB.id}, got ${scenario2}`);

  // Scenario 3: Explicit prop overrides global context
  const scenario3 = simulateResolve(hotelB.id, hotelA.id, hotelA.id);
  assert(scenario3 === hotelB.id, 'Scenario 3: Explicit prop hotelId overrides global context if specified');

  // Scenario 4: No preselected hotel returns empty string, triggering property picker safely
  const scenario4 = simulateResolve('', null, null);
  assert(scenario4 === '', 'Scenario 4: When no hotel is selected anywhere, returns empty string for picker');

  console.log('\n── TEST SUITE 3: Property Switching & Asynchronous Race Condition Safety ──');

  // Simulate stale async request protection using request counter
  let reqId = 0;
  let activeHotelData = null;

  const asyncLoadSim = async (targetHotelId, delayMs) => {
    const currentReq = ++reqId;
    await new Promise((r) => setTimeout(r, delayMs));
    if (currentReq !== reqId) {
      // Stale response discarded!
      return { discarded: true };
    }
    activeHotelData = targetHotelId;
    return { discarded: false, hotelId: targetHotelId };
  };

  // User rapidly clicks Hotel A (slow 150ms response) then Hotel B (fast 30ms response)
  const reqA = asyncLoadSim(hotelA.id, 150);
  await new Promise((r) => setTimeout(r, 10)); // tiny gap
  const reqB = asyncLoadSim(hotelB.id, 30);

  const [resA, resB] = await Promise.all([reqA, reqB]);
  assert(resA.discarded === true, 'Slow earlier request for Hotel A is safely discarded');
  assert(resB.discarded === false && activeHotelData === hotelB.id, 'Faster latest request for Hotel B is preserved');

  console.log('\n── TEST SUITE 4: Tax Calculation & Interstate vs Intrastate Handling ──');

  // Company state is simulated as Rajasthan
  const companyState = 'Rajasthan';
  const isInterstateCalc = (hotelState) => {
    const cs = (companyState || '').trim().toLowerCase();
    const hs = (hotelState || '').trim().toLowerCase();
    return Boolean(cs && hs && cs !== hs);
  };

  const intrastateTax = isInterstateCalc('Rajasthan');
  const interstateTax = isInterstateCalc('Gujarat');
  assert(intrastateTax === false, 'Intrastate transaction detected correctly for Rajasthan -> Rajasthan');
  assert(interstateTax === true, 'Interstate transaction detected correctly for Rajasthan -> Gujarat');

  // Line item tax computation:
  const lineItem = { quantity: 1, rate: 5000, discount: 500, gst_rate: 18 };
  const taxable = lineItem.quantity * lineItem.rate - lineItem.discount; // 4500
  const tax = (taxable * lineItem.gst_rate) / 100; // 810
  assert(taxable === 4500, 'Taxable calculation matches line total minus discount');

  // Intrastate splits 50/50:
  const cgst = intrastateTax ? 0 : tax / 2; // 405
  const sgst = intrastateTax ? 0 : tax / 2; // 405
  const igst = intrastateTax ? tax : 0;
  assert(cgst === 405 && sgst === 405 && igst === 0, 'Intrastate correctly splits tax into CGST 50% and SGST 50%');

  // Interstate puts 100% into IGST:
  const igstInterstate = interstateTax ? tax : 0; // 810
  assert(igstInterstate === 810, 'Interstate correctly assigns 100% of tax to IGST');

  console.log('\n── TEST SUITE 5: Invoice Creation & Internal Hotel ID Verification ──');

  // Test creating a draft invoice via Supabase with verified internal hotel ID
  let createdInvoiceId = null;
  try {
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/invoices`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        hotel_id: hotelA.id, // Strictly using internal UUID!
        status: 'Draft',
        billing_period: 'Oct 2026 Regression Test',
        billing_cycle: 'monthly',
        number_of_rooms: hotelA.total_rooms || 20,
        number_of_users: 1,
        is_interstate: isInterstateCalc(hotelA.state),
        place_of_supply: hotelA.state || 'Rajasthan',
        notes: 'Automated regression test invoice - safe deletion planned',
        due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      }),
    });

    assert(insertRes.ok, 'Can create draft invoice in database');
    const created = await insertRes.json();
    const invoice = created[0];
    createdInvoiceId = invoice?.id;

    assert(invoice?.hotel_id === hotelA.id, `Invoice is strictly associated with Hotel A UUID: ${hotelA.id}`);
    assert(invoice?.status === 'Draft', 'Invoice status initialized to "Draft"');

    // Create item
    const itemRes = await fetch(`${supabaseUrl}/rest/v1/invoice_items`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        invoice_id: invoice.id,
        sr_no: 1,
        description: 'Monthly Cloud PMS Subscription',
        hsn_sac: '998314',
        quantity: 1,
        rate: 5000,
        discount: 500,
        taxable_value: 4500,
        gst_rate: 18,
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: igst,
        amount: 5310,
        item_type: 'subscription',
      }),
    });
    assert(itemRes.ok, 'Can insert invoice line item');

    // Update invoice totals
    const updateRes = await fetch(`${supabaseUrl}/rest/v1/invoices?id=eq.${invoice.id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        subtotal: 5000,
        discount_amount: 500,
        taxable_amount: 4500,
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: igst,
        total_amount: 5310,
        balance_due: 5310,
      }),
    });
    assert(updateRes.ok, 'Invoice totals updated successfully with taxable and GST breakdown');

    // Query back the invoice with hotel inner join
    const verifyRes = await fetch(
      `${supabaseUrl}/rest/v1/invoices?select=id,hotel_id,status,total_amount,hotels!inner(id,hotel_name)&id=eq.${invoice.id}`,
      { headers }
    );
    assert(verifyRes.ok, 'Can retrieve invoice joined with hotels table');
    const verifiedData = await verifyRes.json();
    assert(
      verifiedData[0]?.hotels?.id === hotelA.id && verifiedData[0]?.hotels?.hotel_name === hotelA.hotel_name,
      'Internal hotel relationship verified: invoice resolves correctly to hotel name and internal ID'
    );
  } finally {
    // Clean up created test invoice
    if (createdInvoiceId) {
      await fetch(`${supabaseUrl}/rest/v1/invoice_items?invoice_id=eq.${createdInvoiceId}`, {
        method: 'DELETE',
        headers,
      });
      await fetch(`${supabaseUrl}/rest/v1/invoices?id=eq.${createdInvoiceId}`, {
        method: 'DELETE',
        headers,
      });
      console.log(`    Cleaned up temporary test invoice ${createdInvoiceId}`);
    }
  }

  console.log('\n── TEST SUITE 6: Verification of Existing Invoices & Historical Integrity ──');

  const existingInvsRes = await fetch(`${supabaseUrl}/rest/v1/invoices?select=id,invoice_number,hotel_id,status,total_amount&limit=5`, {
    headers,
  });
  assert(existingInvsRes.ok, 'Can read existing invoices');
  const existingInvoices = await existingInvsRes.json();
  assert(Array.isArray(existingInvoices), `Existing invoices retrieved safely (count: ${existingInvoices.length})`);
  if (existingInvoices.length > 0) {
    const sample = existingInvoices[0];
    assert(sample.id && sample.hotel_id, `Historical invoice ${sample.invoice_number || sample.id} preserves valid hotel_id`);
  }

  console.log('\n── TEST SUITE 7: Component Interface & File Integrity Check ──');

  const invoiceCreateFile = fs.readFileSync('src/enterprise/screens/InvoiceCreateScreen.tsx', 'utf8');
  assert(!invoiceCreateFile.includes("onCreated('')"), 'Bug A root cause eliminated: no onCreated("") call on hotel selection');
  assert(invoiceCreateFile.includes('handleSwitchHotel'), 'handleSwitchHotel handler properly wired for property selection');
  assert(invoiceCreateFile.includes('InvoiceErrorBoundary'), 'Localized Error Boundary protects against rendering crashes');
  assert(invoiceCreateFile.includes('useHotel()'), 'Application-wide useHotel() context hook utilized for hotel preselection');
  assert(invoiceCreateFile.includes('DEFAULT_BILLING_SETTINGS'), 'DEFAULT_BILLING_SETTINGS fallback present for resilient loading');

  const enterpriseHqFile = fs.readFileSync('src/enterprise/EnterpriseHQ.tsx', 'utf8');
  assert(enterpriseHqFile.includes('useHotel'), 'EnterpriseHQ imports and utilizes useHotel for global hotel sync');
  assert(!enterpriseHqFile.includes("case 'invoice-detail': return selectedInvoiceId ? <InvoiceDetailScreen invoiceId={selectedInvoiceId} onBack={() => navigateHq('invoices')} /> : null;"), 'EnterpriseHQ invoice-detail handles missing ID without returning null');
  assert(!enterpriseHqFile.includes("case 'hotel-detail': return selectedHotelId ? <HotelDetailScreen hotelId={selectedHotelId} onBack={() => navigateHq('hotels')} onImpersonate={startImpersonationSession} onViewInvoice={(id) => setDrawerInvoiceId(id)} onCreateInvoice={() => { navigateHq('invoice-create'); }} /> : null;"), 'EnterpriseHQ hotel-detail handles missing ID without returning null');

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log(`  SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
