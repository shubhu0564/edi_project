/**
 * ResolveX — Escalation engine (STEP 5)
 *
 * Central source of truth for escalation BEHAVIOR. Controllers and (later) the
 * scheduler must go through this module — escalation logic lives nowhere else.
 *
 * Scope of this step: backend engine only. No scheduler/cron/timers, no
 * notifications, no priority queue, no public API. Everything here is manually
 * invokable and covered by scripts/verifyEscalationService.js.
 *
 * SLA durations and escalation targets come from the centralized SLA matrix
 * (config/slaMatrix.js via services/slaService). This file never hard-codes
 * "6" / "24" / "48" / "1" or a priority→role mapping of its own.
 */

const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
const Escalation = require('../models/Escalation');
const User = require('../models/User');
const { getSLAConfig } = require('./slaService');
const { notifyEscalation } = require('./notificationService');

// Complaint statuses that end the lifecycle — never eligible for escalation.
// Matches the KPI logic in complaintController (RESOLVED_STATUSES).
const TERMINAL_STATUSES = ['resolved', 'closed'];

// First escalation stage handled by this step.
const BASE_LEVEL = 0;

function log(...args) {
  console.log('[ESCALATION]', ...args);
}

/**
 * The role a complaint escalates to when its SLA is breached, per the
 * centralized matrix (LOW/MEDIUM/HIGH -> warden, URGENT -> admin).
 * @param {string} priority
 * @returns {{ fromRole: string, toRole: string, fromLevel: number, toLevel: number }}
 */
function getEscalationTarget(priority) {
  const cfg = getSLAConfig(priority); // validates priority, throws on unknown
  return {
    fromRole: cfg.initialAuthority,      // 'maintenance'
    toRole: cfg.escalationTarget,        // 'warden' | 'admin'
    fromLevel: BASE_LEVEL,               // 0
    toLevel: cfg.escalationLevel         // 1
  };
}

/**
 * Pure predicate: is this complaint currently eligible for a first escalation?
 * @param {object} complaint - a Complaint document or plain object
 * @param {Date} [now]
 * @returns {{ eligible: boolean, reason: string }}
 */
function shouldEscalate(complaint, now = new Date()) {
  if (!complaint) return { eligible: false, reason: 'complaint_not_found' };

  if (TERMINAL_STATUSES.includes(complaint.status)) {
    return { eligible: false, reason: `status_${complaint.status}` };
  }

  const deadline = complaint.slaDeadline;
  const deadlineMs = deadline == null ? NaN : new Date(deadline).getTime();
  if (Number.isNaN(deadlineMs)) {
    return { eligible: false, reason: 'no_sla_deadline' };
  }

  if (now.getTime() < deadlineMs) {
    return { eligible: false, reason: 'sla_not_breached' };
  }

  // Idempotency at the predicate level: already escalated past level 0.
  if (complaint.isEscalated === true || (complaint.escalationLevel || 0) > BASE_LEVEL) {
    return { eligible: false, reason: 'already_escalated' };
  }

  return { eligible: true, reason: 'sla_breached' };
}

/**
 * Deterministically pick the active user that a complaint of this priority
 * should escalate to. Oldest matching account wins (stable across runs).
 * Uses the existing User.isActive flag — no new status field is introduced.
 * @param {string} toRole - 'warden' | 'admin'
 * @returns {Promise<object|null>} User doc or null when none is available
 */
async function findTargetAuthority(toRole) {
  return User.findOne({ role: toRole, isActive: true })
    .sort({ createdAt: 1, _id: 1 })
    .select('_id name role');
}

/**
 * Escalate a single complaint (first stage: L0 -> L1) if it is eligible.
 * Idempotent and race-safe: the state change is a single atomic conditional
 * update; concurrent callers see exactly one winner.
 *
 * @param {string|ObjectId} complaintId
 * @param {object} [opts]
 * @param {Date}   [opts.now]              - reference time (defaults to now)
 * @param {string} [opts.reason]           - override the generated reason string
 * @param {function} [opts.resolveAuthority] - async (toRole) => User|null. Injection
 *          point for the scheduler/tests; defaults to findTargetAuthority.
 * @returns {Promise<{status:'escalated'|'skipped'|'failed', reason:string, complaintId:string, escalationId?:string, toRole?:string, authorityId?:string}>}
 */
