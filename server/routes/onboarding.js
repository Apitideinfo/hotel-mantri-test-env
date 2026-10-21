/**
 * Hotel Mantri — Onboarding Email Routes
 * Server-side endpoints for sending welcome emails to hotel owners.
 * Authenticated via Supabase JWT — Super Admin only.
 */

import { Router } from 'express';
import { sendEmail, validateSmtpConfig, isValidEmail } from '../services/emailService.js';
import { buildWelcomeEmail } from '../services/emailTemplates.js';
import { getServiceRoleClient, resolveUserFromJwt } from '../supabaseClient.js';

const router = Router();

// ── Middleware: Verify Super Admin ──────────────────────────────────────────────

const requireSuperAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        message: 'Authentication required. Please provide a valid Bearer token.',
      });
    }

    const jwt = authHeader.slice(7).trim();
    const user = await resolveUserFromJwt(jwt);
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Your session is invalid or expired. Please log in again.',
      });
    }

    // Check Super Admin role
    let db;
    try {
      db = getServiceRoleClient();
    } catch (e) {
      console.error('[ONBOARDING_ROUTE] Service role client error:', e.message);
      return res.status(500).json({
        success: false,
        code: 'SERVER_CONFIG_ERROR',
        message: 'Service role is not configured on server.',
      });
    }

    const { data: adminRecord } = await db
      .from('hotel_admins')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .maybeSingle();

    if (!adminRecord) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Super Admin access required.',
      });
    }

    req.authenticatedUser = user;
    next();
  } catch (err) {
    console.error('[ONBOARDING_AUTH_ERROR]', err.message);
    return res.status(500).json({
      success: false,
      code: 'AUTH_CHECK_FAILED',
      message: 'Unable to verify authentication.',
    });
  }
};

// ── POST /send-welcome-email ───────────────────────────────────────────────────

/**
 * Sends (or resends) a welcome email to a hotel owner.
 *
 * Body params:
 *   hotelId    - UUID of the hotel
 *   hotelName  - Display name of the hotel
 *   ownerName  - Full name of the owner
 *   ownerEmail - Email address to send to
 *   totalRooms - (optional) number of rooms
 *   categoryCount - (optional) number of room categories
 *   planName   - (optional) subscription plan name
 *   trialEndDate - (optional) trial end date string
 */
router.post('/send-welcome-email', requireSuperAdmin, async (req, res) => {
  const requestId = req.requestId || `HM-WEL-${Date.now().toString(36).toUpperCase()}`;

  try {
    const {
      hotelId,
      hotelName,
      ownerName,
      ownerEmail,
      totalRooms,
      categoryCount,
      planName,
      trialEndDate,
    } = req.body;

    // ── Validate inputs ──
    if (!hotelId || !hotelName || !ownerEmail) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_FAILED',
        message: 'hotelId, hotelName, and ownerEmail are required.',
        requestId,
      });
    }

    if (!isValidEmail(ownerEmail)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL',
        message: `Invalid owner email address: "${ownerEmail}"`,
        requestId,
      });
    }

    // ── Check SMTP config ──
    const smtpCheck = validateSmtpConfig();
    if (!smtpCheck.valid) {
      return res.status(503).json({
        success: false,
        code: 'EMAIL_NOT_CONFIGURED',
        message: `Email sending is not configured. Missing: ${smtpCheck.missingVars.join(', ')}`,
        requestId,
      });
    }

    // ── Build login URL ──
    const appBaseUrl = process.env.APP_BASE_URL || process.env.APP_URL || 'https://hotel-mantri-test-env.vercel.app';
    const loginUrl = `${appBaseUrl}/login`;
    const supportEmail = process.env.SUPPORT_EMAIL || process.env.SMTP_FROM_EMAIL || 'support@hotelmantri.com';

    // ── Generate password reset link (optional, but preferred for security) ──
    let passwordSetupUrl = null;
    try {
      const db = getServiceRoleClient();
      // Use Supabase's built-in password recovery (generates a secure, expiring magic link)
      const { data: resetData, error: resetError } = await db.auth.admin.generateLink({
        type: 'recovery',
        email: ownerEmail.trim().toLowerCase(),
        options: {
          redirectTo: `${appBaseUrl}/login?welcome=true`,
        },
      });

      if (!resetError && resetData?.properties?.action_link) {
        passwordSetupUrl = resetData.properties.action_link;
        console.log(`[WELCOME_EMAIL] [${requestId}] Password setup link generated for ${ownerEmail}`);
      } else if (resetError) {
        console.warn(`[WELCOME_EMAIL] [${requestId}] Password reset link generation failed: ${resetError.message}. Proceeding without setup link.`);
      }
    } catch (linkErr) {
      console.warn(`[WELCOME_EMAIL] [${requestId}] Password setup link error: ${linkErr.message}. Proceeding without.`);
    }

    // ── Build email ──
    const emailContent = buildWelcomeEmail({
      hotelName: hotelName.trim(),
      ownerName: (ownerName || '').trim() || 'Hotel Owner',
      ownerEmail: ownerEmail.trim(),
      loginUrl,
      passwordSetupUrl,
      trialEndDate: trialEndDate || null,
      totalRooms: totalRooms || null,
      categoryCount: categoryCount || null,
      supportEmail,
      planName: planName || null,
    });

    // ── Send email ──
    const result = await sendEmail({
      to: ownerEmail.trim(),
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (!result.success) {
      console.error(`[WELCOME_EMAIL] [${requestId}] Send failed:`, result);
      return res.status(502).json({
        success: false,
        code: result.errorCode || 'SEND_FAILED',
        message: result.message || 'Failed to send welcome email.',
        requestId,
      });
    }

    // ── Log the email delivery ──
    try {
      const db = getServiceRoleClient();
      await db.from('audit_logs').insert({
        user_id: req.authenticatedUser?.id ?? null,
        user_email: req.authenticatedUser?.email ?? '',
        role: 'super_admin',
        action: 'send_welcome_email',
        module: 'onboarding',
        hotel_id: hotelId,
        hotel_name: hotelName,
        record_id: result.messageId || '',
        new_value: {
          to: ownerEmail,
          subject: emailContent.subject,
          messageId: result.messageId,
          hasPasswordSetupLink: !!passwordSetupUrl,
        },
        severity: 'info',
      });
    } catch {
      // Audit logging is non-blocking
    }

    console.log(`[WELCOME_EMAIL] [${requestId}] Sent successfully to ${ownerEmail} for "${hotelName}" (messageId: ${result.messageId})`);

    return res.status(200).json({
      success: true,
      messageId: result.messageId,
      hasPasswordSetupLink: !!passwordSetupUrl,
      message: `Welcome email sent to ${ownerEmail}`,
      requestId,
    });
  } catch (err) {
    console.error(`[WELCOME_EMAIL] [${requestId}] Uncaught error:`, err.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred while sending the welcome email.',
      requestId,
    });
  }
});

// ── GET /smtp-status ───────────────────────────────────────────────────────────

/**
 * Returns SMTP configuration status (without exposing credentials).
 */
router.get('/smtp-status', requireSuperAdmin, async (req, res) => {
  const smtpCheck = validateSmtpConfig();
  return res.status(200).json({
    success: true,
    configured: smtpCheck.valid,
    missingVars: smtpCheck.valid ? [] : smtpCheck.missingVars,
  });
});

export default router;
