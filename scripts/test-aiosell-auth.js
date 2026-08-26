import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env explicitly from root
dotenv.config({ path: path.join(__dirname, '../.env') });

const url = 'https://live.aiosell.com/api/v2/cm/property_details/sandbox-pms?partnerId=sample-pms';

const username = process.env.AIOSELL_USERNAME || '';
const password = process.env.AIOSELL_PASSWORD || '';

const uLen = username.length;
const pLen = password.length;

const usernameHasLeadingWhitespace = username !== username.trimStart();
const usernameHasTrailingWhitespace = username !== username.trimEnd();
const passwordHasLeadingWhitespace = password !== password.trimStart();
const passwordHasTrailingWhitespace = password !== password.trimEnd();

console.log('==================================================');
console.log('SAFE CONFIGURATION DIAGNOSTICS');
console.log('==================================================');
console.log(`AIOSELL_BASE_URL configured: ${!!process.env.AIOSELL_BASE_URL}`);
console.log(`AIOSELL_USERNAME configured: ${!!process.env.AIOSELL_USERNAME}`);
console.log(`AIOSELL_PASSWORD configured: ${!!process.env.AIOSELL_PASSWORD}`);
console.log(`AIOSELL_PARTNER_ID: ${process.env.AIOSELL_PARTNER_ID}`);
console.log(`AIOSELL_HOTEL_CODE: ${process.env.AIOSELL_HOTEL_CODE}`);
console.log(`AIOSELL_ENVIRONMENT: ${process.env.AIOSELL_ENVIRONMENT}`);
console.log('');
console.log(`username length: ${uLen}`);
console.log(`password length: ${pLen}`);
console.log(`usernameHasLeadingWhitespace: ${usernameHasLeadingWhitespace}`);
console.log(`usernameHasTrailingWhitespace: ${usernameHasTrailingWhitespace}`);
console.log(`passwordHasLeadingWhitespace: ${passwordHasLeadingWhitespace}`);
console.log(`passwordHasTrailingWhitespace: ${passwordHasTrailingWhitespace}`);
console.log('');
console.log('Checking Proxies:');
console.log(`HTTP_PROXY: ${process.env.HTTP_PROXY || 'None'}`);
console.log(`HTTPS_PROXY: ${process.env.HTTPS_PROXY || 'None'}`);
console.log('==================================================');

async function testAuth() {
  try {
    const authString = Buffer.from(`${username}:${password}`).toString('base64');
    
    console.log(`\nOutgoing request to: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json'
      }
    });

    const body = await response.text();
    
    console.log('\n==================================================');
    console.log('RESPONSE STATUS: ', response.status);
    console.log('RESPONSE BODY: ', body);
    console.log('==================================================');
  } catch (err) {
    console.error('Fetch Error:', err.message);
  }
}

testAuth();
