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

// In-memory deduplication cache: key -> { timestamp, messageId, hasPasswordSetupLink }
const recentSendsCache = new Map();

// Periodic cleanup of sends cache (keep entries for 2 minutes max)
setInterval(() => {
  const cutoff = Date.now() - 120000;
  for (const [key, value] of recentSendsCache.entries()) {
    if (value.timestamp < cutoff) {
      recentSendsCache.delete(key);
    }
  }
}, 60000).unref();

// ── Middleware: Verify Super Admin ──────────────────────────────────────────────

export const requireSuperAdmin = async (req, res, next) => {
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

    // Check Super Admin privilege across:
    // 1. company_users (founder, company_admin)
    // 2. hotel_admins (super_admin)
    let isSuperAdmin = false;

    // Check company_users
    const { data: cu, error: cuErr } = await db
      .from('company_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('status', 'Active')
      .maybeSingle();

    if (!cuErr && cu && (cu.role === 'founder' || cu.role === 'company_admin')) {
      isSuperAdmin = true;
    }

    // Check hotel_admins if not already verified
    if (!isSuperAdmin) {
      const { data: ha, error: haErr } = await db
        .from('hotel_admins')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'super_admin')
        .maybeSingle();

      if (!haErr && ha) {
        isSuperAdmin = true;
      }
    }

    if (!isSuperAdmin) {
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
 *   hotelId      - UUID of the hotel (required)
 *   hotelName    - (optional if hotelId exists) Display name of the hotel
 *   ownerName    - (optional if hotelId exists) Full name of the owner
 *   ownerEmail   - (optional if hotelId exists) Email address to send to
 *   totalRooms   - (optional) number of rooms
 *   categoryCount - (optional) number of room categories
 *   planName     - (optional) subscription plan name
 *   trialEndDate - (optional) trial end date string
 *   forceResend  - (optional boolean) bypass recent send deduplication
 */
router.post('/send-welcome-email', requireSuperAdmin, async (req, res) => {
  const requestId = req.headers['x-request-id'] || req.body?.requestId || `HM-WEL-${Date.now().toString(36).toUpperCase()}`;

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
      forceResend = false,
    } = req.body;

    // ── 1. Require hotelId
    if (!hotelId) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_FAILED',
        message: 'hotelId is required to send owner welcome email.',
        requestId,
      });
    }

    // ── 2. Query authoritative hotel record from database
    let db;
    try {
      db = getServiceRoleClient();
    } catch (e) {
      return res.status(500).json({
        success: false,
        code: 'SERVER_CONFIG_ERROR',
        message: 'Database service client not available.',
        requestId,
      });
    }

    const { data: targetHotel, error: hotelErr } = await db
      .from('hotels')
      .select('id, hotel_name, owner_name, admin_email, total_rooms, subscription_status, is_active')
      .eq('id', hotelId)
      .maybeSingle();

    if (hotelErr || !targetHotel) {
      return res.status(404).json({
        success: false,
        code: 'HOTEL_NOT_FOUND',
        message: `Hotel with ID "${hotelId}" not found. Create the hotel before dispatching welcome emails.`,
        requestId,
      });
    }

    // Resolve verified details (prefer DB record for recipient email to prevent spoofing/typos)
    const effectiveOwnerEmail = (targetHotel.admin_email || ownerEmail || '').trim().toLowerCase();
    const effectiveHotelName = (targetHotel.hotel_name || hotelName || 'Your Hotel').trim();
    const effectiveOwnerName = (targetHotel.owner_name || ownerName || 'Hotel Owner').trim();
    const effectiveRooms = targetHotel.total_rooms || totalRooms || null;

    if (!effectiveOwnerEmail || !isValidEmail(effectiveOwnerEmail)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL',
        message: `Invalid or missing owner email address: "${effectiveOwnerEmail}"`,
        requestId,
      });
    }

    // ── 3. Deduplication Check (30 seconds window)
    const now = Date.now();
    const dedupeKey = `${hotelId}:${effectiveOwnerEmail}`;
    const recent = recentSendsCache.get(dedupeKey);

    if (!forceResend && recent && (now - recent.timestamp < 30000)) {
      console.log(`[WELCOME_EMAIL] [${requestId}] Deduplicated email request for hotel ${hotelId} (${effectiveOwnerEmail})`);
      return res.status(200).json({
        success: true,
        messageId: recent.messageId,
        hasPasswordSetupLink: recent.hasPasswordSetupLink,
        message: `Welcome email was recently sent to ${effectiveOwnerEmail}.`,
        status: 'sent',
        deduplicated: true,
        requestId,
      });
    }

    // ── 4. Validate SMTP configuration
    const smtpCheck = validateSmtpConfig();
    if (!smtpCheck.valid) {
      // Record failure in audit logs so status is visible to Super Admin
      try {
        await db.from('audit_logs').insert({
          user_id: req.authenticatedUser?.id ?? null,
          user_email: req.authenticatedUser?.email ?? '',
          role: 'super_admin',
          action: 'send_welcome_email_failed',
          module: 'onboarding',
          hotel_id: hotelId,
          hotel_name: effectiveHotelName,
          record_id: '',
          new_value: {
            to: effectiveOwnerEmail,
            error: `Email sending is not configured. Missing: ${smtpCheck.missingVars.join(', ')}`,
            errorCode: 'EMAIL_NOT_CONFIGURED',
            missingVars: smtpCheck.missingVars,
          },
          severity: 'warning',
        });
      } catch { /* non-blocking */ }

      return res.status(503).json({
        success: false,
        code: 'EMAIL_NOT_CONFIGURED',
        message: `Email sending is not configured. Missing environment variables: ${smtpCheck.missingVars.join(', ')}`,
        missingVars: smtpCheck.missingVars,
        status: 'failed',
        retryable: true,
        requestId,
      });
    }

    // ── 5. Build URLs & generate password setup link
    const appBaseUrl = process.env.APP_BASE_URL || process.env.APP_URL || 'https://hotel-mantri-test-env.vercel.app';
    const loginUrl = `${appBaseUrl.replace(/\/+$/, '')}/login`;
    const supportEmail = process.env.SUPPORT_EMAIL || process.env.SMTP_FROM_EMAIL || 'support@hotelmantri.com';

    let passwordSetupUrl = null;
    try {
      const { data: resetData, error: resetError } = await db.auth.admin.generateLink({
        type: 'recovery',
        email: effectiveOwnerEmail,
        options: {
          redirectTo: `${loginUrl}?welcome=true`,
        },
      });

      if (!resetError && resetData?.properties?.action_link) {
        passwordSetupUrl = resetData.properties.action_link;
        console.log(`[WELCOME_EMAIL] [${requestId}] Password setup link generated for ${effectiveOwnerEmail}`);
      } else if (resetError) {
        console.warn(`[WELCOME_EMAIL] [${requestId}] Password reset link generation skipped: ${resetError.message}. Proceeding with standard login instructions.`);
      }
    } catch (linkErr) {
      console.warn(`[WELCOME_EMAIL] [${requestId}] Password setup link error: ${linkErr.message}. Proceeding without link.`);
    }

    // ── 6. Build email content
    const emailContent = buildWelcomeEmail({
      hotelName: effectiveHotelName,
      ownerName: effectiveOwnerName,
      ownerEmail: effectiveOwnerEmail,
      loginUrl,
      passwordSetupUrl,
      trialEndDate: trialEndDate || null,
      totalRooms: effectiveRooms,
      categoryCount: categoryCount || null,
      supportEmail,
      planName: planName || (targetHotel.subscription_status ? `${targetHotel.subscription_status} Plan` : null),
    });

    // ── 7. Send email via SMTP
    const result = await sendEmail({
      to: effectiveOwnerEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (!result.success) {
      console.error(`[WELCOME_EMAIL] [${requestId}] Send failed:`, result);

      // Record failure state in audit_logs
      try {
        await db.from('audit_logs').insert({
          user_id: req.authenticatedUser?.id ?? null,
          user_email: req.authenticatedUser?.email ?? '',
          role: 'super_admin',
          action: 'send_welcome_email_failed',
          module: 'onboarding',
          hotel_id: hotelId,
          hotel_name: effectiveHotelName,
          record_id: '',
          new_value: {
            to: effectiveOwnerEmail,
            subject: emailContent.subject,
            error: result.message,
            errorCode: result.errorCode,
          },
          severity: 'warning',
        });
      } catch { /* non-blocking */ }

      return res.status(502).json({
        success: false,
        code: result.errorCode || 'SEND_FAILED',
        message: result.message || 'Failed to deliver welcome email. Please check SMTP configuration.',
        status: 'failed',
        retryable: true,
        recipient: effectiveOwnerEmail,
        hotelName: effectiveHotelName,
        requestId,
      });
    }

    // ── 8. Success: Log audit record & cache for deduplication
    recentSendsCache.set(dedupeKey, {
      timestamp: Date.now(),
      messageId: result.messageId,
      hasPasswordSetupLink: !!passwordSetupUrl,
    });

    try {
      await db.from('audit_logs').insert({
        user_id: req.authenticatedUser?.id ?? null,
        user_email: req.authenticatedUser?.email ?? '',
        role: 'super_admin',
        action: 'send_welcome_email',
        module: 'onboarding',
        hotel_id: hotelId,
        hotel_name: effectiveHotelName,
        record_id: result.messageId || '',
        new_value: {
          to: effectiveOwnerEmail,
          subject: emailContent.subject,
          messageId: result.messageId,
          hasPasswordSetupLink: !!passwordSetupUrl,
          sentAt: new Date().toISOString(),
        },
        severity: 'info',
      });
    } catch { /* non-blocking */ }

    // Update onboarding_attempts if applicable
    try {
      const { data: attempt } = await db
        .from('onboarding_attempts')
        .select('id, completed_steps')
        .eq('hotel_id', hotelId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (attempt) {
        const steps = Array.isArray(attempt.completed_steps) ? [...attempt.completed_steps] : [];
        if (!steps.includes('welcome_email_sent')) {
          steps.push('welcome_email_sent');
          await db
            .from('onboarding_attempts')
            .update({ completed_steps: steps, updated_at: new Date().toISOString() })
            .eq('id', attempt.id);
        }
      }
    } catch { /* non-blocking */ }

    console.log(`[WELCOME_EMAIL] [${requestId}] Sent successfully to ${effectiveOwnerEmail} for "${effectiveHotelName}" (msgId: ${result.messageId})`);

    return res.status(200).json({
      success: true,
      status: 'sent',
      messageId: result.messageId,
      hasPasswordSetupLink: !!passwordSetupUrl,
      message: `Welcome email sent to ${effectiveOwnerEmail}`,
      recipient: effectiveOwnerEmail,
      hotelName: effectiveHotelName,
      requestId,
    });
  } catch (err) {
    console.error(`[WELCOME_EMAIL] [${requestId}] Uncaught error:`, err.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred while sending the welcome email.',
      status: 'failed',
      retryable: true,
      requestId,
    });
  }
});

