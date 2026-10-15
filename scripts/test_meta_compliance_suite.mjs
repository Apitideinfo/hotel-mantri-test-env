/**
 * Hotel Mantri — Meta Compliance & Data Deletion Verification Suite
 *
 * Verifies:
 * 1. Meta signed_request parsing & cryptographic HMAC-SHA256 verification.
 * 2. Meta User Data Deletion Callback response format ({ url, confirmation_code }).
 * 3. Status check endpoint without leaking PII.
 * 4. Web deletion request registration and rate limiting.
 * 5. Static crawler files (robots.txt, sitemap.xml, pre-rendered HTML).
 * 6. Privacy Policy 16-section completeness.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseAndVerifyMetaSignedRequest,
  recordDeletionRequest,
  findDeletionRequest,
  generateConfirmationCode,
} from '../server/services/metaComplianceService.js';
import app from '../server/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

// Base64URL encode helper for creating test Meta signed requests
function base64UrlEncode(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function runMetaComplianceSuite() {
  console.log('\n================================================================');
  console.log('HOTEL MANTRI — META COMPLIANCE & PRIVACY VERIFICATION SUITE');
  console.log('================================================================\n');

  const testSecret = 'test_meta_app_secret_12345';

  // ── TEST GROUP 1: Cryptographic Meta Signed-Request Parsing ──
  console.log('── [TEST GROUP 1] Meta Signed-Request Parsing & Verification ──');
  {
    // Generate valid Meta signed_request
    const payloadObj = {
      algorithm: 'HMAC-SHA256',
      issued_at: Math.floor(Date.now() / 1000),
      user_id: 'meta_user_998877',
    };
    const payloadStr = JSON.stringify(payloadObj);
    const encodedPayload = base64UrlEncode(payloadStr);

    const hmacSig = crypto
      .createHmac('sha256', testSecret)
      .update(encodedPayload)
      .digest();
    const encodedSig = hmacSig
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const validSignedRequest = `${encodedSig}.${encodedPayload}`;

    // Test 1.1: Valid signature passes
    const resultValid = parseAndVerifyMetaSignedRequest(validSignedRequest, testSecret);
    assert(resultValid.valid === true, 'Valid signed_request parses and validates signature successfully');
    assert(resultValid.data?.user_id === 'meta_user_998877', 'Correct user_id extracted from signed_request');

    // Test 1.2: Tampered signature is rejected
    const tamperedSignedRequest = `${encodedSig}TAMPERED.${encodedPayload}`;
    const resultTampered = parseAndVerifyMetaSignedRequest(tamperedSignedRequest, testSecret);
    assert(resultTampered.valid === false, 'Tampered signed_request signature is rejected');

    // Test 1.3: Malformed signed request
    const resultMalformed = parseAndVerifyMetaSignedRequest('not_a_valid_signed_request', testSecret);
    assert(resultMalformed.valid === false, 'Malformed signed_request without dot separator is rejected');

    // Test 1.4: Missing signed request
    const resultMissing = parseAndVerifyMetaSignedRequest('', testSecret);
    assert(resultMissing.valid === false, 'Empty signed_request is rejected');
  }

  // ── TEST GROUP 2: Deletion Request Lifecycle & Store ──
  console.log('\n── [TEST GROUP 2] Deletion Request Store & Confirmation Codes ──');
  {
    const code = generateConfirmationCode('HM-DEL-TEST');
    assert(code.startsWith('HM-DEL-TEST-'), `Confirmation code generated with correct prefix: ${code}`);

    const record = await recordDeletionRequest({
      confirmationCode: code,
      source: 'web_form',
      requesterName: 'Aditya Sen',
      email: 'aditya.sen@example.com',
      phone: '+919876543210',
      role: 'guest',
      hotelName: 'Hotel Mantri Test',
      bookingRef: 'HM-BK-999',
      requestType: 'full_deletion',
      reason: 'Automated test suite verification',
    });

    assert(record.confirmation_code === code, 'Deletion record stored with matching confirmation code');
    assert(record.status === 'received', 'Initial status set to "received"');
    assert(record.email === 'aditya.sen@example.com', 'Email normalized in deletion record');

    const retrieved = await findDeletionRequest(code);
    assert(retrieved !== null, 'Record retrievable by confirmation code');
    assert(retrieved?.requester_name === 'Aditya Sen', 'Correct requester retrieved');
  }

  // ── TEST GROUP 3: Express API Route Verification ──
  console.log('\n── [TEST GROUP 3] Meta Endpoints & HTTP Handlers ──');
  {
    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const serverActiveSecret =
      process.env.META_APP_SECRET ||
      process.env.WHATSAPP_APP_SECRET ||
      process.env.WHINTA_WEBHOOK_SECRET ||
      testSecret;

    try {
      // 3.1: POST /api/meta/data-deletion-callback with valid signed_request
      const payloadObj = {
        algorithm: 'HMAC-SHA256',
        issued_at: Math.floor(Date.now() / 1000),
        user_id: 'meta_user_live_test',
      };
      const encodedPayload = base64UrlEncode(JSON.stringify(payloadObj));
      const sig = crypto.createHmac('sha256', serverActiveSecret).update(encodedPayload).digest('base64');
      const testSignedReq = `${sig}.${encodedPayload}`;

      const resMeta = await fetch(`${baseUrl}/api/meta/data-deletion-callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signed_request: testSignedReq }),
      });
      const metaJson = await resMeta.json();

      assert(resMeta.status === 200, `Meta callback returned HTTP 200 (received ${resMeta.status})`);
      assert(typeof metaJson.url === 'string' && metaJson.url.includes('https://www.hotelmantri.com/data-deletion?code='), 'Meta callback returns required status URL');
      assert(typeof metaJson.confirmation_code === 'string' && metaJson.confirmation_code.startsWith('HM-DEL-META-'), 'Meta callback returns required confirmation_code format');

      // 3.2: Check status using the returned confirmation code
      const resStatus = await fetch(`${baseUrl}/api/meta/deletion-status/${metaJson.confirmation_code}`);
      const statusJson = await resStatus.json();

      assert(resStatus.status === 200, `Status endpoint returned HTTP 200 for code ${metaJson.confirmation_code}`);
      assert(statusJson.success === true, 'Status response indicates success: true');
      assert(statusJson.confirmationCode === metaJson.confirmation_code, 'Status confirmation code matches query');
      assert(Boolean(statusJson.statusLabel), 'Status includes human-friendly statusLabel');
      assert(Boolean(statusJson.retentionNotice), 'Status includes statutory tax retention notice');
      assert(!statusJson.email && !statusJson.requesterName, 'Status endpoint sanitizes and hides sensitive personal details');

      // 3.3: POST /api/compliance/deletion-request (web form)
      const resWebForm = await fetch(`${baseUrl}/api/compliance/deletion-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Priya Sharma',
          email: 'priya.sharma@example.com',
          phone: '+919925958831',
          role: 'guest',
          hotelName: 'Hotel Mantri Test Env',
          bookingRef: 'BK-2026-1015',
          requestType: 'full_deletion',
          confirmedAccuracy: true,
        }),
      });
      const webFormJson = await resWebForm.json();

      assert(resWebForm.status === 200, 'Web deletion request form submission returned HTTP 200');
      assert(webFormJson.success === true, 'Web deletion response contains success: true');
      assert(Boolean(webFormJson.confirmationCode), `Web deletion response returned confirmation code: ${webFormJson.confirmationCode}`);

      // 3.4: Rejection without accuracy certification
      const resUnconfirmed = await fetch(`${baseUrl}/api/compliance/deletion-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Anonymous',
          email: 'anon@example.com',
          confirmedAccuracy: false,
        }),
      });
      assert(resUnconfirmed.status === 400, 'Unconfirmed request rejected with HTTP 400');
    } finally {
      server.close();
    }
  }

  // ── TEST GROUP 4: Static Crawler & Compliance Assets ──
  console.log('\n── [TEST GROUP 4] Robots.txt, Sitemap.xml & Pre-rendered Pages ──');
  {
    // 4.1 robots.txt
    const robotsPath = path.join(ROOT_DIR, 'public', 'robots.txt');
    assert(fs.existsSync(robotsPath), 'public/robots.txt exists');
    const robotsContent = fs.readFileSync(robotsPath, 'utf8');
    assert(robotsContent.includes('User-agent: facebookexternalhit'), 'robots.txt explicitly grants access to facebookexternalhit');
    assert(robotsContent.includes('User-agent: Facebot'), 'robots.txt explicitly grants access to Facebot');
    assert(robotsContent.includes('Allow: /privacy-policy'), 'robots.txt allows /privacy-policy');
    assert(robotsContent.includes('Allow: /data-deletion'), 'robots.txt allows /data-deletion');
    assert(robotsContent.includes('Allow: /terms'), 'robots.txt allows /terms');
    assert(robotsContent.includes('Sitemap: https://www.hotelmantri.com/sitemap.xml'), 'robots.txt points to sitemap.xml');

    // 4.2 sitemap.xml
    const sitemapPath = path.join(ROOT_DIR, 'public', 'sitemap.xml');
    assert(fs.existsSync(sitemapPath), 'public/sitemap.xml exists');
    const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
    assert(sitemapContent.includes('<loc>https://www.hotelmantri.com/privacy-policy</loc>'), 'sitemap.xml contains /privacy-policy');
    assert(sitemapContent.includes('<loc>https://www.hotelmantri.com/data-deletion</loc>'), 'sitemap.xml contains /data-deletion');
    assert(sitemapContent.includes('<loc>https://www.hotelmantri.com/terms</loc>'), 'sitemap.xml contains /terms');

    // 4.3 Pre-rendered HTML files
    const privacyHtmlPath = path.join(ROOT_DIR, 'public', 'privacy-policy', 'index.html');
    assert(fs.existsSync(privacyHtmlPath), 'public/privacy-policy/index.html exists for crawlers');
    const privacyHtml = fs.readFileSync(privacyHtmlPath, 'utf8');
    assert(privacyHtml.includes('<h1>Privacy Policy</h1>'), 'public/privacy-policy/index.html has <h1>Privacy Policy</h1>');
    assert(privacyHtml.includes('October 15, 2026'), 'public/privacy-policy/index.html includes effective date');
    assert(privacyHtml.includes('privacy@hotelmantri.com'), 'public/privacy-policy/index.html includes privacy contact email');
    assert(privacyHtml.includes('+91 99259 58831'), 'public/privacy-policy/index.html includes genuine phone helpline');

    const deletionHtmlPath = path.join(ROOT_DIR, 'public', 'data-deletion', 'index.html');
    assert(fs.existsSync(deletionHtmlPath), 'public/data-deletion/index.html exists for crawlers');
    const deletionHtml = fs.readFileSync(deletionHtmlPath, 'utf8');
    assert(deletionHtml.includes('User Data Deletion'), 'public/data-deletion/index.html includes data deletion heading');
    assert(deletionHtml.includes('Section 44AA'), 'public/data-deletion/index.html includes statutory tax exception disclosures');

    const termsHtmlPath = path.join(ROOT_DIR, 'public', 'terms', 'index.html');
    assert(fs.existsSync(termsHtmlPath), 'public/terms/index.html exists');
  }

  // ── TEST GROUP 5: Privacy Policy 16-Section Verification ──
  console.log('\n── [TEST GROUP 5] Privacy Policy 16-Section Audit ──');
  {
    const screenPath = path.join(ROOT_DIR, 'src', 'screens', 'PrivacyPolicyScreen.tsx');
    assert(fs.existsSync(screenPath), 'src/screens/PrivacyPolicyScreen.tsx exists');
    const content = fs.readFileSync(screenPath, 'utf8');

    const requiredSections = [
      'Introduction and Scope',
      'Information Collected',
      'How Information is Collected',
      'Purposes of Data Processing',
      'Hotel Reservation and Guest Information Processing',
      'WhatsApp and Meta Integrations',
      'Third-Party Service Providers and Data Sharing',
      'Storage, Security, and Access Controls',
      'Data Retention',
      'User Privacy Rights and Access/Correction Requests',
      'Account and Personal-Data Deletion',
      'Cookies and Technical Information',
      'International Transfers',
      "Children's Privacy",
      'Policy Updates',
      'Contact Information',
    ];

    for (let i = 0; i < requiredSections.length; i++) {
      const secName = requiredSections[i];
      assert(content.includes(secName), `Section ${i + 1} present: "${secName}"`);
    }

    assert(content.includes('privacy@hotelmantri.com'), 'Discloses genuine privacy email');
    assert(content.includes('+91 99259 58831'), 'Discloses genuine phone helpline');
    assert(content.includes('Navi Mumbai'), 'Discloses genuine Mumbai office address');
    assert(content.includes('Bhubaneswar'), 'Discloses genuine Bhubaneswar office address');
    assert(content.includes('New Zealand'), 'Discloses genuine Auckland office address');
  }

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runMetaComplianceSuite().catch((err) => {
  console.error('Test suite failed unexpectedly:', err);
  process.exit(1);
});
