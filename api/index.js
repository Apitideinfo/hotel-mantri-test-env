import app from '../server/index.js';

export default function handler(req, res) {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    const attachListener = (event, fn) => {
      if (typeof res.once === 'function') {
        res.once(event, fn);
      } else if (typeof res.on === 'function') {
        res.on(event, fn);
      }
    };

    attachListener('finish', finish);
    attachListener('close', finish);
    attachListener('error', (err) => {
      console.error('[Vercel Serverless] Response stream error:', err);
      finish();
    });

    const origEnd = res.end;
    res.end = function (...args) {
      const result = typeof origEnd === 'function' ? origEnd.apply(this, args) : undefined;
      finish();
      return result;
    };

    try {
      app(req, res, (err) => {
        if (err) {
          console.error('[Vercel Serverless] Unhandled error reached root handler:', err);
          if (!res.headersSent) {
            res.statusCode = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: false,
              error: {
                code: err?.code || 'INTERNAL_SERVER_ERROR',
                message: err?.message || 'An unexpected server error occurred.'
              }
            }));
          }
        }
        finish();
      });
    } catch (syncErr) {
      console.error('[Vercel Serverless] Synchronous exception during invocation:', syncErr);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Serverless execution error occurred.'
          }
        }));
      }
      finish();
    }
  });
}
