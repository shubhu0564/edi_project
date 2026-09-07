const { validationResult } = require('express-validator');
const Complaint = require('../models/Complaint');
const Maintenance = require('../models/Maintenance');
const Notification = require('../models/Notification');
const Student = require('../models/Student');
const { getSLAConfig, calculateDeadline, DEFAULT_PRIORITY } = require('../services/slaService');
const { markComplaintResolved } = require('../services/complaintResolutionService');
const { canTransition } = require('../config/complaintLifecycle');

// @desc    Submit complaint
// @route   POST /api/complaints
// @access  Private (Student)
const createComplaint = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { title, description, category, priority, roomNumber } = req.body;

    // Get student room if not provided
    let room = roomNumber;
    if (!room && req.user.role === 'student') {
      const student = await Student.findOne({ userId: req.user._id });
      if (student) room = student.roomNumber;
    }

    // Final priority: student-supplied value or the schema default.
    const finalPriority = priority || DEFAULT_PRIORITY;

    const complaint = await Complaint.create({
      studentId: req.user._id,
      roomNumber: room,
      title,
      description,
      category,
      priority: finalPriority
    });

    // --- SLA deadline (ResolveX STEP 3) ---
    // The backend is authoritative for the SLA clock: we use the server-side
    // creation timestamp (complaint.createdAt), never a frontend-supplied time.
    // The duration comes from the centralized SLA matrix via slaService.
    try {
      // getSLAConfig also validates the priority; throws on an unsupported value.
      getSLAConfig(complaint.priority);
      complaint.slaDeadline = calculateDeadline(complaint.priority, complaint.createdAt);
      await complaint.save();
    } catch (slaError) {
      // Don't lose a valid complaint over an SLA calc problem; surface it in logs.
      console.error('SLA deadline calculation failed for complaint', complaint._id.toString(), '-', slaError.message);
    }

    // Notify all admins
    const User = require('../models/User');
    const admins = await User.find({ role: 'admin' });
    await Promise.all(admins.map(admin =>
      Notification.create({
        userId: admin._id,
        title: 'New Complaint Submitted',
        message: `${req.user.name} submitted a ${category} complaint: "${title}"`,
        type: 'complaint_submitted',
        relatedId: complaint._id
      })
    ));

    res.status(201).json({ success: true, message: 'Complaint submitted successfully.', data: complaint });
  } catch (error) {
    next(error);
  }
};

