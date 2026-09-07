/**
 * ResolveX — complaint status lifecycle policy (STEP 8.5 hardening)
 *
 * Intended lifecycle:  open -> in_progress -> resolved -> closed
 * (with `rejected` as an admin off-ramp, reversible back to open/in_progress).
 *
 * A complaint must never move BACKWARDS out of a terminal state — in
 * particular resolved/closed -> in_progress is not allowed through the normal
 * update API. This is enforced server-side; the frontend guard is not relied on.
 */

const ALLOWED_TRANSITIONS = Object.freeze({
  open: ['open', 'in_progress', 'resolved', 'rejected'],
  in_progress: ['in_progress', 'open', 'resolved', 'rejected'],
  resolved: ['resolved', 'closed'],          // forward only
  closed: ['closed'],                         // terminal
  rejected: ['rejected', 'open', 'in_progress'], // an erroneous rejection can be reopened
});

/**
 * @param {string} from current complaint status
 * @param {string} to   requested complaint status
 * @returns {boolean} whether the transition is permitted
 */
function canTransition(from, to) {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed) return true; // unknown/legacy status — let mongoose enum validation handle it
  return allowed.includes(to);
}

module.exports = { ALLOWED_TRANSITIONS, canTransition };
