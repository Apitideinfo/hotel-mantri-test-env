/**
 * HOTEL MANTRI — Chatbot Booking API: Server Startup & Lifecycle Management
 */

import { config } from './config/environment.js';
import { createApp } from './app.js';
import { initializeHotelTenant } from './services/hotelConfigService.js';

const startServer = async () => {
  try {
    const env = config();
    console.log('------------------------------------------------------------');
    console.log('Starting Hotel Mantri Standalone Chatbot Booking API Server');
    console.log(`Environment: ${env.nodeEnv} | Target Port: ${env.port}`);
    console.log('------------------------------------------------------------');

    // Fail-closed initialization of the configured hotel tenant
    await initializeHotelTenant();

    const app = createApp();

    const server = app.listen(env.port, () => {
      console.log(`✓ Chatbot Booking API is listening on ${env.publicApiBaseUrl} (Port ${env.port})`);
      console.log(`✓ Health endpoint: ${env.publicApiBaseUrl}/health`);
      console.log(`✓ Public endpoints mounted under: ${env.publicApiBaseUrl}/v1/public/`);
      console.log(`✓ Webhook endpoint mounted under: ${env.publicApiBaseUrl}/v1/payments/razorpay/webhook`);
      console.log('------------------------------------------------------------');
    });

    // Graceful Shutdown
    const shutdown = (signal) => {
      console.log(`[Server] Received ${signal}. Draining active connections...`);
      server.close(() => {
        console.log('[Server] All connections closed. Service stopped safely.');
        process.exit(0);
      });
      // Force exit after 10 seconds if connections fail to close
      setTimeout(() => {
        console.error('[Server] Forcing shutdown after timeout.');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('FATAL [Server Startup Failed]:', err.message);
    process.exit(1);
  }
};

startServer();
