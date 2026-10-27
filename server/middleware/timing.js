/**
 * HOTEL MANTRI — High-Resolution Server Timing & Performance Instrumentation Middleware
 * 
 * Complies with W3C Server-Timing standard:
 * https://www.w3.org/TR/server-timing/
 * 
 * Features:
 * 1. Nanosecond precision via process.hrtime.bigint() / performance.now()
 * 2. Scoped timers for auth, database, lock, validation, and serialization
 * 3. Formats standard Server-Timing HTTP header for browser DevTools Network tab
 * 4. Logs structured performance metrics with X-Request-Id (NEVER logs PII, tokens, or payloads)
 */

import { performance } from 'perf_hooks';

export const timingMiddleware = (req, res, next) => {
  const startHr = process.hrtime.bigint();
  const startPerf = performance.now();
  const timings = new Map();

  /**
   * Records a timing measurement in milliseconds.
   * @param {string} name - Metric name (e.g. 'auth', 'db_read', 'db_write', 'lock')
   * @param {number} durationMs - Elapsed time in milliseconds
   * @param {string} [description] - Optional human-readable description
   */
  req.recordTiming = (name, durationMs, description = '') => {
    if (!name) return;
    const existing = timings.get(name) || { total: 0, count: 0, description };
    existing.total += Math.round(durationMs * 100) / 100;
    existing.count += 1;
    if (description) existing.description = description;
    timings.set(name, existing);
  };

  /**
   * Measures the execution time of an asynchronous function.
   * @param {string} name - Metric name
   * @param {Function} asyncFn - Async task to execute and measure
   * @param {string} [description] - Optional description
   */
  req.timeStep = async (name, asyncFn, description = '') => {
    const t0 = performance.now();
    try {
      return await asyncFn();
    } finally {
      const dur = performance.now() - t0;
      req.recordTiming(name, dur, description);
    }
  };

  // Intercept response finish to build Server-Timing header and log performance metric
  res.on('finish', () => {
    const totalNs = process.hrtime.bigint() - startHr;
    const totalMs = Number(totalNs) / 1_000_000;
    const roundedTotal = Math.round(totalMs * 100) / 100;

    const parts = [];
    for (const [name, data] of timings.entries()) {
      const desc = data.description ? `;desc="${data.description}"` : '';
      parts.push(`${name};dur=${data.total}${desc}`);
    }
    parts.push(`total;dur=${roundedTotal}`);

    // If headers haven't already been sent, append Server-Timing
    try {
      if (!res.headersSent) {
        res.setHeader('Server-Timing', parts.join(', '));
      }
    } catch {
      // ignore header write error
    }

    // Structured logging for operations exceeding 200ms or all write endpoints
    const isWrite = req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE';
    if (roundedTotal > 200 || isWrite) {
      const stepSummary = Array.from(timings.entries())
        .map(([k, v]) => `${k}=${v.total}ms`)
        .join(' ');
      const reqId = req.requestId || res.getHeader('X-Request-Id') || 'NO_ID';
      console.log(`[PERF] ${req.method} ${req.originalUrl || req.url} | ${res.statusCode} | total=${roundedTotal}ms | reqId=${reqId} ${stepSummary ? `| ${stepSummary}` : ''}`);
    }
  });

  next();
};

export default timingMiddleware;
