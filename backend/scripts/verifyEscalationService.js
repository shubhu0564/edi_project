/**
 * ResolveX — Escalation engine verification (STEP 5)
 *
 * Exercises the REAL MongoDB-backed escalationService against temporary test
 * data only. Creates clearly-marked temp users + complaints, runs the 8
 * required scenarios (plus acknowledge/resolve), then deletes everything it
 * created and asserts residual test data === 0.
 *
 * Does NOT touch production data:
 *   - every temp complaint has roomNumber === MARK
 *   - processDueEscalations is only ever called with { filter: { roomNumber: MARK } }
 *   - target-authority resolution is injected in tests so real warden/admin
 *     accounts are never selected or modified
 *
 * Run:  node scripts/verifyEscalationService.js
 * Exit: 0 = all passed, 1 = a failure or an uncaught error
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Complaint = require('../models/Complaint');
const Escalation = require('../models/Escalation');
const User = require('../models/User');
const {
  escalateComplaint,
  processDueEscalations,
  shouldEscalate,
  getEscalationTarget,
  findTargetAuthority,
  acknowledgeEscalation,
  resolveEscalation
} = require('../services/escalationService');

const TS = Date.now();
const MARK = `ESC-TEST-${TS}`;
const EMAIL_TAG = `esctest${TS}`;

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass += 1; console.log(`PASS  ${label}${extra ? '  — ' + extra : ''}`); }
  else { fail += 1; console.log(`FAIL  ${label}${extra ? '  — ' + extra : ''}`); }
}
async function expectThrow(label, fn) {
  try { await fn(); check(label, false, 'expected an error'); }
  catch { check(label, true, 'threw as expected'); }
}

const H = (n) => n * 60 * 60 * 1000;

async function makeComplaint({ tag, priority, status = 'open', slaOffsetH = null, assignedTo = null }) {
  const c = new Complaint({
    studentId: new mongoose.Types.ObjectId(),
    roomNumber: MARK,
    category: 'electricity',
    title: `${MARK} ${tag}`,
    description: 'escalation engine verification temp document',
    priority,
    status,
    assignedTo
  });
  c.slaDeadline = slaOffsetH === null ? null : new Date(Date.now() + H(slaOffsetH));
  await c.save();
  return c;
}

async function escalationsFor(complaintId) {
  return Escalation.find({ complaintId }).sort({ createdAt: 1 });
}

(async () => {
  if (!process.env.MONGO_URI) { console.error('MONGO_URI not set'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected (db: ${mongoose.connection.name})  MARK=${MARK}\n`);

  const createdComplaintIds = [];
  const createdUserIds = [];

  try {
    // --- temp authority users (only used via injected resolver, except the
    //     one explicit findTargetAuthority check) ---
    const warden = await User.create({ name: 'ESC Test Warden', email: `${EMAIL_TAG}.warden@example.com`, password: 'test1234', role: 'warden', isActive: true });
    const admin = await User.create({ name: 'ESC Test Admin', email: `${EMAIL_TAG}.admin@example.com`, password: 'test1234', role: 'admin', isActive: true });
    const inactiveWarden = await User.create({ name: 'ESC Test Inactive Warden', email: `${EMAIL_TAG}.inactivewarden@example.com`, password: 'test1234', role: 'warden', isActive: false });
    createdUserIds.push(warden._id, admin._id, inactiveWarden._id);

    const resolver = async (role) => (role === 'admin' ? admin : warden);
    const nullResolver = async () => null;

    // ---------------------------------------------------------------
    // TEST 1 — HIGH, SLA in the past -> escalates to warden, L0->L1
    // ---------------------------------------------------------------
    const c1 = await makeComplaint({ tag: 'T1-high-overdue', priority: 'high', slaOffsetH: -1 });
    createdComplaintIds.push(c1._id);
    const r1 = await escalateComplaint(c1._id, { resolveAuthority: resolver });
    check('T1 result.status === escalated', r1.status === 'escalated', r1.reason);
    check('T1 toRole === warden', r1.toRole === 'warden');
    const c1b = await Complaint.findById(c1._id);
    check('T1 isEscalated === true', c1b.isEscalated === true);
    check('T1 escalationLevel 0 -> 1', c1b.escalationLevel === 1, `got ${c1b.escalationLevel}`);
    check('T1 escalationCount === 1', c1b.escalationCount === 1, `got ${c1b.escalationCount}`);
    check('T1 escalatedAt is a Date', c1b.escalatedAt instanceof Date);
    check('T1 currentAuthorityRole === warden', c1b.currentAuthorityRole === 'warden');
    check('T1 currentAuthority === temp warden id', String(c1b.currentAuthority) === String(warden._id));
    check('T1 assignedTo NOT overwritten (still null)', c1b.assignedTo == null);
    const e1 = await escalationsFor(c1._id);
    check('T1 exactly ONE Escalation document', e1.length === 1, `got ${e1.length}`);
    check('T1 Escalation fromLevel=0 toLevel=1', e1[0] && e1[0].fromLevel === 0 && e1[0].toLevel === 1);
    check('T1 Escalation fromRole=maintenance toRole=warden', e1[0] && e1[0].fromRole === 'maintenance' && e1[0].toRole === 'warden');
    check('T1 Escalation reason mentions HIGH + SLA', e1[0] && /HIGH/.test(e1[0].reason) && /SLA/i.test(e1[0].reason), e1[0] && e1[0].reason);
    check('T1 Escalation escalatedAt is a Date', e1[0] && e1[0].escalatedAt instanceof Date);

    // ---------------------------------------------------------------
    // TEST 2 — URGENT overdue -> target role admin
    // ---------------------------------------------------------------
    const c2 = await makeComplaint({ tag: 'T2-urgent-overdue', priority: 'urgent', slaOffsetH: -1 });
    createdComplaintIds.push(c2._id);
    const r2 = await escalateComplaint(c2._id, { resolveAuthority: resolver });
    check('T2 escalated', r2.status === 'escalated', r2.reason);
    check('T2 toRole === admin', r2.toRole === 'admin');
    const c2b = await Complaint.findById(c2._id);
    check('T2 currentAuthorityRole === admin', c2b.currentAuthorityRole === 'admin');
    check('T2 currentAuthority === temp admin id', String(c2b.currentAuthority) === String(admin._id));
    const e2 = await escalationsFor(c2._id);
    check('T2 one Escalation, toRole admin', e2.length === 1 && e2[0].toRole === 'admin');

    // ---------------------------------------------------------------
    // TEST 3 — future SLA deadline -> does NOT escalate
    // ---------------------------------------------------------------
    const c3 = await makeComplaint({ tag: 'T3-future', priority: 'high', slaOffsetH: +5 });
    createdComplaintIds.push(c3._id);
    const r3 = await escalateComplaint(c3._id, { resolveAuthority: resolver });
    check('T3 not escalated (skipped)', r3.status === 'skipped', r3.reason);
    check('T3 reason === sla_not_breached', r3.reason === 'sla_not_breached');
    const c3b = await Complaint.findById(c3._id);
    check('T3 complaint unchanged (isEscalated false, level 0)', c3b.isEscalated === false && c3b.escalationLevel === 0);
    check('T3 zero Escalation docs', (await escalationsFor(c3._id)).length === 0);

    // ---------------------------------------------------------------
    // TEST 4 — resolved complaint, expired SLA -> does NOT escalate
    // ---------------------------------------------------------------
    const c4 = await makeComplaint({ tag: 'T4-resolved', priority: 'high', status: 'resolved', slaOffsetH: -5 });
    createdComplaintIds.push(c4._id);
    const r4 = await escalateComplaint(c4._id, { resolveAuthority: resolver });
    check('T4 not escalated', r4.status === 'skipped', r4.reason);
    check('T4 reason === status_resolved', r4.reason === 'status_resolved');
    check('T4 zero Escalation docs', (await escalationsFor(c4._id)).length === 0);

    // ---------------------------------------------------------------
    // TEST 5 — no slaDeadline -> does NOT escalate
    // ---------------------------------------------------------------
    const c5 = await makeComplaint({ tag: 'T5-no-sla', priority: 'high', slaOffsetH: null });
    createdComplaintIds.push(c5._id);
    const r5 = await escalateComplaint(c5._id, { resolveAuthority: resolver });
    check('T5 not escalated', r5.status === 'skipped', r5.reason);
    check('T5 reason === no_sla_deadline', r5.reason === 'no_sla_deadline');
    check('T5 zero Escalation docs', (await escalationsFor(c5._id)).length === 0);

    // ---------------------------------------------------------------
    // TEST 6 — processDueEscalations() twice is idempotent
    // ---------------------------------------------------------------
    const c6 = await makeComplaint({ tag: 'T6-batch', priority: 'medium', slaOffsetH: -2 });
    createdComplaintIds.push(c6._id);
    const run1 = await processDueEscalations({ filter: { roomNumber: MARK }, resolveAuthority: resolver });
    const run2 = await processDueEscalations({ filter: { roomNumber: MARK }, resolveAuthority: resolver });
    check('T6 run1 escalated the new complaint', run1.escalated >= 1, JSON.stringify(run1));
    check('T6 run1 created exactly one Escalation for c6', (await escalationsFor(c6._id)).length === 1);
    check('T6 run2 escalated 0', run2.escalated === 0, JSON.stringify(run2));
    check('T6 run2 added no Escalation records for c6', (await escalationsFor(c6._id)).length === 1);
    const c6b = await Complaint.findById(c6._id);
    check('T6 c6 escalationCount === 1 after two runs', c6b.escalationCount === 1, `got ${c6b.escalationCount}`);

    // ---------------------------------------------------------------
    // TEST 7 — no target authority available -> unchanged, no crash
    // ---------------------------------------------------------------
    const c7 = await makeComplaint({ tag: 'T7-no-authority', priority: 'high', slaOffsetH: -1 });
    createdComplaintIds.push(c7._id);
    const r7 = await escalateComplaint(c7._id, { resolveAuthority: nullResolver });
    check('T7 result.status === failed', r7.status === 'failed', r7.reason);
    check('T7 reason names missing warden', /no_warden/.test(r7.reason), r7.reason);
    const c7b = await Complaint.findById(c7._id);
    check('T7 complaint completely unchanged', c7b.isEscalated === false && c7b.escalationLevel === 0 && c7b.escalationCount === 0 && c7b.currentAuthority == null);
    check('T7 zero Escalation docs', (await escalationsFor(c7._id)).length === 0);
    // and the batch loop survives a no-authority complaint
    const run7 = await processDueEscalations({ filter: { roomNumber: MARK }, resolveAuthority: nullResolver });
    check('T7 processDueEscalations did not crash on no-authority', run7 && typeof run7.checked === 'number', JSON.stringify(run7));
    check('T7 batch reported the failure', run7.failed >= 1);

    // ---------------------------------------------------------------
    // TEST 8 — two simultaneous escalation attempts -> exactly one wins
    // ---------------------------------------------------------------
    const c8 = await makeComplaint({ tag: 'T8-race', priority: 'high', slaOffsetH: -1 });
    createdComplaintIds.push(c8._id);
    const [ra, rb] = await Promise.all([
      escalateComplaint(c8._id, { resolveAuthority: resolver }),
      escalateComplaint(c8._id, { resolveAuthority: resolver })
    ]);
    const outcomes = [ra.status, rb.status].sort();
    check('T8 exactly one escalated, one skipped', outcomes[0] === 'escalated' && outcomes[1] === 'skipped', JSON.stringify([ra.status, rb.status]));
    check('T8 exactly ONE Escalation record', (await escalationsFor(c8._id)).length === 1);
    const c8b = await Complaint.findById(c8._id);
    check('T8 escalationCount === 1', c8b.escalationCount === 1, `got ${c8b.escalationCount}`);
    check('T8 escalationLevel === 1', c8b.escalationLevel === 1, `got ${c8b.escalationLevel}`);

    // ---------------------------------------------------------------
    // Pure helpers
    // ---------------------------------------------------------------
    check('getEscalationTarget(high) -> warden L0->L1', (() => { const t = getEscalationTarget('high'); return t.toRole === 'warden' && t.fromRole === 'maintenance' && t.fromLevel === 0 && t.toLevel === 1; })());
    check('getEscalationTarget(urgent) -> admin', getEscalationTarget('urgent').toRole === 'admin');
    check('shouldEscalate: terminal status blocked', shouldEscalate({ status: 'closed', slaDeadline: new Date(Date.now() - H(1)) }).eligible === false);
    check('shouldEscalate: breached open eligible', shouldEscalate({ status: 'open', slaDeadline: new Date(Date.now() - H(1)), isEscalated: false, escalationLevel: 0 }).eligible === true);

    // ---------------------------------------------------------------
    // findTargetAuthority against real query (active warden only)
    // ---------------------------------------------------------------
    const foundWarden = await findTargetAuthority('warden');
    check('findTargetAuthority(warden) returns an active warden', !!foundWarden && foundWarden.role === 'warden', foundWarden ? String(foundWarden._id) : 'none');
    check('findTargetAuthority never returns the inactive warden', !foundWarden || String(foundWarden._id) !== String(inactiveWarden._id));

    // ---------------------------------------------------------------
    // TEST 9 / 10 — acknowledge + resolve escalation
    // ---------------------------------------------------------------
    const esc = (await escalationsFor(c1._id))[0];
    await expectThrow('ack: nonexistent escalation throws', () => acknowledgeEscalation(new mongoose.Types.ObjectId()));
    await expectThrow('resolve: nonexistent escalation throws', () => resolveEscalation(new mongoose.Types.ObjectId()));
    await expectThrow('resolve before acknowledge throws', () => resolveEscalation(esc._id));
    const ack1 = await acknowledgeEscalation(esc._id);
    check('ack sets acknowledgedAt', ack1.status === 'acknowledged' && ack1.acknowledgedAt instanceof Date);
    const ack2 = await acknowledgeEscalation(esc._id);
    check('ack is idempotent (no timestamp overwrite)', ack2.status === 'already_acknowledged' && +ack2.acknowledgedAt === +ack1.acknowledgedAt);
    const res1 = await resolveEscalation(esc._id);
    check('resolve after ack sets resolvedAt', res1.status === 'resolved' && res1.resolvedAt instanceof Date);
    const res2 = await resolveEscalation(esc._id);
    check('resolve is idempotent', res2.status === 'already_resolved' && +res2.resolvedAt === +res1.resolvedAt);

  } finally {
    // ---------------------------------------------------------------
    // Cleanup — remove EVERYTHING this script created
    // ---------------------------------------------------------------
    const Notification = require('../models/Notification');
    const allTestComplaintIds = (await Complaint.find({ roomNumber: MARK }).select('_id')).map(d => d._id);
    const escDel = await Escalation.deleteMany({ complaintId: { $in: allTestComplaintIds } });
    // escalateComplaint now also creates a notification (STEP 6) — clean those too.
    const nDel = await Notification.deleteMany({ $or: [
      { relatedId: { $in: allTestComplaintIds } },
      { type: 'complaint_escalated', message: new RegExp(MARK) }
    ] });
    const cDel = await Complaint.deleteMany({ roomNumber: MARK });
    const uDel = await User.deleteMany({ email: new RegExp(`^${EMAIL_TAG}\\.`) });

    const residualComplaints = await Complaint.countDocuments({ roomNumber: MARK });
    const residualEscalations = await Escalation.countDocuments({ complaintId: { $in: allTestComplaintIds } });
    const residualNotifications = await Notification.countDocuments({ type: 'complaint_escalated', message: new RegExp(MARK) });
    const residualUsers = await User.countDocuments({ email: new RegExp(`^${EMAIL_TAG}\\.`) });

    console.log(`\ncleanup: complaints -${cDel.deletedCount}, escalations -${escDel.deletedCount}, notifications -${nDel.deletedCount}, users -${uDel.deletedCount}`);
    check('residual test complaints === 0', residualComplaints === 0, `got ${residualComplaints}`);
    check('residual test escalations === 0', residualEscalations === 0, `got ${residualEscalations}`);
    check('residual test notifications === 0', residualNotifications === 0, `got ${residualNotifications}`);
    check('residual test users === 0', residualUsers === 0, `got ${residualUsers}`);

    await mongoose.disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (err) => {
  console.error('FATAL', err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