async function escalateComplaint(complaintId, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const resolveAuthority = typeof opts.resolveAuthority === 'function'
    ? opts.resolveAuthority
    : findTargetAuthority;
  const idStr = String(complaintId);

  // 1. Read current state (lean — we only need it to decide + get priority).
  const complaint = await Complaint.findById(complaintId)
    .select('priority status slaDeadline isEscalated escalationLevel assignedTo title')
    .lean();

  const gate = shouldEscalate(complaint, now);
  if (!gate.eligible) {
    return { status: 'skipped', reason: gate.reason, complaintId: idStr };
  }

  // 2. Resolve the escalation target from the centralized matrix.
  let target;
  try {
    target = getEscalationTarget(complaint.priority);
  } catch (err) {
    log(`Complaint ${idStr} has unusable priority "${complaint.priority}": ${err.message}`);
    return { status: 'failed', reason: 'invalid_priority', complaintId: idStr };
  }

  // 3. Find a concrete authority user BEFORE claiming the complaint. If there
  //    is nobody to escalate to, leave the complaint completely untouched.
  const authority = await resolveAuthority(target.toRole);
  if (!authority) {
    log(`Complaint ${idStr}: no active "${target.toRole}" available — not escalating`);
    return { status: 'failed', reason: `no_${target.toRole}_available`, complaintId: idStr };
  }

  // 4. Atomic conditional claim. The filter repeats every eligibility
  //    condition, so if another worker (or an earlier run) already escalated
  //    this complaint, or it was resolved in the meantime, this matches
  //    nothing and returns null — no duplicate escalation is possible.
  //    NOTE: assignedTo is deliberately NOT in the $set — the maintenance
  //    staff member keeps the complaint; only the escalation authority is added.
  const claimed = await Complaint.findOneAndUpdate(
    {
      _id: complaint._id,
      isEscalated: false,
      escalationLevel: BASE_LEVEL,
      status: { $nin: TERMINAL_STATUSES },
      slaDeadline: { $ne: null, $lte: now }
    },
    {
      $set: {
        isEscalated: true,
        escalatedAt: now,
        currentAuthority: authority._id,
        currentAuthorityRole: target.toRole
      },
      $inc: { escalationLevel: 1, escalationCount: 1 }
    },
    { new: true }
  );

  if (!claimed) {
    // Someone/something else got there first, or it stopped being eligible.
    return { status: 'skipped', reason: 'already_escalated_or_ineligible', complaintId: idStr };
  }

  // 5. Record the escalation event. If this fails, roll the claim back so the
  //    complaint never shows "escalated" without a matching Escalation record.
  const reason = opts.reason
    || `SLA deadline exceeded for ${String(complaint.priority).toUpperCase()} priority complaint`;

  let escalation;
  try {
    escalation = await Escalation.create({
      complaintId: claimed._id,
      fromLevel: target.fromLevel,
      toLevel: target.toLevel,
      fromRole: target.fromRole,
      toRole: target.toRole,
      reason,
      escalatedAt: now
    });
  } catch (err) {
    log(`Complaint ${idStr}: failed to write Escalation record (${err.message}) — rolling back claim`);
    await Complaint.updateOne(
      { _id: claimed._id, isEscalated: true, escalationLevel: target.toLevel },
      {
        $set: { isEscalated: false, escalatedAt: null, currentAuthority: null, currentAuthorityRole: null },
        $inc: { escalationLevel: -1, escalationCount: -1 }
      }
    );
    return { status: 'failed', reason: 'escalation_record_write_failed', complaintId: idStr };
  }

  log(`Complaint ${idStr} escalated L${target.fromLevel} -> L${target.toLevel}`);
  log(`${String(complaint.priority).toUpperCase()} SLA exceeded`);
  log(`Target authority: ${target.toRole} ${authority._id}`);

  // 6. Notify the selected authority. This runs only on the single successful
  //    escalation path (the atomic claim above guarantees it happens once per
  //    complaint), and notifyEscalation is itself an idempotent upsert — so
  //    repeated scheduler runs never create a duplicate notification. A
  //    notification failure is logged but does NOT roll back a valid
  //    escalation (the Escalation record is the source of truth).
  let notificationId = null;
  try {
    const notif = await notifyEscalation({
      complaintId: claimed._id,
      recipientUserId: authority._id,
      priority: complaint.priority,
      toRole: target.toRole,
      complaintTitle: complaint.title
    });
    notificationId = notif.notificationId;
  } catch (err) {
    log(`Complaint ${idStr}: escalation succeeded but notification failed — ${err.message}`);
  }

  return {
    status: 'escalated',
    reason: 'sla_breached',
    complaintId: idStr,
    escalationId: String(escalation._id),
    toRole: target.toRole,
    authorityId: String(authority._id),
    notificationId
  };
}

/**
 * Find all overdue, unresolved complaints and escalate each one safely.
 * Streams the query with a cursor so the whole collection is never held in
 * memory. One complaint failing never aborts the batch.
 *
 * @param {object} [opts]
 * @param {Date}   [opts.now]
 * @param {number} [opts.batchSize=100]
 * @param {number} [opts.limit]        - optional cap on complaints examined
 * @param {object} [opts.filter]       - extra query conditions ANDed into the
 *          due-complaint query (e.g. to scope a run to a subset). Cannot loosen
 *          the core eligibility conditions.
 * @param {function} [opts.resolveAuthority] - forwarded to escalateComplaint
 * @returns {Promise<{checked:number, escalated:number, skipped:number, failed:number, failures:Array}>}
 */
