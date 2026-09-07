/**
 * ResolveX — Warden dashboard + escalation-management verification (STEP 7)
 *
 * Drives the REAL HTTP API (server must be running on :5000) plus a direct
 * MongoDB connection for setup/teardown. Temporary, clearly-marked test data
 * only — no production complaint/user/escalation is read into scope or modified.
 *
 * Run (with the backend running):  node scripts/verifyWardenDashboard.js
 * Exit: 0 = all passed, 1 = failure / uncaught error
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Complaint = require('../models/Complaint');
const Escalation = require('../models/Escalation');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Student = require('../models/Student');
const { escalateComplaint } = require('../services/escalationService');

const BASE = 'http://127.0.0.1:5000';
const TS = Date.now();
const MARK = `WARD-TEST-${TS}`;
const TAG = `wardtest${TS}`;

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS  ${label}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`FAIL  ${label}${extra ? '  — ' + extra : ''}`); }
};
const j = (r) => r.text().then((t) => { try { return JSON.parse(t); } catch { return t; } });

async function register(role, extra = {}) {
  const email = `${TAG}.${role}${Math.random().toString(36).slice(2, 6)}@example.com`;
  const body = { name: `Ward Test ${role}`, email, password: 'test1234', role, ...extra };
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(j);
  return { email, token: res.token, id: res.user && res.user.id, res };
}
const authHeaders = (token) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });

async function makeEscalatedComplaint(wardenUser, tag, priority = 'high', studentId) {
  const c = new Complaint({
    studentId: studentId || new mongoose.Types.ObjectId(),
    roomNumber: MARK,
    category: 'electricity',
    title: `${MARK} ${tag}`,
    description: 'warden dashboard verification temp complaint',
    priority,
    status: 'in_progress',
  });
  c.slaDeadline = new Date(Date.now() - 3600e3);
  await c.save();
  const r = await escalateComplaint(c._id, { resolveAuthority: async () => wardenUser });
  if (r.status !== 'escalated') throw new Error(`setup escalation failed: ${r.reason}`);
  return c;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected (db: ${mongoose.connection.name})  MARK=${MARK}\n`);

  // health guard
  const health = await fetch(`${BASE}/api/health`).then((r) => r.status).catch(() => 0);
  if (health !== 200) { console.error('Backend not reachable on :5000 — start it first.'); process.exit(1); }

  const createdUserIds = [];
  try {
    const wardenA = await register('warden');
    const wardenB = await register('warden');
    const student = await register('student', { roomNumber: 'T-1', contact: '0000000000' });
    const maint = await register('maintenance');
    const admin = await register('admin');
    createdUserIds.push(wardenA.id, wardenB.id, student.id, maint.id, admin.id);
    check('temp warden A registered as role=warden', wardenA.res.user?.role === 'warden');

    const wardenADoc = await User.findById(wardenA.id);

    // --- escalated complaints owned by warden A ---
    const c1 = await makeEscalatedComplaint(wardenADoc, 'C1-ack-flow', 'high', student.id);
    const c2 = await makeEscalatedComplaint(wardenADoc, 'C2-resolve-flow', 'urgent', student.id);

    // =============================================================
    // 1. Warden A sees only their escalations + KPIs
    // =============================================================
    const listA = await fetch(`${BASE}/api/warden/escalations`, { headers: authHeaders(wardenA.token) }).then(j);
    check('warden A: GET /warden/escalations success', listA.success === true);
    check('warden A: sees exactly 2 escalated complaints', listA.data.length === 2, `got ${listA.data.length}`);
    const ids = listA.data.map((c) => String(c._id));
    check('warden A: list contains c1 & c2', ids.includes(String(c1._id)) && ids.includes(String(c2._id)));
    const row1 = listA.data.find((c) => String(c._id) === String(c1._id));
    check('warden A: assignedTo shown separately from currentAuthority', 'assignedTo' in row1 && 'currentAuthority' in row1);
    check('warden A: currentAuthority is warden A', String(row1.currentAuthority?._id) === String(wardenA.id));
    check('warden A: currentAuthority role = warden', row1.currentAuthority?.role === 'warden');
    check('warden A: assignedTo NOT the warden', !row1.assignedTo || String(row1.assignedTo._id) !== String(wardenA.id));
    check('warden A: escalation records included', Array.isArray(row1.escalations) && row1.escalations.length === 1);
    check('warden A: escalationStatus = pending initially', row1.escalationStatus === 'pending');
    check('warden A: slaState = breached (SLA in the past)', row1.slaState === 'breached');
    check('warden A: KPI escalatedComplaints = 2', listA.kpis.escalatedComplaints === 2, JSON.stringify(listA.kpis));
    check('warden A: KPI pendingEscalations = 2', listA.kpis.pendingEscalations === 2);
    check('warden A: KPI acknowledged = 0', listA.kpis.acknowledged === 0);
    check('warden A: KPI slaBreaches = 2', listA.kpis.slaBreaches === 2);
    check('warden A: KPI urgentComplaints = 1', listA.kpis.urgentComplaints === 1);
    check('warden A: KPI highPriority = 1', listA.kpis.highPriority === 1);

    // filters
    const urgentOnly = await fetch(`${BASE}/api/warden/escalations?priority=urgent`, { headers: authHeaders(wardenA.token) }).then(j);
    check('warden A: priority=urgent filter returns only c2', urgentOnly.data.length === 1 && String(urgentOnly.data[0]._id) === String(c2._id));
    const breachedOnly = await fetch(`${BASE}/api/warden/escalations?sla=breached`, { headers: authHeaders(wardenA.token) }).then(j);
    check('warden A: sla=breached filter returns 2', breachedOnly.data.length === 2);

    // =============================================================
    // 2. Detail view + escalation history
    // =============================================================
    const detail = await fetch(`${BASE}/api/warden/escalations/${c1._id}`, { headers: authHeaders(wardenA.token) }).then(j);
    check('warden A: detail success', detail.success === true);
    check('detail: has description, category, priority, room, student', !!detail.data.description && !!detail.data.category && !!detail.data.priority && !!detail.data.roomNumber && !!detail.data.studentId);
    check('detail: assignment shows currentAuthority = warden A', String(detail.data.currentAuthority?._id) === String(wardenA.id));
    check('detail: SLA fields present (createdAt, slaDeadline)', !!detail.data.createdAt && !!detail.data.slaDeadline);
    check('detail: escalation fields present (level, count, escalatedAt)', detail.data.escalationLevel === 1 && detail.data.escalationCount === 1 && !!detail.data.escalatedAt);
    check('detail: escalation history has 1 record L0->L1 maintenance->warden', detail.data.escalations.length === 1 && detail.data.escalations[0].fromLevel === 0 && detail.data.escalations[0].toLevel === 1 && detail.data.escalations[0].fromRole === 'maintenance' && detail.data.escalations[0].toRole === 'warden');
    check('detail: history record has reason', /SLA/i.test(detail.data.escalations[0].reason || ''));
    check('detail: isUnresolved = true', detail.data.isUnresolved === true);

    // =============================================================
    // 3. Security — non-warden roles are rejected
    // =============================================================
    const asStudent = await fetch(`${BASE}/api/warden/escalations`, { headers: authHeaders(student.token) }).then((r) => r.status);
    check('student CANNOT access /warden/escalations (403)', asStudent === 403, `got ${asStudent}`);
    const asMaint = await fetch(`${BASE}/api/warden/escalations`, { headers: authHeaders(maint.token) }).then((r) => r.status);
    check('maintenance CANNOT access /warden/escalations (403)', asMaint === 403, `got ${asMaint}`);
    const asAdmin = await fetch(`${BASE}/api/warden/escalations`, { headers: authHeaders(admin.token) }).then((r) => r.status);
    check('admin CANNOT access /warden/escalations (403)', asAdmin === 403, `got ${asAdmin}`);
    const noAuth = await fetch(`${BASE}/api/warden/escalations`).then((r) => r.status);
    check('unauthenticated CANNOT access /warden/escalations (401)', noAuth === 401, `got ${noAuth}`);

    // Admin behaviour unchanged — admin still reaches its own stats endpoint
    const adminStats = await fetch(`${BASE}/api/complaints/stats`, { headers: authHeaders(admin.token) }).then((r) => r.status);
    check('admin still reaches /complaints/stats (200)', adminStats === 200, `got ${adminStats}`);

    // =============================================================
    // 4. Warden B isolation
    // =============================================================
    const listB = await fetch(`${BASE}/api/warden/escalations`, { headers: authHeaders(wardenB.token) }).then(j);
    check('warden B: sees 0 of warden A\'s escalations', listB.data.length === 0, `got ${listB.data.length}`);
    const bViewsA = await fetch(`${BASE}/api/warden/escalations/${c1._id}`, { headers: authHeaders(wardenB.token) }).then((r) => r.status);
    check('warden B: CANNOT view warden A\'s complaint detail (404)', bViewsA === 404, `got ${bViewsA}`);
    const escA1 = detail.data.escalations[0]._id;
    const bAcksA = await fetch(`${BASE}/api/warden/escalations/${escA1}/acknowledge`, { method: 'PATCH', headers: authHeaders(wardenB.token) }).then((r) => r.status);
    check('warden B: CANNOT acknowledge warden A\'s escalation (403)', bAcksA === 403, `got ${bAcksA}`);
    const bResolvesA = await fetch(`${BASE}/api/warden/escalations/${escA1}/resolve`, { method: 'PATCH', headers: authHeaders(wardenB.token) }).then((r) => r.status);
    check('warden B: CANNOT resolve warden A\'s escalation (403)', bResolvesA === 403, `got ${bResolvesA}`);

    // =============================================================
    // 5. Acknowledge — backend sets the timestamp, ignores client input
    // =============================================================
    const ackRes = await fetch(`${BASE}/api/warden/escalations/${escA1}/acknowledge`, {
      method: 'PATCH', headers: authHeaders(wardenA.token),
      body: JSON.stringify({ acknowledgedAt: '2000-01-01T00:00:00.000Z' }), // must be ignored
    }).then(j);
    check('warden A: acknowledge success', ackRes.success === true);
    check('warden A: acknowledgedAt is set', !!ackRes.data.acknowledgedAt);
    const ackMs = new Date(ackRes.data.acknowledgedAt).getTime();
    check('warden A: acknowledgedAt is server-now, NOT the client 2000 value', Math.abs(Date.now() - ackMs) < 60000, new Date(ackMs).toISOString());
    // idempotent
    const ackAgain = await fetch(`${BASE}/api/warden/escalations/${escA1}/acknowledge`, { method: 'PATCH', headers: authHeaders(wardenA.token) }).then(j);
    check('warden A: second acknowledge is idempotent', ackAgain.success === true && new Date(ackAgain.data.acknowledgedAt).getTime() === ackMs);
    const c1AfterAck = await Complaint.findById(c1._id);
    check('acknowledge did NOT resolve the complaint', !['resolved', 'closed'].includes(c1AfterAck.status));

    // detail now reflects acknowledged
    const detailAck = await fetch(`${BASE}/api/warden/escalations/${c1._id}`, { headers: authHeaders(wardenA.token) }).then(j);
    check('detail: escalationStatus = acknowledged after ack', detailAck.data.escalationStatus === 'acknowledged');

    // =============================================================
    // 6. Resolve — requires prior acknowledgement
    // =============================================================
    const detail2 = await fetch(`${BASE}/api/warden/escalations/${c2._id}`, { headers: authHeaders(wardenA.token) }).then(j);
    const escA2 = detail2.data.escalations[0]._id;
    const resolveTooEarly = await fetch(`${BASE}/api/warden/escalations/${escA2}/resolve`, { method: 'PATCH', headers: authHeaders(wardenA.token) });
    check('warden A: resolve BEFORE acknowledge is rejected (400)', resolveTooEarly.status === 400, `got ${resolveTooEarly.status}`);
    await fetch(`${BASE}/api/warden/escalations/${escA2}/acknowledge`, { method: 'PATCH', headers: authHeaders(wardenA.token) }).then(j);
    const resolveRes = await fetch(`${BASE}/api/warden/escalations/${escA2}/resolve`, { method: 'PATCH', headers: authHeaders(wardenA.token) }).then(j);
    check('warden A: resolve after acknowledge success', resolveRes.success === true && !!resolveRes.data.resolvedAt);
    const resolveMs = new Date(resolveRes.data.resolvedAt).getTime();
    check('warden A: resolvedAt is server-now', Math.abs(Date.now() - resolveMs) < 60000);
    const resolveAgain = await fetch(`${BASE}/api/warden/escalations/${escA2}/resolve`, { method: 'PATCH', headers: authHeaders(wardenA.token) }).then(j);
    check('warden A: second resolve is idempotent', resolveAgain.success === true && new Date(resolveAgain.data.resolvedAt).getTime() === resolveMs);
    const c2AfterResolve = await Complaint.findById(c2._id);
    check('resolving the ESCALATION did NOT mark the COMPLAINT resolved', !['resolved', 'closed'].includes(c2AfterResolve.status));

    const detailResolved = await fetch(`${BASE}/api/warden/escalations/${c2._id}`, { headers: authHeaders(wardenA.token) }).then(j);
    check('detail: escalationStatus = resolved after resolve', detailResolved.data.escalationStatus === 'resolved');
    check('KPI moves: after 1 ack + 1 resolve, pending=0', (await fetch(`${BASE}/api/warden/escalations`, { headers: authHeaders(wardenA.token) }).then(j)).kpis.pendingEscalations === 0);

    // =============================================================
    // 7. Notification integration — warden A got the complaint_escalated notif
    // =============================================================
    const notifs = await fetch(`${BASE}/api/notifications`, { headers: authHeaders(wardenA.token) }).then(j);
    const escNotifs = notifs.data.filter((n) => n.type === 'complaint_escalated');
    check('warden A: has complaint_escalated notifications', escNotifs.length >= 2, `got ${escNotifs.length}`);
    check('warden A: an escalation notification references c1', escNotifs.some((n) => String(n.relatedId) === String(c1._id)));

  } finally {
    // ---------------- cleanup ----------------
    const testComplaintIds = (await Complaint.find({ roomNumber: MARK }).select('_id')).map((d) => d._id);
    const nDel = await Notification.deleteMany({
      $or: [
        { relatedId: { $in: testComplaintIds } },
        { type: 'complaint_escalated', message: new RegExp(MARK) },
      ],
    });
    const eDel = await Escalation.deleteMany({ complaintId: { $in: testComplaintIds } });
    const cDel = await Complaint.deleteMany({ roomNumber: MARK });
    const testUsers = await User.find({ email: new RegExp(`^${TAG}\\.`) }).select('_id');
    const sDel = await Student.deleteMany({ userId: { $in: testUsers.map((u) => u._id) } });
    const uDel = await User.deleteMany({ email: new RegExp(`^${TAG}\\.`) });

    const residual =
      (await Complaint.countDocuments({ roomNumber: MARK })) +
      (await Escalation.countDocuments({ complaintId: { $in: testComplaintIds } })) +
      (await Notification.countDocuments({ type: 'complaint_escalated', message: new RegExp(MARK) })) +
      (await Student.countDocuments({ userId: { $in: testUsers.map((u) => u._id) } })) +
      (await User.countDocuments({ email: new RegExp(`^${TAG}\\.`) }));

    console.log(`\ncleanup: complaints -${cDel.deletedCount}, escalations -${eDel.deletedCount}, notifications -${nDel.deletedCount}, students -${sDel.deletedCount}, users -${uDel.deletedCount}`);
    check('residual test data === 0', residual === 0, `got ${residual}`);
    await mongoose.disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (err) => {
  console.error('FATAL', err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
