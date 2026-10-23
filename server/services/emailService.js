/**
 * Hotel Mantri — Email Service (SMTP)
 * Server-side only. SMTP credentials are NEVER exposed to the frontend.
 *
 * Supported Providers:
 *   - Namecheap Private Email (mail.privateemail.com: SSL 465 / STARTTLS 587)
 *   - Google Workspace / Gmail (smtp.gmail.com: STARTTLS 587 / SSL 465)
 *   - Any standard SMTP provider (SendGrid, Postmark, AWS SES, Custom SMTP)
 *
 * Required environment variables:
 *   SMTP_HOST       (e.g., mail.privateemail.com or smtp.gmail.com)
 *   SMTP_PORT       (e.g., 465 for SSL, 587 for TLS)
 *   SMTP_USER       (Full mailbox email, e.g. booking@hotelmantri.com)
 *   SMTP_PASSWORD   (Mailbox password or app-specific password)
 *   SMTP_FROM_EMAIL (Optional: defaults to SMTP_USER)
 *   SMTP_FROM_NAME  (Optional: defaults to "Hotel Mantri")
 *   SMTP_SECURE     (Optional: "true" for port 465, "false" for 587; auto-detected if omitted)
 */

import nodemailer from 'nodemailer';

// ─── Mock Transport for Automated Testing ─────────────────────────────────────
let _mockTransportHandler = null;

export const setMockTransportHandler = (handler) => {
  _mockTransportHandler = handler;
};

export const getMockTransportHandler = () => _mockTransportHandler;

// ─── Configuration ────────────────────────────────────────────────────────────

export const getSmtpConfig = () => {
  const host = (process.env.SMTP_HOST || '').trim();
  const portRaw = process.env.SMTP_PORT || '587';
  const port = parseInt(portRaw, 10) || 587;
  const user = (process.env.SMTP_USER || '').trim();

  // Clean password: trim whitespace.
  // For Gmail App Passwords (which Google formats as "xxxx xxxx xxxx xxxx"),
  // strip internal spaces so it authenticates cleanly.
  let password = (process.env.SMTP_PASSWORD || '').trim();
  if (host.toLowerCase().includes('gmail.com') && password.includes(' ')) {
    password = password.replace(/\s+/g, '');
  }

  const fromEmail = (process.env.SMTP_FROM_EMAIL || user || '').trim();
  const fromName = (process.env.SMTP_FROM_NAME || 'Hotel Mantri').trim();

  // Namecheap Private Email:
  // - Port 465 is SSL/TLS -> secure: true
  // - Port 587 is STARTTLS -> secure: false, requireTLS: true
  const isNamecheap = host.toLowerCase().includes('privateemail.com');
  const secureEnv = process.env.SMTP_SECURE;
  const secure = secureEnv !== undefined
    ? secureEnv === 'true'
    : port === 465;

  return { host, port, user, password, fromEmail, fromName, secure, isNamecheap };
};

/**
 * Validates that the SMTP configuration is complete.
 */
export const validateSmtpConfig = () => {
  const config = getSmtpConfig();
  const missing = [];
  if (!config.host) missing.push('SMTP_HOST');
  if (!config.user) missing.push('SMTP_USER');
  if (!config.password) missing.push('SMTP_PASSWORD');
  if (!config.fromEmail) missing.push('SMTP_FROM_EMAIL');

  if (missing.length > 0) {
    return { valid: false, missingVars: missing, config: null };
  }
  return { valid: true, missingVars: [], config };
};

// ─── Email Validation ─────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (!trimmed) return false;
  // Prevent header injection
  if (/[\r\n]/.test(trimmed)) return false;
  return EMAIL_REGEX.test(trimmed);
};

// ─── HTML Escaping for User-Supplied Data ─────────────────────────────────────

export const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// ─── Transporter Factory ──────────────────────────────────────────────────────

let _transporter = null;

const createTransporterInstance = (config) => {
  const { host, port, user, password, secure, isNamecheap } = config;

  const transportOpts = {
    host,
    port,
    secure,
    auth: { user, pass: password },
    // In serverless (Vercel Functions), do NOT use pool: true to prevent frozen TCP socket hang
    pool: false,
    connectionTimeout: 10000, // 10s connection timeout
    greetingTimeout: 5000,   // 5s greeting timeout
    socketTimeout: 15000,     // 15s socket activity timeout
  };

  if (port === 587 || isNamecheap) {
    transportOpts.requireTLS = !secure;
  }

  if (isNamecheap) {
    transportOpts.tls = {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    };
  }

  return nodemailer.createTransport(transportOpts);
};

const getTransporter = () => {
  const validation = validateSmtpConfig();
  if (!validation.valid) {
    throw Object.assign(new Error(`SMTP not configured. Missing: ${validation.missingVars.join(', ')}`), {
      code: 'EMAIL_NOT_CONFIGURED',
      missingVars: validation.missingVars,
    });
  }

  if (!_transporter) {
    _transporter = createTransporterInstance(validation.config);
  }

  return _transporter;
};

// ─── Error Categorization ───────────────────────────────────────────────────