// @desc    Get complaints
// @route   GET /api/complaints
// @access  Private
const getComplaints = async (req, res, next) => {
  try {
    const { status, category, priority, search, page = 1, limit = 10, sortBy = 'createdAt', order = 'desc' } = req.query;

    let query = {};

    // Role-based filtering
    if (req.user.role === 'student') {
      query.studentId = req.user._id;
    } else if (req.user.role === 'maintenance') {
      query.assignedTo = req.user._id;
    }

    // Filters
    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { roomNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Complaint.countDocuments(query);
    const complaints = await Complaint.find(query)
      .populate('studentId', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ [sortBy]: order === 'desc' ? -1 : 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: complaints,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single complaint
// @route   GET /api/complaints/:id
// @access  Private
const getComplaint = async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id)
      .populate('studentId', 'name email')
      .populate('assignedTo', 'name email');

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    // Authorization check
    if (req.user.role === 'student' && complaint.studentId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    // Get maintenance record if exists
    const maintenance = await Maintenance.findOne({ complaintId: complaint._id })
      .populate('staffId', 'name email')
      .populate('notes.addedBy', 'name');

    res.json({ success: true, data: { ...complaint.toObject(), maintenance } });
  } catch (error) {
    next(error);
  }
};

// @desc    Update complaint status / assign
// @route   PUT /api/complaints/:id
// @access  Private (Admin/Maintenance)
const updateComplaint = async (req, res, next) => {
  try {
    const { status, assignedTo, adminNotes, priority } = req.body;

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    // Lifecycle guard — a resolved/closed complaint can never move backward to
    // in_progress/open through this API (enforced server-side).
    if (status && !canTransition(complaint.status, status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from '${complaint.status}' to '${status}'.`,
      });
    }

    // Maintenance staff can only update status
    if (req.user.role === 'maintenance') {
      if (complaint.assignedTo?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized.' });
      }
      if (status && status !== 'resolved') complaint.status = status;
    } else if (req.user.role === 'admin') {
      if (status && status !== 'resolved') complaint.status = status;
      if (assignedTo !== undefined) complaint.assignedTo = assignedTo || null;
      if (adminNotes) complaint.adminNotes = adminNotes;
      if (priority) complaint.priority = priority;

      // Create/update maintenance record if assigning
      if (assignedTo) {
        const existing = await Maintenance.findOne({ complaintId: complaint._id });
        if (!existing) {
          await Maintenance.create({
            complaintId: complaint._id,
            staffId: assignedTo,
            assignedBy: req.user._id
          });
        } else {
          existing.staffId = assignedTo;
          existing.status = 'assigned';
          await existing.save();
        }

        // Notify maintenance staff
        await Notification.create({
          userId: assignedTo,
          title: 'New Complaint Assigned',
          message: `You have been assigned a ${complaint.category} complaint: "${complaint.title}"`,
          type: 'complaint_assigned',
          relatedId: complaint._id
        });

        // Assigning shouldn't drag a resolved/closed complaint backwards.
        if (canTransition(complaint.status, 'in_progress')) complaint.status = 'in_progress';
      }
    }

    if (status === 'resolved') {
      // Single resolution path — the server sets resolvedAt + resolvedWithinSla,
      // closes open escalations and notifies the student. markComplaintResolved
      // persists the document, so no extra save() is needed on this branch.
      await markComplaintResolved(complaint, { updateMaintenanceRecord: true });
    } else {
      await complaint.save();
    }

    const updated = await Complaint.findById(complaint._id)
      .populate('studentId', 'name email')
      .populate('assignedTo', 'name email');

    res.json({ success: true, message: 'Complaint updated successfully.', data: updated });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete complaint
// @route   DELETE /api/complaints/:id
// @access  Private (Admin or own student)
const deleteComplaint = async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    if (req.user.role === 'student' && complaint.studentId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    await Maintenance.deleteOne({ complaintId: complaint._id });
    await Complaint.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Complaint deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

// Statuses that represent a complaint that has reached the end of its lifecycle.
const RESOLVED_STATUSES = ['resolved', 'closed'];

// Round to at most one decimal place (KPI display convention for ResolveX).
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

// @desc    Get complaint stats + ResolveX KPIs (admin)
// @route   GET /api/complaints/stats
// @access  Private (Admin)
const getStats = async (req, res, next) => {
  try {
    const [statusStats, categoryStats, priorityStats, recentComplaints, kpiFacet] = await Promise.all([
      Complaint.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Complaint.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
      Complaint.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
      Complaint.find().sort({ createdAt: -1 }).limit(5).populate('studentId', 'name'),
      // Single pass over the collection for the KPI metrics. Every stage is
      // null-safe so legacy documents (no slaDeadline / no resolvedAt) can't
      // crash the endpoint or fabricate SLA data.
      Complaint.aggregate([
        {
          $facet: {
            statusCounts: [
              { $group: { _id: '$status', c: { $sum: 1 } } }
            ],
            escalatedComplaints: [
              { $match: { isEscalated: true } },
              { $count: 'c' }
            ],
            activeEscalations: [
              { $match: { isEscalated: true, status: { $nin: RESOLVED_STATUSES } } },
              { $count: 'c' }
            ],
            resolutionTime: [
              {
                $match: {
                  status: { $in: RESOLVED_STATUSES },
                  createdAt: { $type: 'date' },
                  resolvedAt: { $type: 'date' }
                }
              },
              {
                $project: {
                  hours: {
                    $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 1000 * 60 * 60]
                  }
                }
              },
              // Guard against clock skew / bad legacy data producing negatives.
              { $match: { hours: { $gte: 0 } } },
              { $group: { _id: null, avgHours: { $avg: '$hours' }, count: { $sum: 1 } } }
            ],
            slaCompliance: [
              {
                $match: {
                  status: { $in: RESOLVED_STATUSES },
                  slaDeadline: { $type: 'date' }
                }
              },
              {
                $project: {
                  slaDeadline: 1,
                  // Prefer the authoritative resolvedAt; fall back to the
                  // server-maintained updatedAt for closed legacy complaints.
                  effectiveResolvedAt: { $ifNull: ['$resolvedAt', '$updatedAt'] }
                }
              },
              { $match: { effectiveResolvedAt: { $type: 'date' } } },
              {
                $group: {
                  _id: null,
                  eligible: { $sum: 1 },
                  withinSla: {
                    $sum: {
                      $cond: [{ $lte: ['$effectiveResolvedAt', '$slaDeadline'] }, 1, 0]
                    }
                  }
                }
              }
            ]
          }
        }
      ])
    ]);

    const total = await Complaint.countDocuments();

    // --- Unpack the KPI facet safely ---
    const facet = kpiFacet[0] || {};
    const statusCountMap = {};
    (facet.statusCounts || []).forEach((s) => { statusCountMap[s._id] = s.c; });

    const openComplaints = statusCountMap.open || 0;
    const inProgressComplaints = statusCountMap.in_progress || 0;
    const resolvedComplaints = RESOLVED_STATUSES.reduce((sum, st) => sum + (statusCountMap[st] || 0), 0);

    const escalatedComplaints = facet.escalatedComplaints?.[0]?.c || 0;
    const activeEscalations = facet.activeEscalations?.[0]?.c || 0;

    const resolutionTime = facet.resolutionTime?.[0];
    const averageResolutionTimeHours = resolutionTime && resolutionTime.count > 0
      ? round1(resolutionTime.avgHours)
      : 0;

    const sla = facet.slaCompliance?.[0];
    const slaCompliance = sla && sla.eligible > 0
      ? round1((sla.withinSla / sla.eligible) * 100)
      : 0;

    const resolutionRate = total > 0
      ? round1((resolvedComplaints / total) * 100)
      : 0;

    const escalationRate = total > 0
      ? round1((escalatedComplaints / total) * 100)
      : 0;

    const kpis = {
      totalComplaints: total,
      openComplaints,
      inProgressComplaints,
      resolvedComplaints,
      resolutionRate,
      slaCompliance,
      escalationRate,
      averageResolutionTimeHours,
      activeEscalations
    };

    res.json({
      success: true,
      // Existing fields preserved verbatim for current frontend consumers.
      data: { total, statusStats, categoryStats, priorityStats, recentComplaints, kpis }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { createComplaint, getComplaints, getComplaint, updateComplaint, deleteComplaint, getStats };
