/**
 * ResolveX — complaint resolution service (STEP 8.5)
 *
 * THE single place that marks a COMPLAINT resolved. Both the admin update
 * path (complaintController.updateComplaint) and the maintenance completion
 * path (maintenanceController.updateTask) go through here so the SLA outcome
 * is recorded consistently no matter who resolves the complaint.
 *
 * IMPORTANT — two different "resolve" concepts, kept separate:
 *   • resolve a COMPLAINT  -> this file (status -> resolved, resolvedAt,
 *                             resolvedWithinSla, close open escalations,
 *                             notify the student)
 *   • resolve an ESCALATION -> escalationService.resolveEscalation()
 *                             (escalation.resolvedAt only; complaint untouched)
 * Do not conflate them.
 *
 * Nothing about the SLA matrix / slaService / escalationService / scheduler /
 * notificationService is modified — this only consumes the already-exported
 * closeEscalationsForResolvedComplaint helper.
 */

const Maintenance = require('../models/Maintenance');
const Notification = require('../models/Notification');
const { closeEscalationsForResolvedComplaint } = require('./escalationService');

const RESOLVED_STATUSES = ['resolved', 'closed'];

/**
 * Mark a complaint resolved. The SERVER owns resolvedAt and resolvedWithinSla —
 * neither is ever taken from client input.
 *
 * @param {import('mongoose').Document} complaint - a Complaint mongoose document
 * @param {object}  [opts]
 * @param {Date}    [opts.now]                        - reference time (defaults to now)
 * @param {boolean} [opts.updateMaintenanceRecord=false] - also flip the linked Maintenance record to completed
 * @param {boolean} [opts.notifyStudent=true]         - send the existing complaint_resolved notification
 * @returns {Promise<{ resolvedAt: Date, resolvedWithinSla: (boolean|null), alreadyResolved: boolean }>}
 */
async function markComplaintResolved(complaint, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const alreadyResolved = !!complaint.resolvedAt;

  complaint.status = 'resolved';
  if (!alreadyResolved) complaint.resolvedAt = now;
  const resolvedAt = complaint.resolvedAt;

  // resolvedWithinSla is set ONLY when a real SLA deadline exists. Legacy
  // complaints (slaDeadline === null) keep resolvedWithinSla === null — the
  // outcome is genuinely unknown and must not be fabricated.
  if (complaint.slaDeadline instanceof Date) {
    complaint.resolvedWithinSla = resolvedAt <= complaint.slaDeadline;
  }

  await complaint.save();

  // Escalation lifecycle is unchanged — just stop open escalation records from
  // looking active once the complaint itself is done.
  try {
    const closed = await closeEscalationsForResolvedComplaint(complaint._id, resolvedAt);
    if (closed > 0) {
      console.log(`[ESCALATION] Complaint ${complaint._id} resolved — closed ${closed} open escalation record(s)`);
    }
  } catch (err) {
    console.error('[ESCALATION] Failed to close escalations for resolved complaint', String(complaint._id), '-', err.message);
  }

  if (opts.updateMaintenanceRecord) {
    await Maintenance.findOneAndUpdate(
      { complaintId: complaint._id },
      { status: 'completed', completedAt: now }
    );
  }

  if (opts.notifyStudent !== false && !alreadyResolved) {
    await Notification.create({
      userId: complaint.studentId,
      title: 'Complaint Resolved',
      message: `Your ${complaint.category} complaint "${complaint.title}" has been resolved.`,
      type: 'complaint_resolved',
      relatedId: complaint._id,
    });
  }

  return {
    resolvedAt,
    resolvedWithinSla: complaint.slaDeadline instanceof Date ? complaint.resolvedWithinSla : null,
    alreadyResolved,
  };
}

module.exports = { markComplaintResolved, RESOLVED_STATUSES };