export const categorizeSmtpError = (err, to, safeSubject = '', isNamecheap = false) => {
  let errorCode = 'SMTP_SEND_FAILED';
  let safeMessage = 'Failed to send email.';

  const errMsg = (err?.message || '').toLowerCase();
  const errCode = (err?.code || '').toUpperCase();

  if (errMsg.includes('auth') || errMsg.includes('535') || errMsg.includes('534') || errCode === 'EAUTH') {
    errorCode = 'SMTP_AUTH_FAILED';
    safeMessage = isNamecheap
      ? 'SMTP authentication failed for Namecheap Private Email. Verify SMTP_USER is your full mailbox email address and SMTP_PASSWORD is correct.'
      : 'SMTP authentication failed. Please verify SMTP_USER and SMTP_PASSWORD credentials.';
  } else if (errMsg.includes('timeout') || errMsg.includes('etimedout') || errCode === 'ETIMEDOUT') {
    errorCode = 'SMTP_TIMEOUT';
    safeMessage = 'SMTP connection timed out. The mail server took too long to respond.';
  } else if (errMsg.includes('connect') || errMsg.includes('enotfound') || errMsg.includes('econnrefused') || errCode === 'ECONNREFUSED' || errCode === 'ENOTFOUND') {
    errorCode = 'SMTP_CONNECTION_FAILED';
    safeMessage = 'SMTP connection failed. Please verify SMTP_HOST and SMTP_PORT.';
  } else if (errMsg.includes('invalid') && errMsg.includes('recipient')) {
    errorCode = 'INVALID_RECIPIENT';
    safeMessage = `Invalid recipient: ${escapeHtml(to)}`;
  } else if (err?.code) {
    errorCode = err.code;
    safeMessage = err.message || 'SMTP operation failed.';
  }

  console.error('[EMAIL] Send failed:', {
    errorCode,
    to,
    subject: safeSubject,
    errType: err?.code || err?.responseCode || 'UNKNOWN',
  });

  return {
    success: false,
    errorCode,
    message: safeMessage,
  };
};

/**
 * Sends an email via SMTP.
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML body
 * @param {string} [options.text] - Plain text fallback
 * @param {Array}  [options.attachments] - Nodemailer attachment objects
 * @param {string} [options.replyTo] - Reply-To address
 *
 * @returns {Promise<{success: boolean, messageId?: string, errorCode?: string, message?: string}>}
 */
export const sendEmail = async ({ to, subject, html, text, attachments = [], replyTo }) => {
  // ── 1. Validate recipient
  if (!to || !isValidEmail(to)) {
    return {
      success: false,
      errorCode: 'INVALID_RECIPIENT',
      message: `Invalid or missing recipient email: "${to || ''}"`,
    };
  }

  // Sanitize subject against email header injection
  const safeSubject = (subject || '').replace(/[\r\n]+/g, ' ').trim();

  // ── 2. Check for Mock Handler (Used for automated testing)
  if (_mockTransportHandler) {
    try {
      return await _mockTransportHandler({ to, subject: safeSubject, html, text, attachments, replyTo });
    } catch (mockErr) {
      return categorizeSmtpError(mockErr, to, safeSubject, false);
    }
  }

  // ── 3. Validate SMTP configuration
  const validation = validateSmtpConfig();
  if (!validation.valid) {
    console.error('[EMAIL] SMTP not configured. Missing:', validation.missingVars);
    return {
      success: false,
      errorCode: 'EMAIL_NOT_CONFIGURED',
      message: `SMTP is not configured on the server. Missing: ${validation.missingVars.join(', ')}`,
      missingVars: validation.missingVars,
    };
  }

  const { fromEmail, fromName, isNamecheap } = validation.config;

  try {
    const transporter = getTransporter();

    const mailOptions = {
      from: `"${fromName.replace(/[\r\n]+/g, ' ')}" <${fromEmail}>`,
      to: to.trim(),
      subject: safeSubject,
      html,
      text: text || 'Please view this email in an HTML-capable email client.',
      attachments,
    };

    if (replyTo && isValidEmail(replyTo)) {
      mailOptions.replyTo = replyTo.trim();
    }

    const info = await transporter.sendMail(mailOptions);

    console.log('[EMAIL] Sent successfully:', {
      messageId: info.messageId,
      to,
      subject: safeSubject,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err) {
    _transporter = null;
    return categorizeSmtpError(err, to, safeSubject, isNamecheap);
  }
};

// ─── Verify SMTP Connection ───────────────────────────────────────────────────

/**
 * Verifies the SMTP connection without sending an email.
 */
export const verifySmtpConnection = async () => {
  // Check mock handler first
  if (_mockTransportHandler) {
    try {
      const res = await _mockTransportHandler({ verifyOnly: true });
      return res.success ? { success: true } : res;
    } catch (err) {
      return { success: false, errorCode: 'SMTP_CONNECTION_FAILED', message: err.message };
    }
  }

  const validation = validateSmtpConfig();
  if (!validation.valid) {
    return {
      success: false,
      errorCode: 'EMAIL_NOT_CONFIGURED',
      message: `SMTP not configured. Missing: ${validation.missingVars.join(', ')}`,
      missingVars: validation.missingVars,
    };
  }

  try {
    const transporter = getTransporter();
    await transporter.verify();
    return { success: true };
  } catch (err) {
    _transporter = null;
    const errMsg = (err.message || '').toLowerCase();
    const errCode = (err.code || '').toUpperCase();
    let errorCode = 'SMTP_CONNECTION_FAILED';

    if (errMsg.includes('auth') || errMsg.includes('535') || errCode === 'EAUTH') {
      errorCode = 'SMTP_AUTH_FAILED';
    } else if (errMsg.includes('timeout') || errCode === 'ETIMEDOUT') {
      errorCode = 'SMTP_TIMEOUT';
    }

    return {
      success: false,
      errorCode,
      message: errorCode === 'SMTP_AUTH_FAILED'
        ? 'SMTP authentication failed. Verify SMTP_USER and SMTP_PASSWORD.'
        : 'SMTP verification failed. Check SMTP_HOST and SMTP_PORT network accessibility.',
    };
  }
};

export default {
  sendEmail,
  validateSmtpConfig,
  isValidEmail,
  verifySmtpConnection,
  escapeHtml,
  getSmtpConfig,
  setMockTransportHandler,
  getMockTransportHandler,
};
