// Simulate clean Vercel serverless environment with missing env vars
process.env.VERCEL = '1';
delete process.env.PORT;
delete process.env.AIOSELL_USERNAME;
delete process.env.AIOSELL_PASSWORD;
delete process.env.AIOSELL_BASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;

console.log('[Diag] Testing import of api/index.js in simulated Vercel serverless mode...');

try {
  const handlerModule = await import('../api/index.js');
  console.log('[Diag] api/index.js successfully imported!');
  console.log('[Diag] Export keys:', Object.keys(handlerModule));
  console.log('[Diag] Default export type:', typeof handlerModule.default);

  const handler = handlerModule.default;
  if (typeof handler !== 'function') {
    throw new Error(`Expected handler to be a function, but got ${typeof handler}`);
  }

  // Simulate mock req and res for /api/aiosell/status
  const mockReq = {
    method: 'GET',
    url: '/api/aiosell/status',
    originalUrl: '/api/aiosell/status',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'TEST-VERCEL-DIAG-01',
    },
    on: () => {},
  };

  let statusCode = 200;
  let responseBody = null;
  let headersSent = false;

  const mockRes = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    status(code) {
      this.statusCode = code;
      statusCode = code;
      return this;
    },
    json(data) {
      this.setHeader('content-type', 'application/json');
      responseBody = JSON.stringify(data);
      headersSent = true;
      console.log('[Diag] res.json called with status:', this.statusCode, 'body:', responseBody.substring(0, 150));
    },
    send(data) {
      responseBody = data;
      headersSent = true;
      console.log('[Diag] res.send called with status:', this.statusCode);
    },
    end() {
      console.log('[Diag] res.end called');
    },
    on: (evt, cb) => {
      if (evt === 'finish') setTimeout(cb, 10);
    },
  };

  console.log('[Diag] Invoking handler(mockReq, mockRes)...');
  await handler(mockReq, mockRes);
  console.log('[Diag] Handler invocation completed!');
} catch (err) {
  console.error('[Diag] CRITICAL EXCEPTION during import or invocation:', err);
  process.exit(1);
}

process.exit(0);
