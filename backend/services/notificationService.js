/**
 * ResolveX — Notification service (STEP 6)
 *
 * Centralizes Notification document creation so notification logic is not
 * scattered across controllers. Wraps the EXISTING Notification model
 * (models/Notification.js) — no new model, no schema changes, all existing
 * types preserved.
 *
 * The frontend notification UI (components/Layout.jsx) already polls
 * GET /api/notifications generically and renders any Notification regardless
 * of `type`, so notifications created here appear with no frontend change.
 */

const Notification = require('../models/Notification');

// Mirror of the Notification schema enum — used only for a friendly guard.
const NOTIFICATION_TYPES = [
  'complaint_submitted', 'complaint_assigned', 'complaint_updated',
  'complaint_resolved', 'complaint_escalated', 'sla_breach', 'general'
];

function log(...args) {
  console.log('[NOTIFICATION]', ...args);
}

/**
 * Create a notification. Thin, validated wrapper over Notification.create so
 * every caller goes through one place.
 * @param {{ userId:any, title:string, message:string, type?:string, relatedId?:any }} input
 * @returns {Promise<object>} the created Notification document
 */
async function createNotification({ userId, title, message, type = 'general', relatedId = null }) {
  if (!userId) throw new Error('createNotification: userId is required');
  if (!title || !message) throw new Error('createNotification: title and message are required');
  if (!NOTIFICATION_TYPES.includes(type)) {
    throw new Error(`createNotification: unsupported type "${type}"`);
  }
  return Notification.create({ userId, title, message, type, relatedId });
}

const shortId = (id) => String(id).slice(-6).toUpperCase();

/**
 * Create the escalation notification for the authority a complaint was just
 * escalated to. Idempotent: an atomic upsert keyed on
 * (recipient userId + type 'complaint_escalated' + complaint relatedId) means
 * repeated scheduler runs / retries never produce a duplicate notification for
 * the same complaint+recipient.
 *
 * @param {object} params
 * @param {any}    params.complaintId       - the escalated complaint's _id (stored as relatedId)
 * @param {any}    params.recipientUserId   - the authority selected by escalationService (currentAuthority)
 * @param {string} params.priority          - complaint priority (for the message)
 * @param {string} params.toRole            - 'warden' | 'admin' (for the message)
 * @param {string} [params.complaintTitle]  - optional, for a more useful message
 * @returns {Promise<{ created:boolean, notificationId:string|null }>}
 */
async function notifyEscalation({ complaintId, recipientUserId, priority, toRole, complaintTitle }) {
  if (!complaintId) throw new Error('notifyEscalation: complaintId is required');
  if (!recipientUserId) throw new Error('notifyEscalation: recipientUserId is required');

  const priorityLabel = String(priority || '').toUpperCase();
  const titlePart = complaintTitle ? ` "${complaintTitle}"` : '';
  const message =
    `Complaint${titlePart} (#${shortId(complaintId)}) has exceeded its ${priorityLabel} priority SLA ` +
    `and has been escalated to you as ${toRole}.`;

  // Atomic idempotent write. Without relying on a unique index, this still
  // collapses concurrent/repeated attempts: the first insert wins, later ones
  // match the existing document and only (no-op) touch it.
  const res = await Notification.updateOne(
    { userId: recipientUserId, type: 'complaint_escalated', relatedId: complaintId },
    {
      $setOnInsert: {
        userId: recipientUserId,
        type: 'complaint_escalated',
        relatedId: complaintId,
        title: 'Complaint Escalated',
        message,
        isRead: false
      }
    },
    { upsert: true }
  );

  const created = !!(res.upsertedCount || res.upsertedId);
  if (created) {
    log(`complaint_escalated notification created for ${toRole} ${recipientUserId} (complaint ${complaintId})`);
  }
  const notificationId = res.upsertedId
    ? String(res.upsertedId._id || res.upsertedId)
    : null;
  return { created, notificationId };
}

module.exports = {
  NOTIFICATION_TYPES,
  createNotification,
  notifyEscalation
};
