import test from 'node:test';
import assert from 'node:assert';
import {
  calculateStayNights,
  isValidDateString,
  calculateTaxes,
  verifyQuoteToken,
} from '../src/services/quoteEngine.js';
import { setConfiguredHotelForTesting } from '../src/services/hotelConfigService.js';
import { config } from '../src/config/environment.js';
import crypto from 'crypto';

test('QuoteEngine: Date Validation & Stay Nights Calculation', async (t) => {
  await t.test('accepts valid ISO calendar dates (YYYY-MM-DD)', () => {
    assert.strictEqual(isValidDateString('2026-10-20'), true);
    assert.strictEqual(isValidDateString('2026-02-28'), true);
    assert.strictEqual(isValidDateString('2026-12-31'), true);
  });

  await t.test('rejects invalid dates and date formats', () => {
    assert.strictEqual(isValidDateString('20-10-2026'), false);
    assert.strictEqual(isValidDateString('2026/10/20'), false);
    assert.strictEqual(isValidDateString('invalid-date'), false);
    assert.strictEqual(isValidDateString('2026-02-30'), false); // Feb 30 does not exist
    assert.strictEqual(isValidDateString(''), false);
  });

  await t.test('computes stay nights using half-open interval [checkIn, checkOut)', () => {
    // 1 night stay: Oct 20 to Oct 21
    assert.strictEqual(calculateStayNights('2026-10-20', '2026-10-21'), 1);
    // 3 night stay: Oct 20 to Oct 23
    assert.strictEqual(calculateStayNights('2026-10-20', '2026-10-23'), 3);
    // Same day checkout returns 0
    assert.strictEqual(calculateStayNights('2026-10-20', '2026-10-20'), 0);
    // Checkout before check-in returns 0
    assert.strictEqual(calculateStayNights('2026-10-25', '2026-10-20'), 0);
  });
});

test('QuoteEngine: GST and Tax Calculation Rules', async (t) => {
  await t.test('computes Exclusive GST correctly (base + 12% GST)', () => {
    const res = calculateTaxes({
      preTaxAmount: 3000,
      gstMode: 'Exclusive',
      gstSlab: 12,
    });

    assert.strictEqual(res.taxableAmount, 3000);
    assert.strictEqual(res.gstAmount, 360);
    assert.strictEqual(res.cgst, 180);
    assert.strictEqual(res.sgst, 180);
    assert.strictEqual(res.totalAmount, 3360);
  });

  await t.test('computes Inclusive GST correctly (total includes 12% GST)', () => {
    const res = calculateTaxes({
      preTaxAmount: 3360,
      gstMode: 'Inclusive',
      gstSlab: 12,
    });

    assert.strictEqual(res.totalAmount, 3360);
    assert.strictEqual(res.taxableAmount, 3000);
    assert.strictEqual(res.gstAmount, 360);
    assert.strictEqual(res.cgst, 180);
    assert.strictEqual(res.sgst, 180);
  });

  await t.test('computes No Scope GST correctly (0 tax)', () => {
    const res = calculateTaxes({
      preTaxAmount: 2500,
      gstMode: 'No Scope',
      gstSlab: 0,
    });

    assert.strictEqual(res.taxableAmount, 2500);
    assert.strictEqual(res.gstAmount, 0);
    assert.strictEqual(res.totalAmount, 2500);
  });
});

test('QuoteEngine: Cryptographic Quote Token Verification & Tamper Resistance', async (t) => {
  const hotelId = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb';
  setConfiguredHotelForTesting({ id: hotelId, hotel_name: 'Hotel Gopal', is_active: true });

  const secret = config().security.bookingTokenSecret;

  const validPayload = {
    quoteId: 'HM-QTE-TEST-123',
    hotelId,
    categoryId: 'ac151d07-3b94-4598-9635-215f271269bc',
    categoryName: 'Deluxe AC',
    checkIn: '2026-11-01',
    checkOut: '2026-11-03',
    nights: 2,
    rooms: 1,
    adults: 2,
    children: 0,
    ratePerNight: 3000,
    subtotalInr: 6000,
    totalAmountInr: 6720,
    totalAmountPaise: 672000,
    currency: 'INR',
    exp: Date.now() + 900000, // 15 mins
  };

  const b64 = Buffer.from(JSON.stringify(validPayload)).toString('base64url');
  const validSig = crypto.createHmac('sha256', secret).update(b64).digest('hex');
  const validToken = `${b64}.${validSig}`;

  await t.test('successfully verifies a valid, untampered quote token', () => {
    const unpacked = verifyQuoteToken(validToken);
    assert.strictEqual(unpacked.quoteId, 'HM-QTE-TEST-123');
    assert.strictEqual(unpacked.totalAmountPaise, 672000);
    assert.strictEqual(unpacked.hotelId, hotelId);
  });

  await t.test('rejects quote token if payload is tampered (e.g. lowering price)', () => {
    // Attacker modifies price from 672000 to 100 paise
    const tamperedPayload = { ...validPayload, totalAmountPaise: 100 };
    const tamperedB64 = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');
    const forgedToken = `${tamperedB64}.${validSig}`; // Using old signature

    assert.throws(() => {
      verifyQuoteToken(forgedToken);
    }, {
      code: 'QUOTE_SIGNATURE_INVALID',
    });
  });

  await t.test('rejects expired quote tokens', () => {
    const expiredPayload = { ...validPayload, exp: Date.now() - 1000 };
    const expB64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
    const expSig = crypto.createHmac('sha256', secret).update(expB64).digest('hex');
    const expiredToken = `${expB64}.${expSig}`;

    assert.throws(() => {
      verifyQuoteToken(expiredToken);
    }, {
      code: 'QUOTE_EXPIRED',
    });
  });

  await t.test('rejects cross-hotel quote tokens', () => {
    const foreignHotelId = '9001eb1c-9d38-49d0-84f7-75244e8f4bf8'; // Mars Hotel
    const foreignPayload = { ...validPayload, hotelId: foreignHotelId };
    const fB64 = Buffer.from(JSON.stringify(foreignPayload)).toString('base64url');
    const fSig = crypto.createHmac('sha256', secret).update(fB64).digest('hex');
    const foreignToken = `${fB64}.${fSig}`;

    assert.throws(() => {
      verifyQuoteToken(foreignToken);
    }, {
      code: 'QUOTE_HOTEL_MISMATCH',
    });
  });
});
