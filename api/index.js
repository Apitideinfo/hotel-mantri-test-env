import app from '../server/index.js';

export default function handler(req, res) {
  return new Promise((resolve) => {
    res.on('finish', resolve);
    res.on('close', resolve);
    res.on('error', (err) => {
      console.error('[Serverless] Response stream error:', err);
      resolve();
    });

    try {
      app(req, res);
    } catch (err) {
      console.error('[Serverless] Unhandled express invocation error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Internal server error occurred in serverless function.'
          }
        });
      }
      resolve();
    }
  });
}
