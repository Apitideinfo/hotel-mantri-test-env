/**
 * HOTEL MANTRI — Chatbot Booking API: Express Application Factory
 * 
 * Provides:
 * 1. Hardened middleware pipeline (Helmet-grade headers, CORS allowlist, rate limits)
 * 2. Raw request buffer preservation for webhook signature validation
 * 3. Health check endpoint exposing zero secrets or credentials
 * 4. Versioned API routing under /v1/public and /v1/payments
 * 5. Sanitized 404 and error responses
 */

import express from 'express';
import {
  requestIdMiddleware,
  securityHeadersMiddleware,
  createCorsMiddleware,
  errorHandlerMiddleware,
} from './middleware/security.js';
import publicRoutes from './routes/publicRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import { getPublicHotelProfile } from './services/hotelConfigService.js';

export const createApp = () => {
  const app = express();

  // 1. Security Headers & Request ID Tracking
  app.use(requestIdMiddleware);
  app.use(securityHeadersMiddleware);

  // 2. Production CORS
  app.use(createCorsMiddleware());

  // 3. Request Body Parsing with Raw Buffer Preservation (SEC-10 & Webhook HMAC)
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.use(
    express.urlencoded({
      extended: true,
      limit: '1mb',
    })
  );

  // 4. Health Check Endpoints (exposes zero secrets or credentials)
  const healthHandler = (req, res) => {
    let hotelProfile = null;
    try {
      const p = getPublicHotelProfile();
      hotelProfile = { hotelName: p.hotelName, hotelId: p.hotelId };
    } catch {
      hotelProfile = { status: 'uninitialized' };
    }

    res.status(200).json({
      success: true,
      status: 'healthy',
      service: 'hotel-mantri-chatbot-booking-api',
      version: '1.0.0',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      boundHotel: hotelProfile,
      requestId: req.requestId,
    });
  };

  app.get('/', healthHandler);
  app.get('/health', healthHandler);
  app.get('/v1/health', healthHandler);

  // 5. Versioned API Routes
  app.use('/v1/public', publicRoutes);
  app.use('/v1/payments', paymentRoutes);

  // 6. Global 404 Handler for Unmatched Routes
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Endpoint ${req.method} ${req.originalUrl || req.url} does not exist.`,
        requestId: req.requestId,
      },
    });
  });

  // 7. Centralized Error Handler
  app.use(errorHandlerMiddleware);

  return app;
};

export default createApp;
