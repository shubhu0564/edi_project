const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  roomNumber: {
    type: String,
    required: [true, 'Room number is required'],
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['electricity', 'plumbing', 'internet', 'room', 'furniture', 'housekeeping', 'security', 'other']
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'closed', 'rejected'],
    default: 'open'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  adminNotes: {
    type: String,
    trim: true
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  images: [{
    type: String
  }],
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  feedback: {
    type: String,
    trim: true
  },

  // --- SLA / escalation foundation (ResolveX) ---
  // All fields below are optional / defaulted so existing complaint documents
  // remain valid without a migration. No logic is attached at this stage.
  slaDeadline: {
    type: Date,
    default: null
  },
  escalationLevel: {
    type: Number,
    default: 0
  },
  isEscalated: {
    type: Boolean,
    default: false
  },
  escalatedAt: {
    type: Date,
    default: null
  },
  escalationCount: {
    type: Number,
    default: 0
  },
  firstResponseAt: {
    type: Date,
    default: null
  },
  resolvedWithinSla: {
    type: Boolean,
    default: null
  },
  // Authority currently responsible for the complaint after any escalation.
  // Distinct from assignedTo (the maintenance staff member handling the work),
  // which is unchanged and continues to drive assignment.
  currentAuthority: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  currentAuthorityRole: {
    type: String,
    default: null
  }
}, { timestamps: true });

// Index for faster queries
complaintSchema.index({ studentId: 1, status: 1 });
complaintSchema.index({ assignedTo: 1, status: 1 });
complaintSchema.index({ createdAt: -1 });

// --- SLA / escalation query indexes (ResolveX) ---
complaintSchema.index({ slaDeadline: 1 });
complaintSchema.index({ status: 1, slaDeadline: 1 });
complaintSchema.index({ isEscalated: 1 });
complaintSchema.index({ escalationLevel: 1 });

module.exports = mongoose.model('Complaint', complaintSchema);