// ── GET /welcome-email-status ──────────────────────────────────────────────────

/**
 * Returns latest welcome email delivery status for a hotel.
 */
router.get('/welcome-email-status', requireSuperAdmin, async (req, res) => {
  const hotelId = req.query.hotelId || req.query.hotel_id;
  if (!hotelId) {
    return res.status(400).json({ success: false, message: 'hotelId query parameter is required.' });
  }

  try {
    const db = getServiceRoleClient();
    const { data: logs, error } = await db
      .from('audit_logs')
      .select('*')
      .eq('hotel_id', hotelId)
      .in('action', ['send_welcome_email', 'send_welcome_email_failed'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !logs || logs.length === 0) {
      return res.status(200).json({
        success: true,
        status: 'pending',
        message: 'No welcome email has been sent yet.',
      });
    }

    const latest = logs[0];
    const isSuccess = latest.action === 'send_welcome_email';

    return res.status(200).json({
      success: true,
      status: isSuccess ? 'sent' : 'failed',
      sentAt: latest.created_at,
      messageId: latest.record_id || null,
      details: latest.new_value || null,
      retryable: !isSuccess,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      code: 'QUERY_FAILED',
      message: err instanceof Error ? err.message : 'Failed to query email status',
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
    provider: smtpCheck.valid ? (smtpCheck.config?.isNamecheap ? 'Namecheap Private Email' : 'Standard SMTP') : 'Not Configured',
  });
});

export default router;
