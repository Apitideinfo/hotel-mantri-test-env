import { config } from 'dotenv';
config();
import nodemailer from 'nodemailer';
const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
});
console.log('SMTP_USER:', process.env.SMTP_USER);
console.log('SMTP_PASSWORD_LEN:', (process.env.SMTP_PASSWORD || '').length);
console.log('Testing connection...');
t.verify()
  .then(() => { console.log('✅ SMTP AUTH: OK — credentials accepted by Gmail'); process.exit(0); })
  .catch(e => { console.log('❌ SMTP AUTH FAILED:', e.message); process.exit(1); });
