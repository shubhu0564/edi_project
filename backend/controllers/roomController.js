const Room = require('../models/Room');

const getRooms = async (req, res, next) => {
  try {
    const { status, type, floor, search } = req.query;
    let query = {};
    if (status) query.status = status;
    if (type) query.type = type;
    if (floor) query.floor = parseInt(floor);
    if (search) query.roomNumber = { $regex: search, $options: 'i' };

    const rooms = await Room.find(query).sort({ floor: 1, roomNumber: 1 });
    res.json({ success: true, data: rooms, total: rooms.length });
  } catch (error) { next(error); }
};

const getRoom = async (req, res, next) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found.' });
    res.json({ success: true, data: room });
  } catch (error) { next(error); }
};

const createRoom = async (req, res, next) => {
  try {
    const room = await Room.create(req.body);
    res.status(201).json({ success: true, message: 'Room created successfully.', data: room });
  } catch (error) { next(error); }
};

const updateRoom = async (req, res, next) => {
  try {
    const room = await Room.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found.' });
    res.json({ success: true, message: 'Room updated.', data: room });
  } catch (error) { next(error); }
};

const deleteRoom = async (req, res, next) => {
  try {
    const room = await Room.findByIdAndDelete(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found.' });
    res.json({ success: true, message: 'Room deleted.' });
  } catch (error) { next(error); }
};

module.exports = { getRooms, getRoom, createRoom, updateRoom, deleteRoom };
