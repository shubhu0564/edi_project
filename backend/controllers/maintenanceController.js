const Maintenance = require('../models/Maintenance');
const Complaint = require('../models/Complaint');
const { markComplaintResolved } = require('../services/complaintResolutionService');
const { canTransition } = require('../config/complaintLifecycle');

const TERMINAL_STATUSES = ['resolved', 'closed'];

const getMyTasks = async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = { staffId: req.user._id };
    if (status) query.status = status;

    const tasks = await Maintenance.find(query)
      .populate({ path: 'complaintId', populate: { path: 'studentId', select: 'name email' } })
      .populate('staffId', 'name email')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: tasks });
  } catch (error) { next(error); }
};

const updateTask = async (req, res, next) => {
  try {
    // resolvedAt / resolvedWithinSla are deliberately NOT read from the body —
    // the server owns those (see complaintResolutionService).
    const { status, note, estimatedCompletion } = req.body;

    const task = await Maintenance.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found.' });

    if (task.staffId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    if (status) task.status = status;
    if (estimatedCompletion) task.estimatedCompletion = estimatedCompletion;
    if (status === 'completed') task.completedAt = new Date();
    if (note) task.notes.push({ text: note, addedBy: req.user._id });

    await task.save();

    // Keep the linked complaint's status in step with the task.
    const complaint = await Complaint.findById(task.complaintId);
    if (complaint) {
      let complaintDirty = false;

      // First meaningful maintenance response — set ONCE, server-side, and only
      // if not already recorded. Never taken from req.body, never overwritten.
      const isResponse = note || status === 'in_progress' || status === 'completed';
      if (isResponse && !complaint.firstResponseAt) {
        complaint.firstResponseAt = new Date();
        complaintDirty = true;
      }

      if (task.status === 'completed') {
        // Task finished -> resolve the complaint through the ONE resolution
        // path: server sets resolvedAt, computes resolvedWithinSla (only when a
        // real slaDeadline exists), closes open escalations, notifies student.
        if (!TERMINAL_STATUSES.includes(complaint.status)) {
          // markComplaintResolved persists the doc (incl. firstResponseAt above).
          await markComplaintResolved(complaint, { updateMaintenanceRecord: false });
          complaintDirty = false;
        }
      } else if (note && complaint.status === 'open' && canTransition('open', 'in_progress')) {
        // Adding a progress note moves an OPEN complaint into progress
        // (preserves previous behaviour); never touches resolved/closed/rejected.
        complaint.status = 'in_progress';
        complaintDirty = true;
      }

      if (complaintDirty) await complaint.save();
    }

    const updated = await Maintenance.findById(task._id)
      .populate({ path: 'complaintId', populate: { path: 'studentId', select: 'name email' } })
      .populate('staffId', 'name email');

    res.json({ success: true, message: 'Task updated.', data: updated });
  } catch (error) { next(error); }
};

module.exports = { getMyTasks, updateTask };
