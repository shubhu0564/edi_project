const express = require('express');
const router = express.Router();
const { getMyTasks, updateTask } = require('../controllers/maintenanceController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/tasks', authorize('maintenance', 'admin'), getMyTasks);
router.put('/tasks/:id', authorize('maintenance', 'admin'), updateTask);

module.exports = router;
