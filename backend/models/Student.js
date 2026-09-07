const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  roomNumber: {
    type: String,
    required: [true, 'Room number is required'],
    trim: true
  },
  contact: {
    type: String,
    required: [true, 'Contact number is required'],
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit contact number']
  },
  guardianName: {
    type: String,
    trim: true
  },
  guardianContact: {
    type: String,
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit contact number']
  },
  admissionDate: {
    type: Date,
    default: Date.now
  },
  course: {
    type: String,
    trim: true
  },
  year: {
    type: Number,
    min: 1,
    max: 6
  }
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
