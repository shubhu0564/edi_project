/**
 * ResolveX — STEP 8 verification: SLA status + timeline data.
 *
 * Confirms the existing complaint / warden APIs return every field the new
 * SLAStatus + ComplaintTimeline components need, and that the SLA state derived
 * from that data is correct for each scenario (A–G in the step spec).
 * Also re-checks the SLA matrix durations via the real create flow.
 *
 * HTTP (server must be on :5000) + direct MongoDB for setup/teardown.
 * Temporary, clearly-marked data only. Residual test data must be 0.
 *
 * Run (with backend running):  node scripts/verifySlaTimelineUi.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Complaint = require('../models/Complaint');
const Escalation = require('../models/Escalation');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Student = require('../models/Student');
const Maintenance = require('../models/Maintenance');
const { escalateComplaint } = require('../services/escalationService');

const BASE = 'http://127.0.0.1:5000';
const TS = Date.now();
const MARK = `SLA8-${TS}`;
const TAG = `sla8t${TS}`;
const H = (n) => n * 3600e3;

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS  ${label}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`FAIL  ${label}${extra ? '  — ' + extra : ''}`); }
};
const j = (r) => r.text().then((t) => { try { return JSON.parse(t); } catch { return t; } });

// Mirror of frontend components/slaState.js (kept minimal — this asserts the
// DATA supports the states; the label logic itself is unit-tested in the frontend).
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
    body: JSON.stringify({ name: `SLA8 ${role}`, email, password: 'test1234', role, ...extra }),
  }).then(j);
  return { email, token: res.token, id: res.user && res.user.id };
}
const H_AUTH = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

async function tempComplaint(fields) {
  const c = new Complaint({
    studentId: fields.studentId || new mongoose.Types.ObjectId(),
    roomNumber: MARK,
    category: 'electricity',
    title: `${MARK} ${fields.tag}`,
    description: 'STEP 8 SLA/timeline verification temp complaint',
    priority: fields.priority || 'high',
    status: fields.status || 'in_progress',
    assignedTo: fields.assignedTo || null,
  });
  if ('slaDeadline' in fields) c.slaDeadline = fields.slaDeadline;
  if (fields.resolvedAt) c.resolvedAt = fields.resolvedAt;
  await c.save();
  return c;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected (db: ${mongoose.connection.name})  MARK=${MARK}\n`);
  if ((await fetch(`${BASE}/api/health`).then((r) => r.status).catch(() => 0)) !== 200) {
    console.error('Backend not reachable on :5000'); process.exit(1);
  }

  try {
    const student = await register('student', { roomNumber: 'S8-1', contact: '0000000000' });
    const staff = await register('maintenance');
    const admin = await register('admin');
    const warden = await register('warden');
    const wardenDoc = await User.findById(warden.id);

    // ---------------------------------------------------------------
    // SLA matrix regression — via the REAL create flow (backend authoritative)
    // ---------------------------------------------------------------
    for (const [priority, hrs] of [['low', 48], ['medium', 24], ['high', 6], ['urgent', 1]]) {
      const res = await fetch(`${BASE}/api/complaints`, {
        method: 'POST', headers: H_AUTH(student.token),
        body: JSON.stringify({ title: `${MARK} ${priority}`, description: 'sla matrix regression check', category: 'electricity', priority, roomNumber: MARK }),
      }).then(j);
      const d = res.data;
      const delta = (new Date(d.slaDeadline) - new Date(d.createdAt)) / 3600e3;
      check(`SLA matrix: ${priority.toUpperCase()} = +${hrs}h`, delta === hrs, `got +${delta}h`);
    }

    // ---------------------------------------------------------------
    // TEST A — HIGH, created now, +6h, unresolved → WITHIN_SLA
    // ---------------------------------------------------------------
    const aRes = await fetch(`${BASE}/api/complaints`, {
      method: 'POST', headers: H_AUTH(student.token),
      body: JSON.stringify({ title: `${MARK} A`, description: 'test A within sla', category: 'electricity', priority: 'high', roomNumber: MARK }),
    }).then(j);
    const A = aRes.data;
    check('A: HIGH slaDeadline = createdAt + 6h', (new Date(A.slaDeadline) - new Date(A.createdAt)) / 3600e3 === 6);
    check('A: SLA state = WITHIN_SLA', slaCode(A) === 'WITHIN_SLA', slaCode(A));

    // ---------------------------------------------------------------
    // TEST B — HIGH, deadline in past, in_progress → SLA_BREACHED
    // ---------------------------------------------------------------
    const B = await tempComplaint({ tag: 'B', priority: 'high', status: 'in_progress', slaDeadline: new Date(Date.now() - H(2)), studentId: student.id, assignedTo: staff.id });
    check('B: SLA state = SLA_BREACHED', slaCode(B.toObject()) === 'SLA_BREACHED');

    // ---------------------------------------------------------------
    // TEST C — resolved before deadline → RESOLVED_WITHIN_SLA
    // ---------------------------------------------------------------
    const C = await tempComplaint({ tag: 'C', priority: 'high', status: 'resolved', slaDeadline: new Date(Date.now() - H(1)), resolvedAt: new Date(Date.now() - H(3)), studentId: student.id });
    check('C: SLA state = RESOLVED_WITHIN_SLA', slaCode(C.toObject()) === 'RESOLVED_WITHIN_SLA');

    // ---------------------------------------------------------------
    // TEST D — resolved after deadline → RESOLVED_AFTER_SLA
    // ---------------------------------------------------------------
    const D = await tempComplaint({ tag: 'D', priority: 'high', status: 'resolved', slaDeadline: new Date(Date.now() - H(5)), resolvedAt: new Date(Date.now() - H(1)), studentId: student.id });
    check('D: SLA state = RESOLVED_AFTER_SLA', slaCode(D.toObject()) === 'RESOLVED_AFTER_SLA');

    // ---------------------------------------------------------------
    // TEST E — escalated complaint: breached → escalated → info visible
    // ---------------------------------------------------------------
    const E = await tempComplaint({ tag: 'E', priority: 'high', status: 'in_progress', slaDeadline: new Date(Date.now() - H(1)), studentId: student.id, assignedTo: staff.id });
    await Maintenance.create({ complaintId: E._id, staffId: staff.id, assignedBy: admin.id, status: 'in_progress' });
    const er = await escalateComplaint(E._id, { resolveAuthority: async () => wardenDoc });
    check('E: escalation succeeded', er.status === 'escalated');
    // student fetches their own complaint list — must carry SLA + escalation fields
    const sList = await fetch(`${BASE}/api/complaints?search=${MARK}%20E`, { headers: H_AUTH(student.token) }).then(j);
    const sE = sList.data.find((x) => String(x._id) === String(E._id));
    check('E: student list item has slaDeadline', sE && !!sE.slaDeadline);
    check('E: student list item shows SLA_BREACHED', sE && slaCode(sE) === 'SLA_BREACHED');
    check('E: student list item has isEscalated=true', sE && sE.isEscalated === true);
    check('E: student list item has escalationLevel + escalatedAt + currentAuthorityRole', sE && sE.escalationLevel === 1 && !!sE.escalatedAt && sE.currentAuthorityRole === 'warden');
    // admin detail
    const aDetail = await fetch(`${BASE}/api/complaints/${E._id}`, { headers: H_AUTH(admin.token) }).then(j);
    check('E: admin detail has slaDeadline + isEscalated + escalatedAt', !!aDetail.data.slaDeadline && aDetail.data.isEscalated === true && !!aDetail.data.escalatedAt);
    // maintenance task view
    const mTasks = await fetch(`${BASE}/api/maintenance/tasks`, { headers: H_AUTH(staff.token) }).then(j);
    const mE = mTasks.data.map((t) => t.complaintId).find((x) => x && String(x._id) === String(E._id));
    check('E: maintenance task complaint carries slaDeadline + isEscalated', mE && !!mE.slaDeadline && mE.isEscalated === true);

    // ---------------------------------------------------------------
    // TEST F — legacy complaint, slaDeadline = null → NOT_AVAILABLE
    // ---------------------------------------------------------------
    const F = await tempComplaint({ tag: 'F', priority: 'high', status: 'open', slaDeadline: null, studentId: student.id });
    check('F: slaDeadline is null (not fabricated)', F.slaDeadline == null);
    check('F: SLA state = NOT_AVAILABLE', slaCode(F.toObject()) === 'NOT_AVAILABLE');
    const fList = await fetch(`${BASE}/api/complaints?search=${MARK}%20F`, { headers: H_AUTH(student.token) }).then(j);
    const fF = fList.data.find((x) => String(x._id) === String(F._id));
    check('F: API returns slaDeadline null, no fabrication', fF && fF.slaDeadline == null);

    // ---------------------------------------------------------------
    // TEST G — warden escalation detail: real Submitted/Escalated/Acknowledged/Resolved timestamps
    // ---------------------------------------------------------------
    const wDetail = await fetch(`${BASE}/api/warden/escalations/${E._id}`, { headers: H_AUTH(warden.token) }).then(j);
    check('G: warden detail success', wDetail.success === true);
    check('G: has createdAt (Submitted)', !!wDetail.data.createdAt);
    check('G: has slaDeadline', !!wDetail.data.slaDeadline);
    check('G: escalations[] present with escalatedAt (Escalated)', Array.isArray(wDetail.data.escalations) && wDetail.data.escalations.length === 1 && !!wDetail.data.escalations[0].escalatedAt);
    check('G: escalation record has fromRole/toRole for timeline', wDetail.data.escalations[0].fromRole === 'maintenance' && wDetail.data.escalations[0].toRole === 'warden');
    check('G: acknowledgedAt null before acknowledge', wDetail.data.escalations[0].acknowledgedAt == null);
    // acknowledge then re-check
    const escId = wDetail.data.escalations[0]._id;
    await fetch(`${BASE}/api/warden/escalations/${escId}/acknowledge`, { method: 'PATCH', headers: H_AUTH(warden.token) }).then(j);
    const wDetail2 = await fetch(`${BASE}/api/warden/escalations/${E._id}`, { headers: H_AUTH(warden.token) }).then(j);
    check('G: acknowledgedAt set after acknowledge (Acknowledged event)', !!wDetail2.data.escalations[0].acknowledgedAt);
    await fetch(`${BASE}/api/warden/escalations/${escId}/resolve`, { method: 'PATCH', headers: H_AUTH(warden.token) }).then(j);
    const wDetail3 = await fetch(`${BASE}/api/warden/escalations/${E._id}`, { headers: H_AUTH(warden.token) }).then(j);
    check('G: escalation resolvedAt set after resolve', !!wDetail3.data.escalations[0].resolvedAt);
    check('G: resolving escalation did NOT resolve the complaint', !RESOLVED.includes(wDetail3.data.status));

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
    await mongoose.disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (err) => {
  console.error('FATAL', err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
