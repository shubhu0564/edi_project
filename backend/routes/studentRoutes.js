const express = require('express');
const router = express.Router();
const { getStudents, getStudent, updateStudent, getMaintainanceStaff } = require('../controllers/studentController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', authorize('admin'), getStudents);
router.get('/maintenance-staff', authorize('admin'), getMaintainanceStaff);
router.get('/:id', authorize('admin'), getStudent);
router.put('/:id', authorize('admin'), updateStudent);

module.exports = router;
