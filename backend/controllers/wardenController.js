/**
 * ResolveX — Warden controller (STEP 7)
 *
 * Serves the Warden dashboard. Every handler runs behind protect + authorize('warden')
 * (see routes/wardenRoutes.js). A warden only ever sees / acts on complaints where
 * `currentAuthority` === the authenticated warden — ownership is derived from
 * req.user, never from the request body or query.
 *
 * Escalation lifecycle actions delegate to the existing escalationService
 * (acknowledgeEscalation / resolveEscalation) — no lifecycle logic is duplicated here.
 */

const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
const Escalation = require('../models/Escalation');
const { acknowledgeEscalation, resolveEscalation } = require('../services/escalationService');

const TERMINAL_STATUSES = ['resolved', 'closed'];
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

// Derive a single lifecycle label from a complaint's escalation records.
function escalationStatusOf(escalations) {
  if (!escalations || escalations.length === 0) return 'none';
  const latest = escalations[escalations.length - 1];
  if (latest.resolvedAt) return 'resolved';
  if (latest.acknowledgedAt) return 'acknowledged';
  return 'pending';
}

function slaStateOf(complaint, now) {
  if (TERMINAL_STATUSES.includes(complaint.status)) return 'resolved';
  if (complaint.slaDeadline && new Date(complaint.slaDeadline).getTime() < now) return 'breached';
  return 'within';
}

// Load a warden's escalated complaints + their escalation records, decorated.
async function loadWardenComplaints(wardenId, extraQuery = {}) {
  const query = { currentAuthority: wardenId, isEscalated: true, ...extraQuery };
  const complaints = await Complaint.find(query)
    .populate('assignedTo', 'name email role')
    .populate('currentAuthority', 'name email role')
    .populate('studentId', 'name email')
    .sort({ escalatedAt: -1 })
    .lean();

  const ids = complaints.map((c) => c._id);
  const escalations = ids.length
    ? await Escalation.find({ complaintId: { $in: ids } }).sort({ escalatedAt: 1 }).lean()
    : [];

  const byComplaint = {};
  escalations.forEach((e) => {
    const k = String(e.complaintId);
    (byComplaint[k] = byComplaint[k] || []).push(e);
  });

  const now = Date.now();
  return complaints.map((c) => {
    const list = byComplaint[String(c._id)] || [];
    return {
      ...c,
      escalations: list,
      escalationStatus: escalationStatusOf(list),
      slaState: slaStateOf(c, now),
      isUnresolved: !TERMINAL_STATUSES.includes(c.status),
    };
  });
}

// @desc    List complaints escalated to the logged-in warden (+ KPIs)
// @route   GET /api/warden/escalations
// @access  Private (warden)
const getEscalations = async (req, res, next) => {
  try {
    const wardenId = req.user._id;
    const { priority, status, sla } = req.query;

    const extra = {};
    if (priority) extra.priority = priority;
    if (status) extra.status = status;

    let items = await loadWardenComplaints(wardenId, extra);
    if (sla === 'breached' || sla === 'within' || sla === 'resolved') {
      items = items.filter((i) => i.slaState === sla);
    }

    // --- KPIs: always computed over the warden's FULL escalated workload,
    //     independent of the active filters, straight from MongoDB. ---
    const all = await Complaint.find({ currentAuthority: wardenId, isEscalated: true })
      .select('priority status slaDeadline escalatedAt')
      .lean();
    const allEsc = all.length
      ? await Escalation.find({ complaintId: { $in: all.map((c) => c._id) } })
          .select('acknowledgedAt resolvedAt')
          .lean()
      : [];

    const now = Date.now();
    const openComplaints = all.filter((c) => !TERMINAL_STATUSES.includes(c.status));
    const sinceEscalation = openComplaints
      .filter((c) => c.escalatedAt)
      .map((c) => (now - new Date(c.escalatedAt).getTime()) / 3600000);

    const kpis = {
      escalatedComplaints: all.length,
      pendingEscalations: allEsc.filter((e) => !e.acknowledgedAt && !e.resolvedAt).length,
      acknowledged: allEsc.filter((e) => e.acknowledgedAt && !e.resolvedAt).length,
      resolvedEscalations: allEsc.filter((e) => e.resolvedAt).length,
      slaBreaches: openComplaints.filter(
        (c) => c.slaDeadline && new Date(c.slaDeadline).getTime() < now
      ).length,
      urgentComplaints: openComplaints.filter((c) => c.priority === 'urgent').length,
      highPriority: openComplaints.filter((c) => c.priority === 'high').length,
      unresolved: openComplaints.length,
      avgHoursSinceEscalation: sinceEscalation.length
        ? round1(sinceEscalation.reduce((a, b) => a + b, 0) / sinceEscalation.length)
        : 0,
    };

    res.json({ success: true, data: items, kpis });
  } catch (error) {
    next(error);
  }
};

