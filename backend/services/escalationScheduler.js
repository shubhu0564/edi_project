/**
 * ResolveX — Escalation scheduler (STEP 6)
 *
 * A lightweight in-process timer that periodically invokes the existing
 * escalation engine's processDueEscalations(). It contains NO escalation
 * rules of its own — all eligibility logic, idempotency, race protection and
 * notification creation live in escalationService / notificationService.
 *
 *   escalationScheduler.start()
 *        -> setInterval tick
 *             -> processDueEscalations()   (escalationService)
 *                  -> escalateComplaint()  (per complaint)
 *
 * Design points:
 *  - configurable interval via ESCALATION_INTERVAL_MS (default 60000ms)
 *  - in-process `isRunning` lock: overlapping ticks are skipped, never stacked
 *  - a failing run is caught and logged; it never crashes the process
 *  - quiet on healthy idle ticks (nothing due), verbose only when work happens
 *  - start() is idempotent; stop() clears the timer for graceful shutdown
 */

const { processDueEscalations } = require('./escalationService');

const PREFIX = '[ESCALATION-SCHEDULER]';
const DEFAULT_INTERVAL_MS = 60000; // 60s — appropriate for this project/demo
const MIN_INTERVAL_MS = 1000;      // guard against an absurdly aggressive value

let timer = null;
let isRunning = false;   // lock: a processing run is currently in flight
let intervalMs = DEFAULT_INTERVAL_MS;
const stats = { ticks: 0, skippedOverlaps: 0, runs: 0, totalEscalated: 0, lastSummary: null };

function resolveIntervalMs() {
  const raw = process.env.ESCALATION_INTERVAL_MS;
  if (raw === undefined || raw === '') return DEFAULT_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`${PREFIX} Invalid ESCALATION_INTERVAL_MS="${raw}" — falling back to ${DEFAULT_INTERVAL_MS}ms`);
    return DEFAULT_INTERVAL_MS;
  }
  return Math.max(MIN_INTERVAL_MS, Math.floor(parsed));
}

/**
 * Execute a single processing run, honouring the overlap lock.
 * Exposed for tests and for an optional immediate run on startup.
 * @param {object} [opts] forwarded to processDueEscalations (e.g. { filter })
 * @returns {Promise<{ ran:boolean, skipped?:boolean, summary?:object, error?:string }>}
 */
async function runTick(opts = {}) {
  stats.ticks += 1;

  if (isRunning) {
    stats.skippedOverlaps += 1;
    // Kept at debug level to avoid noisy logs on a busy system.
    console.debug(`${PREFIX} previous run still active — skipping this tick`);
    return { ran: false, skipped: true };
  }

  isRunning = true;
  try {
    const summary = await processDueEscalations(opts);
    stats.runs += 1;
    stats.totalEscalated += summary.escalated || 0;
    stats.lastSummary = summary;

    // Only log when something actually happened — silent on healthy idle ticks.
    if (summary.checked > 0 || summary.escalated > 0 || summary.failed > 0) {
      console.log(
        `${PREFIX} checked=${summary.checked} escalated=${summary.escalated} ` +
        `skipped=${summary.skipped} failed=${summary.failed}`
      );
      if (summary.failed > 0) {
        console.warn(`${PREFIX} failures: ${JSON.stringify(summary.failures)}`);
      }
    }
    return { ran: true, summary };
  } catch (err) {
    // A failed run must never take down the backend.
    console.error(`${PREFIX} run failed: ${err.message}`);
    return { ran: true, error: err.message };
  } finally {
    isRunning = false;
  }
}

/**
 * Start the periodic scheduler. Idempotent — a second call is a no-op.
 * @param {object} [opts]
 * @param {number} [opts.intervalMs]   - override the env/default interval (tests)
 * @param {boolean} [opts.runImmediately=false] - run one tick right away
 */
function start(opts = {}) {
  if (timer) {
    console.log(`${PREFIX} already running — ignoring duplicate start()`);
    return;
  }
  intervalMs = opts.intervalMs && opts.intervalMs > 0
    ? Math.max(MIN_INTERVAL_MS, Math.floor(opts.intervalMs))
    : resolveIntervalMs();

  timer = setInterval(() => {
    console.log(`${PREFIX} Checking for due complaints`);
    runTick().catch((err) => console.error(`${PREFIX} unexpected tick error: ${err.message}`));
  }, intervalMs);

  // Don't keep the event loop alive just for this timer — the HTTP server
  // keeps the process up; scripts that import this module can still exit.
  if (typeof timer.unref === 'function') timer.unref();

  console.log(`${PREFIX} Started — interval ${intervalMs}ms`);

  if (opts.runImmediately) {
    runTick().catch((err) => console.error(`${PREFIX} startup tick error: ${err.message}`));
  }
}

/**
 * Stop the scheduler and clear its timer. Safe to call multiple times and
 * safe to call when never started. Used by graceful-shutdown handlers.
 */
function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log(`${PREFIX} Stopped`);
  }
}

/** @returns {boolean} whether a processing run is currently in flight */
function isProcessing() {
  return isRunning;
}

/** @returns {boolean} whether the periodic timer is active */
function isStarted() {
  return timer !== null;
}

/** @returns {object} lightweight counters for diagnostics/tests */
function getStats() {
  return { ...stats, intervalMs, started: isStarted(), processing: isRunning };
}

module.exports = {
  DEFAULT_INTERVAL_MS,
  start,
  stop,
  runTick,
  isProcessing,
  isStarted,
  getStats
};
