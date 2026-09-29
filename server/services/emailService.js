/**
 * Hotel Mantri — Email Service (SMTP)
 * Server-side only. SMTP credentials are NEVER exposed to the frontend.
 *
 * Required environment variables:
 *   SMTP_HOST
 *   SMTP_PORT
 *   SMTP_USER
 *   SMTP_PASSWORD
 *   SMTP_FROM_EMAIL
 *   SMTP_FROM_NAME  (optional, defaults to "Hotel Mantri")
 *   SMTP_SECURE     (optional: "true" for port 465, "false" for STARTTLS)
 */

import nodemailer from 'nodemailer';

// ─── Configuration ────────────────────────────────────────────────────────────

const getSmtpConfig = () => {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const fromEmail = process.env.SMTP_FROM_EMAIL;
  const fromName = process.env.SMTP_FROM_NAME || 'Hotel Mantri';

  // Auto-detect secure based on port: 465 = SSL/TLS, else STARTTLS
  const secureEnv = process.env.SMTP_SECURE;
  const secure = secureEnv !== undefined
    ? secureEnv === 'true'
    : port === 465;

  return { host, port, user, password, fromEmail, fromName, secure };
};

/**
 * Validates the SMTP configuration is complete.
 */
export const validateSmtpConfig = () => {
  const config = getSmtpConfig();
  const missing = [];
  if (!config.host) missing.push('SMTP_HOST');
  if (!config.user) missing.push('SMTP_USER');
  if (!config.password) missing.push('SMTP_PASSWORD');
  if (!config.fromEmail) missing.push('SMTP_FROM_EMAIL');

  if (missing.length > 0) {
    return { valid: false, missingVars: missing };
  }
  return { valid: true, config };
};

// ─── Email Validation ─────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim());
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

// ─── Transporter Cache ────────────────────────────────────────────────────────

let _transporter = null;

const getTransporter = () => {
  const validation = validateSmtpConfig();
  if (!validation.valid) {
    throw Object.assign(new Error(`SMTP not configured. Missing: ${validation.missingVars.join(', ')}`), {
      code: 'EMAIL_NOT_CONFIGURED',
      missingVars: validation.missingVars,
    });
  }

  const { host, port, user, password, secure } = validation.config;

  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass: password },
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 30000,
    });
  }

  return _transporter;
};

// ─── Main Send Function ───────────────────────────────────────────────────────

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
  // ── Validate recipient
  if (!to || !isValidEmail(to)) {
    return {
      success: false,
      errorCode: 'INVALID_RECIPIENT',
      message: `Invalid or missing recipient email: "${to}"`,
    };
  }

  // ── Validate SMTP config
  const validation = validateSmtpConfig();
  if (!validation.valid) {
    console.error('[EMAIL] SMTP not configured. Missing:', validation.missingVars);
    return {
      success: false,
      errorCode: 'EMAIL_NOT_CONFIGURED',
      message: `SMTP is not configured. Missing environment variables: ${validation.missingVars.join(', ')}`,
    };
  }

  const { fromEmail, fromName } = validation.config;

  try {
    const transporter = getTransporter();

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: to.trim(),
      subject,
      html,
      text: text || 'Please view this email in an HTML-capable email client.',
      attachments,
    };

    if (replyTo && isValidEmail(replyTo)) {
      mailOptions.replyTo = replyTo;
    }

    const info = await transporter.sendMail(mailOptions);

    console.log('[EMAIL] Sent successfully:', {
      messageId: info.messageId,
      to,
      subject,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err) {
    // Categorize error — NEVER expose SMTP password in error messages
    let errorCode = 'SMTP_SEND_FAILED';
    let safeMessage = 'Failed to send email.';

    const errMsg = (err.message || '').toLowerCase();

    if (errMsg.includes('auth') || errMsg.includes('535') || errMsg.includes('534')) {
      errorCode = 'SMTP_AUTH_FAILED';
      safeMessage = 'SMTP authentication failed. Please verify SMTP_USER and SMTP_PASSWORD.';
      _transporter = null;
    } else if (errMsg.includes('connect') || errMsg.includes('enotfound') || errMsg.includes('econnrefused') || errMsg.includes('etimedout')) {
      errorCode = 'SMTP_CONNECTION_FAILED';
      safeMessage = 'SMTP connection failed. Please verify SMTP_HOST and SMTP_PORT.';
      _transporter = null;
    } else if (errMsg.includes('invalid') && errMsg.includes('recipient')) {
      errorCode = 'INVALID_RECIPIENT';
      safeMessage = `Invalid recipient: ${to}`;
    }

    console.error('[EMAIL] Send failed:', {
      errorCode,
      to,
      subject,
      errType: err.code || err.responseCode || 'UNKNOWN',
    });

    return {
      success: false,
      errorCode,
      message: safeMessage,
    };
  }
};

// ─── Verify SMTP Connection ───────────────────────────────────────────────────

/**
 * Verifies the SMTP connection without sending an email.
 */
export const verifySmtpConnection = async () => {
  const validation = validateSmtpConfig();
  if (!validation.valid) {
    return {
      success: false,
      errorCode: 'EMAIL_NOT_CONFIGURED',
      message: `SMTP not configured. Missing: ${validation.missingVars.join(', ')}`,
    };
  }

  try {
    const transporter = getTransporter();
    await transporter.verify();
    return { success: true };
  } catch (err) {
    _transporter = null;
    const errMsg = (err.message || '').toLowerCase();
    let errorCode = 'SMTP_CONNECTION_FAILED';
    if (errMsg.includes('auth') || errMsg.includes('535')) errorCode = 'SMTP_AUTH_FAILED';
    return {
      success: false,
      errorCode,
      message: 'SMTP verification failed. Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD.',
    };
  }
};

export default { sendEmail, validateSmtpConfig, isValidEmail, verifySmtpConnection, escapeHtml };