// @desc    Escalated-complaint detail + full escalation history (warden's own)
// @route   GET /api/warden/escalations/:complaintId
// @access  Private (warden)
const getEscalationDetail = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.complaintId)) {
      return res.status(400).json({ success: false, message: 'Invalid complaint id.' });
    }

    const complaint = await Complaint.findOne({
      _id: req.params.complaintId,
      currentAuthority: req.user._id,
      isEscalated: true,
    })
      .populate('assignedTo', 'name email role')
      .populate('currentAuthority', 'name email role')
      .populate('studentId', 'name email')
      .lean();

    if (!complaint) {
      return res
        .status(404)
        .json({ success: false, message: 'Escalated complaint not found or not assigned to you.' });
    }

    const escalations = await Escalation.find({ complaintId: complaint._id })
      .sort({ escalatedAt: 1 })
      .lean();

    res.json({
      success: true,
      data: {
        ...complaint,
        escalations,
        escalationStatus: escalationStatusOf(escalations),
        slaState: slaStateOf(complaint, Date.now()),
        isUnresolved: !TERMINAL_STATUSES.includes(complaint.status),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Shared ownership guard: the escalation must belong to a complaint whose
// currentAuthority is the logged-in warden.
async function loadOwnedEscalation(req, res) {
  if (!mongoose.isValidObjectId(req.params.escalationId)) {
    res.status(400).json({ success: false, message: 'Invalid escalation id.' });
    return null;
  }
  const escalation = await Escalation.findById(req.params.escalationId);
  if (!escalation) {
    res.status(404).json({ success: false, message: 'Escalation not found.' });
    return null;
  }
  const complaint = await Complaint.findById(escalation.complaintId).select('currentAuthority');
  if (!complaint || String(complaint.currentAuthority) !== String(req.user._id)) {
    res.status(403).json({ success: false, message: 'Not authorized for this escalation.' });
    return null;
  }
  return escalation;
}

// @desc    Acknowledge an escalation assigned to the logged-in warden
// @route   PATCH /api/warden/escalations/:escalationId/acknowledge
// @access  Private (warden)
const acknowledge = async (req, res, next) => {
  try {
    const escalation = await loadOwnedEscalation(req, res);
    if (!escalation) return;

    const result = await acknowledgeEscalation(escalation._id); // backend sets the timestamp
    const updated = await Escalation.findById(escalation._id).lean();

    res.json({
      success: true,
      message:
        result.status === 'already_acknowledged'
          ? 'Escalation was already acknowledged.'
          : 'Escalation acknowledged.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Resolve an escalation assigned to the logged-in warden
// @route   PATCH /api/warden/escalations/:escalationId/resolve
// @access  Private (warden)
const resolve = async (req, res, next) => {
  try {
    const escalation = await loadOwnedEscalation(req, res);
    if (!escalation) return;

    let result;
    try {
      result = await resolveEscalation(escalation._id); // enforces "acknowledge first"
    } catch (err) {
      return res
        .status(400)
        .json({ success: false, message: err.message.replace(/^resolveEscalation:\s*/, '') });
    }

    const updated = await Escalation.findById(escalation._id).lean();
    res.json({
      success: true,
      message:
        result.status === 'already_resolved'
          ? 'Escalation was already resolved.'
          : 'Escalation resolved.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getEscalations, getEscalationDetail, acknowledge, resolve };
