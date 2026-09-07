/**
 * ResolveX — Escalation scheduler + notification verification (STEP 6)
 *
 * Exercises escalationScheduler + notificationService against the REAL
 * MongoDB, using temporary test data only. Every temp complaint is marked
 * (roomNumber === MARK); the scheduler is always invoked scoped to that MARK
 * and with an injected authority resolver, so real production complaints and
 * real warden/admin accounts are never touched.
 *
 * Run:  node scripts/verifySchedulerNotifications.js
 * Exit: 0 = all passed, 1 = a failure / uncaught error
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Complaint = require('../models/Complaint');
const Escalation = require('../models/Escalation');
const Notification = require('../models/Notification');
const User = require('../models/User');

const escalationScheduler = require('../services/escalationScheduler');
const { escalateComplaint } = require('../services/escalationService');

const TS = Date.now();
const MARK = `SCHED-TEST-${TS}`;
const EMAIL_TAG = `schedtest${TS}`;
const H = (n) => n * 60 * 60 * 1000;

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass += 1; console.log(`PASS  ${label}${extra ? '  — ' + extra : ''}`); }
  else { fail += 1; console.log(`FAIL  ${label}${extra ? '  — ' + extra : ''}`); }
}

async function makeComplaint({ tag, priority, status = 'open', slaOffsetH = null }) {
  const c = new Complaint({
    studentId: new mongoose.Types.ObjectId(),
    roomNumber: MARK,
    category: 'electricity',
    title: `${MARK} ${tag}`,
    description: 'scheduler + notification verification temp document',
    priority,
    status,
  });
  c.slaDeadline = slaOffsetH === null ? null : new Date(Date.now() + H(slaOffsetH));
  await c.save();
  return c;
}
const escFor = (id) => Escalation.find({ complaintId: id });
const notifFor = (id) => Notification.find({ relatedId: id, type: 'complaint_escalated' });

(async () => {
  if (!process.env.MONGO_URI) { console.error('MONGO_URI not set'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected (db: ${mongoose.connection.name})  MARK=${MARK}\n`);

  const createdUserIds = [];
  try {
    const warden = await User.create({ name: 'Sched Test Warden', email: `${EMAIL_TAG}.warden@example.com`, password: 'test1234', role: 'warden', isActive: true });
    const admin = await User.create({ name: 'Sched Test Admin', email: `${EMAIL_TAG}.admin@example.com`, password: 'test1234', role: 'admin', isActive: true });
    createdUserIds.push(warden._id, admin._id);

    const resolver = async (role) => (role === 'admin' ? admin : warden);
    const nullResolver = async () => null;
    const scoped = (extra = {}) => ({ filter: { roomNumber: MARK }, resolveAuthority: resolver, ...extra });

    // ---------------------------------------------------------------
    // TEST 1 — automatic escalation via the scheduler tick (HIGH)
    // ---------------------------------------------------------------
    const c1 = await makeComplaint({ tag: 'T1-high', priority: 'high', slaOffsetH: -1 });
    const t1 = await escalationScheduler.runTick(scoped());
    check('T1 tick ran', t1.ran === true && !!t1.summary);
    check('T1 summary.escalated === 1', t1.summary.escalated === 1, JSON.stringify(t1.summary));
    const c1b = await Complaint.findById(c1._id);
    check('T1 level 0 -> 1', c1b.escalationLevel === 1);
    check('T1 isEscalated true', c1b.isEscalated === true);
    check('T1 currentAuthorityRole === warden', c1b.currentAuthorityRole === 'warden');
    check('T1 currentAuthority === temp warden', String(c1b.currentAuthority) === String(warden._id));
    check('T1 assignedTo NOT reassigned (still null)', c1b.assignedTo == null);
    check('T1 exactly ONE Escalation record', (await escFor(c1._id)).length === 1);
    const n1 = await notifFor(c1._id);
    check('T1 exactly ONE complaint_escalated notification', n1.length === 1, `got ${n1.length}`);
    check('T1 notification recipient === selected Warden', n1[0] && String(n1[0].userId) === String(warden._id));
    check('T1 notification type === complaint_escalated', n1[0] && n1[0].type === 'complaint_escalated');
    check('T1 notification title === "Complaint Escalated"', n1[0] && n1[0].title === 'Complaint Escalated');
    check('T1 notification references the complaint (relatedId)', n1[0] && String(n1[0].relatedId) === String(c1._id));
    check('T1 notification message mentions HIGH + escalated', n1[0] && /HIGH/.test(n1[0].message) && /escalat/i.test(n1[0].message), n1[0] && n1[0].message);
    check('T1 notification isRead === false', n1[0] && n1[0].isRead === false);

    // ---------------------------------------------------------------
    // TEST 2 — URGENT escalates to admin, admin gets the notification
    // ---------------------------------------------------------------
    const c2 = await makeComplaint({ tag: 'T2-urgent', priority: 'urgent', slaOffsetH: -1 });
    await escalationScheduler.runTick(scoped());
    const c2b = await Complaint.findById(c2._id);
    check('T2 currentAuthorityRole === admin', c2b.currentAuthorityRole === 'admin');
    check('T2 one Escalation record', (await escFor(c2._id)).length === 1);
    const n2 = await notifFor(c2._id);
    check('T2 one complaint_escalated notification', n2.length === 1);
    check('T2 recipient === selected Admin', n2[0] && String(n2[0].userId) === String(admin._id));

    // ---------------------------------------------------------------
    // TEST 3 — future SLA: no escalation, no notification
    // ---------------------------------------------------------------
    const c3 = await makeComplaint({ tag: 'T3-future', priority: 'high', slaOffsetH: +5 });
    await escalationScheduler.runTick(scoped());
    const c3b = await Complaint.findById(c3._id);
    check('T3 not escalated', c3b.isEscalated === false && c3b.escalationLevel === 0);
    check('T3 no Escalation record', (await escFor(c3._id)).length === 0);
    check('T3 no notification', (await notifFor(c3._id)).length === 0);

    // ---------------------------------------------------------------
    // TEST 4 — already escalated: no duplicate escalation / notification
    // ---------------------------------------------------------------
    const c4 = await makeComplaint({ tag: 'T4-already', priority: 'high', slaOffsetH: -2 });
    await escalateComplaint(c4._id, { resolveAuthority: resolver }); // escalate directly first
    check('T4 setup: 1 escalation, 1 notification', (await escFor(c4._id)).length === 1 && (await notifFor(c4._id)).length === 1);
    await escalationScheduler.runTick(scoped());
    await escalationScheduler.runTick(scoped());
    check('T4 still exactly ONE Escalation record', (await escFor(c4._id)).length === 1);
    check('T4 still exactly ONE notification', (await notifFor(c4._id)).length === 1);
    const c4b = await Complaint.findById(c4._id);
    check('T4 escalationCount === 1', c4b.escalationCount === 1);

    // ---------------------------------------------------------------
    // TEST 5 — resolved complaint with expired SLA: nothing happens
    // ---------------------------------------------------------------
    const c5 = await makeComplaint({ tag: 'T5-resolved', priority: 'high', status: 'resolved', slaOffsetH: -5 });
    await escalationScheduler.runTick(scoped());
    check('T5 no Escalation record', (await escFor(c5._id)).length === 0);
    check('T5 no notification', (await notifFor(c5._id)).length === 0);

    // ---------------------------------------------------------------
    // TEST 6 — no target authority: no crash, unchanged, failure in summary
    // ---------------------------------------------------------------
    const c6 = await makeComplaint({ tag: 'T6-noauth', priority: 'high', slaOffsetH: -1 });
    const t6 = await escalationScheduler.runTick({ filter: { roomNumber: MARK, _id: c6._id }, resolveAuthority: nullResolver });
    check('T6 tick did not crash', t6.ran === true && !!t6.summary);
    check('T6 summary.failed >= 1', t6.summary.failed >= 1, JSON.stringify(t6.summary));
    check('T6 summary.escalated === 0', t6.summary.escalated === 0);
    const c6b = await Complaint.findById(c6._id);
    check('T6 complaint unchanged', c6b.isEscalated === false && c6b.escalationLevel === 0 && c6b.currentAuthority == null);
    check('T6 no Escalation record', (await escFor(c6._id)).length === 0);
    check('T6 no notification', (await notifFor(c6._id)).length === 0);

    // ---------------------------------------------------------------
    // TEST 7 — repeated scheduler runs are idempotent (fresh complaint)
    // ---------------------------------------------------------------
    const c7 = await makeComplaint({ tag: 'T7-repeat', priority: 'medium', slaOffsetH: -2 });
    await escalationScheduler.runTick(scoped());
    await escalationScheduler.runTick(scoped());
    await escalationScheduler.runTick(scoped());
    check('T7 exactly ONE Escalation record after 3 runs', (await escFor(c7._id)).length === 1);
    check('T7 exactly ONE notification after 3 runs', (await notifFor(c7._id)).length === 1);
    check('T7 escalationCount === 1', (await Complaint.findById(c7._id)).escalationCount === 1);

    // ---------------------------------------------------------------
    // TEST 8 — overlap protection: a second tick during an active run is skipped
    // ---------------------------------------------------------------
    const c8 = await makeComplaint({ tag: 'T8-overlap', priority: 'high', slaOffsetH: -1 });
    const p1 = escalationScheduler.runTick(scoped());          // starts, sets isRunning
    const duringLock = escalationScheduler.isProcessing();
    const r2 = await escalationScheduler.runTick(scoped());    // should be skipped
    const r1 = await p1;
    check('T8 isProcessing() true while first run active', duringLock === true);
    check('T8 second concurrent tick was skipped', r2.ran === false && r2.skipped === true, JSON.stringify(r2));
    check('T8 first tick ran normally', r1.ran === true);
    check('T8 isProcessing() false after runs settle', escalationScheduler.isProcessing() === false);
    check('T8 only ONE Escalation record for c8', (await escFor(c8._id)).length === 1);
    check('T8 only ONE notification for c8', (await notifFor(c8._id)).length === 1);

    // ---------------------------------------------------------------
    // Scheduler lifecycle: default interval, start/stop idempotency
    // ---------------------------------------------------------------
    check('DEFAULT_INTERVAL_MS === 60000', escalationScheduler.DEFAULT_INTERVAL_MS === 60000);
    check('not started yet', escalationScheduler.isStarted() === false);
    escalationScheduler.start({ intervalMs: 999999 });
    check('start() -> isStarted() true', escalationScheduler.isStarted() === true);
    escalationScheduler.start(); // duplicate — no-op
    check('duplicate start() still single timer (no throw)', escalationScheduler.isStarted() === true);
    escalationScheduler.stop();
    check('stop() -> isStarted() false', escalationScheduler.isStarted() === false);
    escalationScheduler.stop(); // safe to call again
    check('stop() is safe to call twice', escalationScheduler.isStarted() === false);

    // env-driven interval
    const prev = process.env.ESCALATION_INTERVAL_MS;
    process.env.ESCALATION_INTERVAL_MS = '5000';
    escalationScheduler.start({ runImmediately: false });
    check('env ESCALATION_INTERVAL_MS honoured', escalationScheduler.getStats().intervalMs === 5000, JSON.stringify(escalationScheduler.getStats()));
    escalationScheduler.stop();
    if (prev === undefined) delete process.env.ESCALATION_INTERVAL_MS; else process.env.ESCALATION_INTERVAL_MS = prev;

  } finally {
    escalationScheduler.stop();
    const ids = (await Complaint.find({ roomNumber: MARK }).select('_id')).map(d => d._id);
    const nDel = await Notification.deleteMany({ relatedId: { $in: ids } });
    const eDel = await Escalation.deleteMany({ complaintId: { $in: ids } });
    const cDel = await Complaint.deleteMany({ roomNumber: MARK });
    const uDel = await User.deleteMany({ email: new RegExp(`^${EMAIL_TAG}\\.`) });

    const residual =
      (await Complaint.countDocuments({ roomNumber: MARK })) +
      (await Escalation.countDocuments({ complaintId: { $in: ids } })) +
      (await Notification.countDocuments({ relatedId: { $in: ids } })) +
      (await User.countDocuments({ email: new RegExp(`^${EMAIL_TAG}\\.`) }));

    console.log(`\ncleanup: complaints -${cDel.deletedCount}, escalations -${eDel.deletedCount}, notifications -${nDel.deletedCount}, users -${uDel.deletedCount}`);
    check('residual test data === 0', residual === 0, `got ${residual}`);
    await mongoose.disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (err) => {
  console.error('FATAL', err);
  try { escalationScheduler.stop(); } catch (_) {}
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
