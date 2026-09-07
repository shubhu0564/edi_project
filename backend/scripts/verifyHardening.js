/**
 * ResolveX — STEP 8.5 release-hardening verification.
 *
 * Covers: complaint status lifecycle guard, firstResponseAt (server-set, once,
 * never from body), client-controlled-field rejection, and the linear-time
 * email regex (incl. a long malicious input).
 *
 * HTTP (server on :5000) + direct MongoDB for setup/teardown. Temp data only,
 * clearly marked. Residual test data must be 0. The intentional demo warden
 * (warden@hostel.com) is never touched.
 *
 * Run (backend running):  node scripts/verifyHardening.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Complaint = require('../models/Complaint');
const Escalation = require('../models/Escalation');
const Notification = require('../models/Notification');
const Maintenance = require('../models/Maintenance');
const User = require('../models/User');
const Student = require('../models/Student');
const { canTransition } = require('../config/complaintLifecycle');

const BASE = 'http://127.0.0.1:5000';
const TS = Date.now();
const MARK = `HARD-${TS}`;
const TAG = `hardt${TS}`;

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS  ${label}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`FAIL  ${label}${extra ? '  — ' + extra : ''}`); }
};
const j = (r) => r.text().then((t) => { try { return JSON.parse(t); } catch { return t; } });
const A = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

async function register(role, extra = {}) {
  const email = `${TAG}.${role}${Math.random().toString(36).slice(2, 6)}@example.com`;
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `HARD ${role}`, email, password: 'test1234', role, ...extra }),
  }).then(j);
  return { email, token: res.token, id: res.user && res.user.id };
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected (db: ${mongoose.connection.name})  MARK=${MARK}\n`);
  if ((await fetch(`${BASE}/api/health`).then((r) => r.status).catch(() => 0)) !== 200) {
    console.error('Backend not reachable on :5000'); process.exit(1);
  }

  // ---------------------------------------------------------------
  // Email regex — linear time, valid still valid, malicious input safe
  // ---------------------------------------------------------------
  const emailRe = User.schema.path('email').options.match[0];
  check('email regex accepts a normal address', emailRe.test('warden@hostel.com'));
  check('email regex accepts sub-domained address', emailRe.test('a.b-c@mail.example.co.uk'));
  check('email regex rejects "no-at"', !emailRe.test('no-at-sign'));
  check('email regex rejects "a@b" (no dot)', !emailRe.test('a@b'));
  const evil = 'a'.repeat(50000) + '@' + 'a'.repeat(50000) + '!';
  const t0 = Date.now();
  const evilResult = emailRe.test(evil);
  const dt = Date.now() - t0;
  check('email regex handles 100k malicious input in <50ms (no ReDoS)', dt < 50 && evilResult === false, `${dt}ms`);

  const createdUserIds = [];
  try {
    const student = await register('student', { roomNumber: 'H-1', contact: '0000000000' });
    const staff = await register('maintenance');
    const admin = await register('admin');
    createdUserIds.push(student.id, staff.id, admin.id);

    async function makeComplaint(tag, priority = 'high') {
      const cr = await fetch(`${BASE}/api/complaints`, {
        method: 'POST', headers: A(student.token),
        body: JSON.stringify({ title: `${MARK} ${tag}`, description: 'hardening verification temp complaint', category: 'electricity', priority, roomNumber: MARK }),
      }).then(j);
      return cr.data;
    }
    const getC = async (id) => (await fetch(`${BASE}/api/complaints/${id}`, { headers: A(admin.token) }).then(j)).data;
    const putC = (id, body) => fetch(`${BASE}/api/complaints/${id}`, { method: 'PUT', headers: A(admin.token), body: JSON.stringify(body) });
    const putTask = (taskId, body) => fetch(`${BASE}/api/maintenance/tasks/${taskId}`, { method: 'PUT', headers: A(staff.token), body: JSON.stringify(body) }).then(j);
    async function assign(cid) {
      await putC(cid, { assignedTo: staff.id }).then(j);
      return String((await Maintenance.findOne({ complaintId: cid }))._id);
    }

    // ---------------------------------------------------------------
    // canTransition policy (unit)
    // ---------------------------------------------------------------
    check('policy: open -> in_progress allowed', canTransition('open', 'in_progress'));
    check('policy: in_progress -> resolved allowed', canTransition('in_progress', 'resolved'));
    check('policy: resolved -> closed allowed', canTransition('resolved', 'closed'));
    check('policy: resolved -> in_progress BLOCKED', !canTransition('resolved', 'in_progress'));
    check('policy: closed -> in_progress BLOCKED', !canTransition('closed', 'in_progress'));
    check('policy: resolved -> open BLOCKED', !canTransition('resolved', 'open'));

    // ---------------------------------------------------------------
    // ISSUE 1 — resolved complaint cannot be dragged backward via the API
    // ---------------------------------------------------------------
    const c1 = await makeComplaint('C1-backward');
    await putC(c1._id, { status: 'in_progress' }).then(j);
    await putC(c1._id, { status: 'resolved' }).then(j);
    check('C1: complaint is resolved', (await getC(c1._id)).status === 'resolved');
    const back = await putC(c1._id, { status: 'in_progress' });
    check('C1: admin PUT resolved -> in_progress rejected (400)', back.status === 400, `got ${back.status}`);
    check('C1: complaint still resolved after blocked attempt', (await getC(c1._id)).status === 'resolved');
    const backOpen = await putC(c1._id, { status: 'open' });
    check('C1: admin PUT resolved -> open rejected (400)', backOpen.status === 400);
    const fwd = await putC(c1._id, { status: 'closed' });
    check('C1: resolved -> closed still allowed (legitimate)', fwd.status === 200, `got ${fwd.status}`);
    const closedBack = await putC(c1._id, { status: 'in_progress' });
    check('C1: closed -> in_progress rejected (400)', closedBack.status === 400);
    // assigning a resolved/closed complaint must not move it backward either
    const c1b = await makeComplaint('C1b-assign-resolved');
    await putC(c1b._id, { status: 'resolved' }).then(j);
    await putC(c1b._id, { assignedTo: staff.id }).then(j);
    check('C1b: assigning a resolved complaint does NOT reopen it', (await getC(c1b._id)).status === 'resolved');

    // ---------------------------------------------------------------
    // ISSUE 2 — firstResponseAt: server-set, once, never from body
    // ---------------------------------------------------------------
    const c2 = await makeComplaint('C2-firstresponse');
    const t2 = await assign(c2._id);
    check('C2: firstResponseAt null before any maintenance response', (await getC(c2._id)).firstResponseAt == null);
    // client tries to inject firstResponseAt on the "Start Task" call
    await putTask(t2, { status: 'in_progress', firstResponseAt: '2000-01-01T00:00:00.000Z' });
    const c2a = await getC(c2._id);
    check('C2: firstResponseAt set on first maintenance response', !!c2a.firstResponseAt);
    check('C2: firstResponseAt is server-now, NOT the injected 2000 value', Math.abs(Date.now() - new Date(c2a.firstResponseAt).getTime()) < 60000, c2a.firstResponseAt);
    const firstTs = c2a.firstResponseAt;
    // subsequent responses must NOT overwrite it
    await new Promise((r) => setTimeout(r, 1100));
    await putTask(t2, { note: 'progress update' });
    check('C2: firstResponseAt unchanged after a later note', (await getC(c2._id)).firstResponseAt === firstTs);
    await putTask(t2, { status: 'completed' });
    check('C2: firstResponseAt unchanged after completion', (await getC(c2._id)).firstResponseAt === firstTs);
    check('C2: complaint resolved on completion with real resolvedAt (timeline)', !!(await getC(c2._id)).resolvedAt);

    // firstResponseAt also set when the first response IS a note
    const c3 = await makeComplaint('C3-note-first');
    const t3 = await assign(c3._id);
    await putTask(t3, { note: 'Looked at it, ordering parts' });
    const c3a = await getC(c3._id);
    check('C3: firstResponseAt set when first response is a note', !!c3a.firstResponseAt);
    check('C3: note moved OPEN complaint to in_progress', c3a.status === 'in_progress');

    // ---------------------------------------------------------------
    // ISSUE 8 — client cannot control server-derived fields on /complaints PUT
    // ---------------------------------------------------------------
    const c4 = await makeComplaint('C4-inject');
    await assign(c4._id);
    await putC(c4._id, { status: 'resolved', resolvedAt: '2000-01-01T00:00:00.000Z', resolvedWithinSla: false, firstResponseAt: '1999-01-01T00:00:00.000Z' }).then(j);
    const c4a = await getC(c4._id);
    check('C4: injected resolvedAt ignored (server-now)', Math.abs(Date.now() - new Date(c4a.resolvedAt).getTime()) < 60000);
    check('C4: injected resolvedWithinSla ignored (server computed true, future deadline)', c4a.resolvedWithinSla === true);

  } finally {
    const ids = (await Complaint.find({ roomNumber: MARK }).select('_id')).map((d) => d._id);
    const nDel = await Notification.deleteMany({ $or: [{ relatedId: { $in: ids } }, { type: 'complaint_escalated', message: new RegExp(MARK) }] });
    const eDel = await Escalation.deleteMany({ complaintId: { $in: ids } });
    const mDel = await Maintenance.deleteMany({ complaintId: { $in: ids } });
    const cDel = await Complaint.deleteMany({ roomNumber: MARK });
    const users = await User.find({ email: new RegExp(`^${TAG}\\.`) }).select('_id');
    const sDel = await Student.deleteMany({ userId: { $in: users.map((u) => u._id) } });
    const uDel = await User.deleteMany({ email: new RegExp(`^${TAG}\\.`) });
    const residual =
      (await Complaint.countDocuments({ roomNumber: MARK })) +
      (await Escalation.countDocuments({ complaintId: { $in: ids } })) +
      (await Maintenance.countDocuments({ complaintId: { $in: ids } })) +
      (await Notification.countDocuments({ type: 'complaint_escalated', message: new RegExp(MARK) })) +
      (await Student.countDocuments({ userId: { $in: users.map((u) => u._id) } })) +
      (await User.countDocuments({ email: new RegExp(`^${TAG}\\.`) }));
    console.log(`\ncleanup: complaints -${cDel.deletedCount}, escalations -${eDel.deletedCount}, maintenance -${mDel.deletedCount}, notifications -${nDel.deletedCount}, students -${sDel.deletedCount}, users -${uDel.deletedCount}`);
    check('residual test data === 0', residual === 0, `got ${residual}`);
    check('demo warden warden@hostel.com still present', !!(await User.findOne({ email: 'warden@hostel.com', role: 'warden' })));
    await mongoose.disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (err) => {
  console.error('FATAL', err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
