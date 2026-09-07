const express = require('express');
const router = express.Router();
const { getRooms, getRoom, createRoom, updateRoom, deleteRoom } = require('../controllers/roomController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', getRooms);
router.get('/:id', getRoom);
router.post('/', authorize('admin'), createRoom);
router.put('/:id', authorize('admin'), updateRoom);
router.delete('/:id', authorize('admin'), deleteRoom);

module.exports = router;
