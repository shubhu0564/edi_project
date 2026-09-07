const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { createComplaint, getComplaints, getComplaint, updateComplaint, deleteComplaint, getStats } = require('../controllers/complaintController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/stats', authorize('admin'), getStats);
router.get('/', getComplaints);
router.post('/', authorize('student'), [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('category').isIn(['electricity', 'plumbing', 'internet', 'room', 'furniture', 'housekeeping', 'security', 'other']).withMessage('Invalid category')
], createComplaint);

router.get('/:id', getComplaint);
router.put('/:id', authorize('admin', 'maintenance'), updateComplaint);
router.delete('/:id', authorize('admin', 'student'), deleteComplaint);

module.exports = router;
