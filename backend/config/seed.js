const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();
const User = require('../models/User');
const Student = require('../models/Student');
const Room = require('../models/Room');
const Complaint = require('../models/Complaint');

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hostel_management');
    console.log('Connected to MongoDB');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Student.deleteMany({}),
      Room.deleteMany({}),
      Complaint.deleteMany({})
    ]);
    console.log('Cleared existing data');

    // Create admin
    const admin = await User.create({
      name: 'Admin Warden',
      email: 'admin@hostel.com',
      password: 'admin123',
      role: 'admin'
    });

    // Create maintenance staff
    const staff1 = await User.create({
      name: 'Ravi Kumar',
      email: 'ravi@hostel.com',
      password: 'staff123',
      role: 'maintenance'
    });
    const staff2 = await User.create({
      name: 'Suresh Babu',
      email: 'suresh@hostel.com',
      password: 'staff123',
      role: 'maintenance'
    });

    // Create warden (demo account for the escalation / Warden dashboard flow)
    await User.create({
      name: 'Priya Nair',
      email: 'warden@hostel.com',
      password: 'warden123',
      role: 'warden'
    });

    // Create students
    const student1 = await User.create({ name: 'Arjun Reddy', email: 'arjun@student.com', password: 'student123', role: 'student' });
    const student2 = await User.create({ name: 'Priya Sharma', email: 'priya@student.com', password: 'student123', role: 'student' });
    const student3 = await User.create({ name: 'Mohammed Ali', email: 'ali@student.com', password: 'student123', role: 'student' });

    await Student.create([
      { userId: student1._id, roomNumber: '101', contact: '9876543210', course: 'B.Tech CSE', year: 2 },
      { userId: student2._id, roomNumber: '102', contact: '9876543211', course: 'B.Tech ECE', year: 3 },
      { userId: student3._id, roomNumber: '201', contact: '9876543212', course: 'MBA', year: 1 }
    ]);

    // Create rooms
    await Room.create([
      { roomNumber: '101', floor: 1, capacity: 2, occupied: 1, type: 'double', status: 'occupied', monthlyRent: 3000 },
      { roomNumber: '102', floor: 1, capacity: 2, occupied: 1, type: 'double', status: 'occupied', monthlyRent: 3000 },
      { roomNumber: '103', floor: 1, capacity: 1, occupied: 0, type: 'single', status: 'available', monthlyRent: 4500 },
      { roomNumber: '104', floor: 1, capacity: 3, occupied: 0, type: 'triple', status: 'available', monthlyRent: 2500 },
      { roomNumber: '201', floor: 2, capacity: 2, occupied: 1, type: 'double', status: 'occupied', monthlyRent: 3000 },
      { roomNumber: '202', floor: 2, capacity: 2, occupied: 0, type: 'double', status: 'maintenance', monthlyRent: 3000 },
      { roomNumber: '203', floor: 2, capacity: 1, occupied: 0, type: 'single', status: 'available', monthlyRent: 4500 },
      { roomNumber: '301', floor: 3, capacity: 4, occupied: 0, type: 'dormitory', status: 'available', monthlyRent: 2000 },
    ]);

    // Create complaints
    await Complaint.create([
      {
        studentId: student1._id, roomNumber: '101', category: 'electricity',
        title: 'Light not working in room', description: 'The ceiling light in room 101 has stopped working. It flickers and then goes off.',
        priority: 'high', status: 'in_progress', assignedTo: staff1._id
      },
      {
        studentId: student2._id, roomNumber: '102', category: 'plumbing',
        title: 'Tap leaking in bathroom', description: 'The bathroom tap is leaking continuously since yesterday.',
        priority: 'medium', status: 'open'
      },
      {
        studentId: student3._id, roomNumber: '201', category: 'internet',
        title: 'WiFi not working', description: 'No internet connectivity since last 2 days. Cannot attend online classes.',
        priority: 'urgent', status: 'resolved', assignedTo: staff2._id, resolvedAt: new Date()
      },
      {
        studentId: student1._id, roomNumber: '101', category: 'furniture',
        title: 'Chair is broken', description: 'The study chair has a broken leg and is unstable.',
        priority: 'low', status: 'open'
      },
    ]);

    console.log('\n✅ Seed data created successfully!\n');
    console.log('=== LOGIN CREDENTIALS ===');
    console.log('Admin:       admin@hostel.com     / admin123');
    console.log('Warden:      warden@hostel.com    / warden123');
    console.log('Maintenance: ravi@hostel.com      / staff123');
    console.log('Maintenance: suresh@hostel.com    / staff123');
    console.log('Student:     arjun@student.com    / student123');
    console.log('Student:     priya@student.com    / student123');
    console.log('Student:     ali@student.com      / student123');
    console.log('=========================\n');

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seedData();
