const Notification = require('../models/Notification');

const getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 }).limit(20);
    const unreadCount = await Notification.countDocuments({ userId: req.user._id, isRead: false });
    res.json({ success: true, data: notifications, unreadCount });
  } catch (error) { next(error); }
};

const markAsRead = async (req, res, next) => {
  try {
    if (req.params.id === 'all') {
      await Notification.updateMany({ userId: req.user._id, isRead: false }, { isRead: true });
    } else {
      await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
    }
    res.json({ success: true, message: 'Marked as read.' });
  } catch (error) { next(error); }
};

module.exports = { getNotifications, markAsRead };