async function processDueEscalations(opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const batchSize = opts.batchSize || 100;

  const filter = {
    ...(opts.filter || {}),
    slaDeadline: { $ne: null, $lte: now },
    status: { $nin: TERMINAL_STATUSES },
    isEscalated: false
  };

  const summary = { checked: 0, escalated: 0, skipped: 0, failed: 0, failures: [] };

  let query = Complaint.find(filter).select('_id').sort({ slaDeadline: 1 }).batchSize(batchSize);
  if (opts.limit) query = query.limit(opts.limit);

  const cursor = query.cursor();
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    summary.checked += 1;
    try {
      const result = await escalateComplaint(doc._id, { now, resolveAuthority: opts.resolveAuthority });
      if (result.status === 'escalated') summary.escalated += 1;
      else if (result.status === 'failed') {
        summary.failed += 1;
        summary.failures.push({ complaintId: result.complaintId, reason: result.reason });
      } else {
        summary.skipped += 1;
      }
    } catch (err) {
      // Defensive: escalateComplaint already handles its own errors, but the
      // loop must survive anything unexpected.
      summary.failed += 1;
      summary.failures.push({ complaintId: String(doc._id), reason: err.message });
      log(`Unexpected error processing complaint ${doc._id}: ${err.message}`);
    }
  }

  log(`processDueEscalations: checked=${summary.checked} escalated=${summary.escalated} skipped=${summary.skipped} failed=${summary.failed}`);
  return summary;
}

/**
 * Mark an escalation as acknowledged by the responsible authority.
 * @param {string|ObjectId} escalationId
 * @returns {Promise<{status:'acknowledged'|'already_acknowledged', escalationId:string, acknowledgedAt:Date}>}
 * @throws {Error} when the escalation does not exist
 */
async function acknowledgeEscalation(escalationId) {
  if (!mongoose.isValidObjectId(escalationId)) {
    throw new Error('acknowledgeEscalation: invalid escalation id');
  }
  const escalation = await Escalation.findById(escalationId);
  if (!escalation) {
    throw new Error('acknowledgeEscalation: escalation not found');
  }
  // Do not overwrite an existing acknowledgement timestamp.
  if (escalation.acknowledgedAt) {
    return { status: 'already_acknowledged', escalationId: String(escalation._id), acknowledgedAt: escalation.acknowledgedAt };
  }
  escalation.acknowledgedAt = new Date();
  await escalation.save();
  log(`Escalation ${escalationId} acknowledged`);
  return { status: 'acknowledged', escalationId: String(escalation._id), acknowledgedAt: escalation.acknowledgedAt };
}

/**
 * Mark an escalation as resolved. Requires prior acknowledgement — an
 * escalation should be seen by the authority before it is closed out.
 * @param {string|ObjectId} escalationId
 * @param {object} [opts]
 * @param {boolean} [opts.force=false] - allow resolving without acknowledgement
 * @returns {Promise<{status:'resolved'|'already_resolved', escalationId:string, resolvedAt:Date}>}
 * @throws {Error} when the escalation does not exist or ack is required
 */
async function resolveEscalation(escalationId, opts = {}) {
  if (!mongoose.isValidObjectId(escalationId)) {
    throw new Error('resolveEscalation: invalid escalation id');
  }
  const escalation = await Escalation.findById(escalationId);
  if (!escalation) {
    throw new Error('resolveEscalation: escalation not found');
  }
  if (escalation.resolvedAt) {
    return { status: 'already_resolved', escalationId: String(escalation._id), resolvedAt: escalation.resolvedAt };
  }
  if (!escalation.acknowledgedAt && !opts.force) {
    throw new Error('resolveEscalation: escalation must be acknowledged before it can be resolved');
  }
  escalation.resolvedAt = new Date();
  await escalation.save();
  log(`Escalation ${escalationId} resolved`);
  return { status: 'resolved', escalationId: String(escalation._id), resolvedAt: escalation.resolvedAt };
}

/**
 * Close out any open Escalation records for a complaint that has just been
 * resolved/closed, so escalation state does not stay misleading. Used by the
 * complaint update flow. Never fabricates data for legacy complaints.
 * @param {string|ObjectId} complaintId
 * @param {Date} [resolvedAt]
 * @returns {Promise<number>} number of escalation records closed
 */
async function closeEscalationsForResolvedComplaint(complaintId, resolvedAt = new Date()) {
  const res = await Escalation.updateMany(
    { complaintId, resolvedAt: null },
    { $set: { resolvedAt } }
  );
  return res.modifiedCount || 0;
}

module.exports = {
  TERMINAL_STATUSES,
  getEscalationTarget,
  shouldEscalate,
  findTargetAuthority,
  escalateComplaint,
  processDueEscalations,
  acknowledgeEscalation,
  resolveEscalation,
  closeEscalationsForResolvedComplaint
};
