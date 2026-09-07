/**
 * Centralized SLA matrix for ResolveX.
 *
 * This is the SINGLE source of truth for SLA durations and escalation targets
 * per complaint priority. Do not duplicate these values in controllers,
 * models, or frontend code — import from here (usually via services/slaService).
 *
 * Scope of STEP 3: SLA configuration + deadline calculation only.
 * The escalationTarget / escalationLevel fields are declared here so later
 * steps have a stable contract, but NO escalation logic is wired up yet.
 *
 * Shape per priority:
 *   {
 *     slaHours,          // hours allowed before the SLA deadline is breached
 *     initialAuthority,  // role responsible for the complaint on creation
 *     escalationTarget,  // role the complaint escalates to (used later)
 *     escalationLevel    // escalation level reached on first escalation (used later)
 *   }
 */

const SLA_MATRIX = Object.freeze({
  low: Object.freeze({
    slaHours: 48,
    initialAuthority: 'maintenance',
    escalationTarget: 'warden',
    escalationLevel: 1
  }),
  medium: Object.freeze({
    slaHours: 24,
    initialAuthority: 'maintenance',
    escalationTarget: 'warden',
    escalationLevel: 1
  }),
  high: Object.freeze({
    // NOTE: HIGH is 6 hours in ResolveX. The old 4-hour value is retired.
    slaHours: 6,
    initialAuthority: 'maintenance',
    escalationTarget: 'warden',
    escalationLevel: 1
  }),
  urgent: Object.freeze({
    slaHours: 1,
    initialAuthority: 'maintenance',
    escalationTarget: 'admin',
    escalationLevel: 1
  })
});

// Supported priorities — kept in sync with the Complaint schema enum.
const SUPPORTED_PRIORITIES = Object.freeze(Object.keys(SLA_MATRIX));

// Matches the Complaint schema default (`priority` defaults to 'medium').
const DEFAULT_PRIORITY = 'medium';

module.exports = { SLA_MATRIX, SUPPORTED_PRIORITIES, DEFAULT_PRIORITY };
