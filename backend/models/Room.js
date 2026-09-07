const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomNumber: {
    type: String,
    required: [true, 'Room number is required'],
    unique: true,
    trim: true
  },
  floor: {
    type: Number,
    required: true
  },
  capacity: {
    type: Number,
    required: [true, 'Capacity is required'],
    min: 1,
    max: 6
  },
  occupied: {
    type: Number,
    default: 0,
    min: 0
  },
  type: {
    type: String,
    enum: ['single', 'double', 'triple', 'dormitory'],
    default: 'double'
  },
  status: {
    type: String,
    enum: ['available', 'occupied', 'maintenance', 'reserved'],
    default: 'available'
  },
  amenities: [{
    type: String
  }],
  monthlyRent: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Virtual for availability
roomSchema.virtual('availableSlots').get(function() {
  return this.capacity - this.occupied;
});

module.exports = mongoose.model('Room', roomSchema);
