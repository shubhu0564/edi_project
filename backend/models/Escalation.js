const mongoose = require('mongoose');

// Records every escalation event for a complaint.
// Relationship: one Complaint -> many Escalation records (escalation history).
// This model stores data only; the escalation engine is not implemented yet.
const escalationSchema = new mongoose.Schema({
  complaintId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Complaint',
    required: true
  },
  fromLevel: {
    type: Number,
    required: true
  },
  toLevel: {
    type: Number,
    required: true
  },
  fromRole: {
    type: String,
    required: true
  },
  toRole: {
    type: String,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  escalatedAt: {
    type: Date,
    default: Date.now
  },
  acknowledgedAt: {
    type: Date,
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// Indexes for escalation history and SLA/escalation reporting queries.
escalationSchema.index({ complaintId: 1 });
escalationSchema.index({ escalatedAt: -1 });
escalationSchema.index({ toRole: 1 });

module.exports = mongoose.model('Escalation', escalationSchema);
