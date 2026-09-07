const mongoose = require('mongoose');

const maintenanceSchema = new mongoose.Schema({
  complaintId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Complaint',
    required: true
  },
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['assigned', 'in_progress', 'completed', 'cancelled'],
    default: 'assigned'
  },
  notes: [{
    text: { type: String, required: true },
    addedAt: { type: Date, default: Date.now },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  estimatedCompletion: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  materials: [{
    name: String,
    cost: Number
  }],
  laborCost: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

module.exports = mongoose.model('Maintenance', maintenanceSchema);
