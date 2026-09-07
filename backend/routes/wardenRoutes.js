const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getEscalations,
  getEscalationDetail,
  acknowledge,
  resolve,
} = require('../controllers/wardenController');

// Every warden route requires an authenticated user whose role is exactly 'warden'.
router.use(protect, authorize('warden'));

router.get('/escalations', getEscalations);
router.get('/escalations/:complaintId', getEscalationDetail);
router.patch('/escalations/:escalationId/acknowledge', acknowledge);
router.patch('/escalations/:escalationId/resolve', resolve);

module.exports = router;
