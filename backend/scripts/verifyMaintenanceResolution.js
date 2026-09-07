/**
 * ResolveX — STEP 8.5 verification: maintenance completion sets the SLA outcome.
 *
 * Drives the REAL HTTP API (server must be on :5000) + direct MongoDB for
 * setup/teardown. Temporary, clearly-marked data only. Residual test data must
 * be 0. The intentional demo warden (warden@hostel.com) is NEVER touched.
 *
 * Run (with backend running):  node scripts/verifyMaintenanceResolution.js
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
const { escalateComplaint } = require('../services/escalationService');

const BASE = 'http://127.0.0.1:5000';
const TS = Date.now();
const MARK = `MRES-${TS}`;
const TAG = `mrest${TS}`;
const H = (n) => n * 3600e3;

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS  ${label}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`FAIL  ${label}${extra ? '  — ' + extra : ''}`); }
};
const j = (r) => r.text().then((t) => { try { return JSON.parse(t); } catch { return t; } });

// mirror of frontend components/slaState.js (label mapping only)
const RESOLVED = ['resolved', 'closed'];
function slaCode({ slaDeadline, status, resolvedAt }, now = Date.now()) {
  if (!slaDeadline) return 'NOT_AVAILABLE';
  const dl = new Date(slaDeadline).getTime();
  if (Number.isNaN(dl)) return 'NOT_AVAILABLE';
  if (RESOLVED.includes(status)) {
    const rt = resolvedAt != null ? new Date(resolvedAt).getTime() : NaN;
    if (Number.isNaN(rt)) return 'RESOLVED';
    return rt <= dl ? 'RESOLVED_WITHIN_SLA' : 'RESOLVED_AFTER_SLA';
  }
  return now <= dl ? 'WITHIN_SLA' : 'SLA_BREACHED';
}

async function register(role, extra = {}) {
  const email = `${TAG}.${role}${Math.random().toString(36).slice(2, 6)}@example.com`;
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `MRES ${role}`, email, password: 'test1234', role, ...extra }),
  }).then(j);
  return { email, token: res.token, id: res.user && res.user.id };
}
const A = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected (db: ${mongoose.connection.name})  MARK=${MARK}\n`);
  if ((await fetch(`${BASE}/api/health`).then((r) => r.status).catch(() => 0)) !== 200) {
    console.error('Backend not reachable on :5000'); process.exit(1);
  }

  try {
    const student = await register('student', { roomNumber: 'M-1', contact: '0000000000' });
    const staff = await register('maintenance');
    const admin = await register('admin');
    const warden = await register('warden');
    const wardenDoc = await User.findById(warden.id);

    // helper: create HIGH complaint via real flow, assign to staff, return {complaint, taskId}
    async function makeAssignedComplaint(tag) {
      const cr = await fetch(`${BASE}/api/complaints`, {
        method: 'POST', headers: A(student.token),
        body: JSON.stringify({ title: `${MARK} ${tag}`, description: 'maintenance resolution verification temp complaint', category: 'electricity', priority: 'high', roomNumber: MARK }),
      }).then(j);
      const cid = cr.data._id;
      await fetch(`${BASE}/api/complaints/${cid}`, { method: 'PUT', headers: A(admin.token), body: JSON.stringify({ assignedTo: staff.id }) }).then(j);
      const task = await Maintenance.findOne({ complaintId: cid });
      return { cid, taskId: String(task._id), createdAt: cr.data.createdAt, slaDeadline: cr.data.slaDeadline };
    }
    const getComplaint = async (cid, token = admin.token) => (await fetch(`${BASE}/api/complaints/${cid}`, { headers: A(token) }).then(j)).data;
    // "Mark Complete" — the previously-broken path: status=completed, NO note
    const markComplete = (taskId, body = {}) => fetch(`${BASE}/api/maintenance/tasks/${taskId}`, { method: 'PUT', headers: A(staff.token), body: JSON.stringify({ status: 'completed', ...body }) }).then(j);

    // ---------------------------------------------------------------
    // SLA matrix regression (real create flow)
    // ---------------------------------------------------------------
    for (const [priority, hrs] of [['low', 48], ['medium', 24], ['high', 6], ['urgent', 1]]) {
      const res = await fetch(`${BASE}/api/complaints`, {
        method: 'POST', headers: A(student.token),
        body: JSON.stringify({ title: `${MARK} sla-${priority}`, description: 'sla matrix regression', category: 'electricity', priority, roomNumber: MARK }),
      }).then(j);
      const d = res.data;
      check(`SLA matrix: ${priority.toUpperCase()} = +${hrs}h`, (new Date(d.slaDeadline) - new Date(d.createdAt)) / 3600e3 === hrs);
    }

    // ---------------------------------------------------------------
    // SCENARIO A — HIGH, deadline in the FUTURE, maintenance completes (no note)
    //   → resolvedAt populated, resolvedWithinSla = true, UI "Resolved Within SLA"
    // ---------------------------------------------------------------
    const a = await makeAssignedComplaint('A-future');
    check('A: fresh HIGH complaint deadline is in the future', new Date(a.slaDeadline).getTime() > Date.now());
    await markComplete(a.taskId);
    const A1 = await getComplaint(a.cid);
    check('A: complaint status = resolved', A1.status === 'resolved');
    check('A: resolvedAt populated by server', !!A1.resolvedAt);
    check('A: resolvedAt ~ now (server time, not client)', Math.abs(Date.now() - new Date(A1.resolvedAt).getTime()) < 60000, A1.resolvedAt);
    check('A: resolvedWithinSla === true', A1.resolvedWithinSla === true, String(A1.resolvedWithinSla));
    check('A: SLA state = RESOLVED_WITHIN_SLA', slaCode(A1) === 'RESOLVED_WITHIN_SLA', slaCode(A1));

    // ---------------------------------------------------------------
    // SCENARIO B — HIGH, deadline in the PAST, maintenance completes
    //   → resolvedAt populated, resolvedWithinSla = false, UI "Resolved After SLA"
    // ---------------------------------------------------------------
    const b = await makeAssignedComplaint('B-past');
    await Complaint.updateOne({ _id: b.cid }, { $set: { slaDeadline: new Date(Date.now() - H(3)) } }); // temp: force overdue
    await markComplete(b.taskId, { note: 'Fixed the wiring' }); // note path too
    const B1 = await getComplaint(b.cid);
    check('B: complaint status = resolved', B1.status === 'resolved');
    check('B: resolvedAt populated', !!B1.resolvedAt);
    check('B: resolvedWithinSla === false', B1.resolvedWithinSla === false, String(B1.resolvedWithinSla));
    check('B: SLA state = RESOLVED_AFTER_SLA', slaCode(B1) === 'RESOLVED_AFTER_SLA', slaCode(B1));

    // ---------------------------------------------------------------
    // SCENARIO C — legacy complaint, slaDeadline = null, maintenance completes
    //   → resolvedAt populated, resolvedWithinSla stays null (not fabricated)
    // ---------------------------------------------------------------
    const c = await makeAssignedComplaint('C-legacy');
    await Complaint.updateOne({ _id: c.cid }, { $set: { slaDeadline: null } }); // temp: simulate legacy
    await markComplete(c.taskId);
    const C1 = await getComplaint(c.cid);
    check('C: complaint status = resolved', C1.status === 'resolved');
    check('C: resolvedAt populated', !!C1.resolvedAt);
    check('C: resolvedWithinSla NOT fabricated (null/undefined)', C1.resolvedWithinSla == null, String(C1.resolvedWithinSla));
    check('C: SLA state = NOT_AVAILABLE (no fabricated outcome)', slaCode(C1) === 'NOT_AVAILABLE', slaCode(C1));

    // ---------------------------------------------------------------
    // Client cannot inject resolvedAt / resolvedWithinSla
    // ---------------------------------------------------------------
    const d = await makeAssignedComplaint('D-inject');
    await markComplete(d.taskId, { resolvedAt: '2000-01-01T00:00:00.000Z', resolvedWithinSla: false });
    const D1 = await getComplaint(d.cid);
    check('D: injected resolvedAt ignored — stored value is server-now', Math.abs(Date.now() - new Date(D1.resolvedAt).getTime()) < 60000, D1.resolvedAt);
    check('D: injected resolvedWithinSla ignored — server computed true (future deadline)', D1.resolvedWithinSla === true);

    // ---------------------------------------------------------------
    // ISSUE 4 — timeline now receives resolvedAt (real backend timestamp)
    // ---------------------------------------------------------------
    check('Timeline: resolved complaint carries a real resolvedAt for "Complaint Resolved" node', !!A1.resolvedAt && new Date(A1.resolvedAt).getFullYear() >= 2026);

    // ---------------------------------------------------------------
    // ISSUE 5 — escalation regression: resolving the COMPLAINT closes open
    // escalation records; resolving an ESCALATION stays a separate warden action
    // ---------------------------------------------------------------
    const e = await makeAssignedComplaint('E-escalated');
    await Complaint.updateOne({ _id: e.cid }, { $set: { slaDeadline: new Date(Date.now() - H(1)) } });
    const eDoc = await Complaint.findById(e.cid);
    const er = await escalateComplaint(eDoc._id, { resolveAuthority: async () => wardenDoc });
    check('E: complaint escalated to warden', er.status === 'escalated');
    const escBefore = await Escalation.findOne({ complaintId: e.cid });
    check('E: escalation record open before completion (resolvedAt null)', escBefore && escBefore.resolvedAt == null);
    // warden must still acknowledge before resolving the ESCALATION (unchanged rule)
    const resolveEarly = await fetch(`${BASE}/api/warden/escalations/${escBefore._id}/resolve`, { method: 'PATCH', headers: A(warden.token) });
    check('E: warden resolve-escalation still blocked before acknowledge (400)', resolveEarly.status === 400, `got ${resolveEarly.status}`);
    // maintenance completes the task -> resolves the COMPLAINT
    await markComplete(e.taskId);
    const E1 = await getComplaint(e.cid);
    check('E: complaint resolved by maintenance completion', E1.status === 'resolved' && !!E1.resolvedAt);
    check('E: resolvedWithinSla === false (overdue)', E1.resolvedWithinSla === false);
    const escAfter = await Escalation.findOne({ complaintId: e.cid });
    check('E: open escalation record closed when complaint resolved (resolvedAt set)', escAfter && !!escAfter.resolvedAt);
    check('E: escalation acknowledgedAt still null (complaint resolution != escalation acknowledgement)', escAfter && escAfter.acknowledgedAt == null);

    // ---------------------------------------------------------------
    // Admin resolution path still works (regression on complaintController)
    // ---------------------------------------------------------------
    const f = await makeAssignedComplaint('F-admin');
    await fetch(`${BASE}/api/complaints/${f.cid}`, { method: 'PUT', headers: A(admin.token), body: JSON.stringify({ status: 'resolved' }) }).then(j);
    const F1 = await getComplaint(f.cid);
    check('Admin resolve: resolvedAt + resolvedWithinSla set', !!F1.resolvedAt && F1.resolvedWithinSla === true);

    // ---------------------------------------------------------------
    // Student gets the existing complaint_resolved notification
    // ---------------------------------------------------------------
    const sNotifs = await fetch(`${BASE}/api/notifications`, { headers: A(student.token) }).then(j);
    check('Student received complaint_resolved notification(s)', sNotifs.data.some((n) => n.type === 'complaint_resolved'));

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
    // sanity: the intentional demo warden survives
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
