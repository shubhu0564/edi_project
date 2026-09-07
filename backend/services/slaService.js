/**
 * SLA service for ResolveX.
 *
 * Reusable, side-effect-free helpers built on the centralized SLA matrix
 * (config/slaMatrix.js). Controllers should use this module rather than
 * reading the matrix directly or hardcoding deadlines.
 *
 * STEP 3 scope: config lookup + deadline calculation only. No escalation,
 * no scheduler, no persistence here.
 */

const { SLA_MATRIX, SUPPORTED_PRIORITIES, DEFAULT_PRIORITY } = require('../config/slaMatrix');

/**
 * Normalize and validate a priority value.
 * @param {string} priority
 * @returns {string} lowercased, trimmed, supported priority
 * @throws {Error} if the priority is missing or unsupported
 */
function normalizePriority(priority) {
  if (typeof priority !== 'string' || priority.trim() === '') {
    throw new Error(
      `SLA service: priority is required (expected one of: ${SUPPORTED_PRIORITIES.join(', ')})`
    );
  }
  const normalized = priority.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(SLA_MATRIX, normalized)) {
    throw new Error(
      `SLA service: unsupported priority "${priority}" (expected one of: ${SUPPORTED_PRIORITIES.join(', ')})`
    );
  }
  return normalized;
}

/**
 * Look up the SLA configuration for a priority.
 * @param {string} priority - one of: low, medium, high, urgent (case-insensitive)
 * @returns {{slaHours:number, initialAuthority:string, escalationTarget:string, escalationLevel:number}}
 * @throws {Error} on unknown/invalid priority
 */
function getSLAConfig(priority) {
  const normalized = normalizePriority(priority);
  // Return a shallow copy so callers can't mutate the frozen matrix indirectly.
  return { ...SLA_MATRIX[normalized] };
}

/**
 * Calculate the SLA deadline for a complaint.
 *
 * @param {string} priority - one of: low, medium, high, urgent (case-insensitive)
 * @param {Date|string|number} startTime - the authoritative complaint creation time
 * @returns {Date} startTime + slaHours
 * @throws {Error} on unknown priority or invalid startTime
 *
 * Examples:
 *   calculateDeadline('high',   '2026-09-07T10:00:00Z') -> 2026-09-07T16:00:00Z
 *   calculateDeadline('urgent', '2026-09-07T10:00:00Z') -> 2026-09-07T11:00:00Z
 *   calculateDeadline('low',    '2026-09-07T10:00:00Z') -> 2026-09-09T10:00:00Z
 */
function calculateDeadline(priority, startTime) {
  const { slaHours } = getSLAConfig(priority);

  const start = startTime instanceof Date ? startTime : new Date(startTime);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`SLA service: invalid startTime "${startTime}"`);
  }

  return new Date(start.getTime() + slaHours * 60 * 60 * 1000);
}

module.exports = {
  getSLAConfig,
  calculateDeadline,
  normalizePriority,
  SUPPORTED_PRIORITIES,
  DEFAULT_PRIORITY
};
