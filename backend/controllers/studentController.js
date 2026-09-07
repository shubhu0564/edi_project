const User = require('../models/User');
const Student = require('../models/Student');

const getStudents = async (req, res, next) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    let userQuery = { role: 'student' };
    if (search) {
      userQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    const users = await User.find(userQuery).select('-password')
      .skip((page - 1) * limit).limit(parseInt(limit));
    const total = await User.countDocuments(userQuery);

    const studentsWithProfiles = await Promise.all(users.map(async (user) => {
      const profile = await Student.findOne({ userId: user._id });
      return { ...user.toObject(), profile };
    }));

    res.json({ success: true, data: studentsWithProfiles, total, page: parseInt(page) });
  } catch (error) { next(error); }
};

const getStudent = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user || user.role !== 'student') {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }
    const profile = await Student.findOne({ userId: user._id });
    res.json({ success: true, data: { ...user.toObject(), profile } });
  } catch (error) { next(error); }
};

const updateStudent = async (req, res, next) => {
  try {
    const { name, email, roomNumber, contact, course, year, isActive } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { ...(name && { name }), ...(email && { email }), ...(isActive !== undefined && { isActive }) },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ success: false, message: 'Student not found.' });

    const profile = await Student.findOneAndUpdate(
      { userId: user._id },
      { ...(roomNumber && { roomNumber }), ...(contact && { contact }), ...(course && { course }), ...(year && { year }) },
      { new: true }
    );

    res.json({ success: true, message: 'Student updated.', data: { ...user.toObject(), profile } });
  } catch (error) { next(error); }
};

const getMaintainanceStaff = async (req, res, next) => {
  try {
    const staff = await User.find({ role: 'maintenance', isActive: true }).select('-password');
    res.json({ success: true, data: staff });
  } catch (error) { next(error); }
};

module.exports = { getStudents, getStudent, updateStudent, getMaintainanceStaff };
