/**
 * ResolveX — SLA service verification (STEP 3)
 *
 * Lightweight, dependency-free checks for the SLA matrix + service.
 * Does NOT touch MongoDB or any production data.
 *
 * Run: node scripts/verifySlaService.js
 * Exit code 0 = all checks passed, 1 = a check failed.
 */

const { getSLAConfig, calculateDeadline } = require('../services/slaService');

let failures = 0;
function check(label, actual, expected) {
  const pass = actual === expected;
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}  (got: ${actual}, expected: ${expected})`);
}

// --- SLA hours per priority ---
check('LOW    SLA hours', getSLAConfig('low').slaHours, 48);
check('MEDIUM SLA hours', getSLAConfig('medium').slaHours, 24);
check('HIGH   SLA hours', getSLAConfig('high').slaHours, 6);
check('URGENT SLA hours', getSLAConfig('urgent').slaHours, 1);

// --- HIGH must be 6, never the old 4 ---
check('HIGH is not the retired 4-hour value', getSLAConfig('high').slaHours !== 4, true);

// --- escalation targets (config only; no logic this step) ---
check('LOW    escalationTarget', getSLAConfig('low').escalationTarget, 'warden');
check('URGENT escalationTarget', getSLAConfig('urgent').escalationTarget, 'admin');

// --- calculateDeadline: HIGH + start => start + 6h exactly ---
const start = new Date('2026-09-07T10:00:00.000Z');
const highDeadline = calculateDeadline('high', start);
check('HIGH deadline = start + 6h', highDeadline.toISOString(), '2026-09-07T16:00:00.000Z');
check('HIGH deadline delta ms', highDeadline.getTime() - start.getTime(), 6 * 60 * 60 * 1000);

// --- other priorities ---
check('URGENT deadline = start + 1h', calculateDeadline('urgent', start).toISOString(), '2026-09-07T11:00:00.000Z');
check('LOW deadline = start + 48h (two days)', calculateDeadline('low', start).toISOString(), '2026-09-09T10:00:00.000Z');
check('MEDIUM deadline = start + 24h', calculateDeadline('medium', start).toISOString(), '2026-09-08T10:00:00.000Z');

// --- case-insensitive input ---
check('Priority is case-insensitive (HIGH)', getSLAConfig('HIGH').slaHours, 6);

// --- invalid priorities fail loudly, not silently ---
function expectThrow(label, fn) {
  try {
    fn();
    failures += 1;
    console.log(`FAIL  ${label}  (expected an error, none thrown)`);
  } catch (_) {
    console.log(`PASS  ${label}  (threw as expected)`);
  }
}
expectThrow('Unknown priority "critical" throws', () => getSLAConfig('critical'));
expectThrow('Empty priority throws', () => getSLAConfig(''));
expectThrow('Null priority throws', () => calculateDeadline(null, start));
expectThrow('Invalid startTime throws', () => calculateDeadline('high', 'not-a-date'));

console.log('');
if (failures) {
  console.log(`${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log('All SLA service checks passed.');
