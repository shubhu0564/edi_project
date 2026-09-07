import { getSlaState, formatDuration } from './slaState';

const H = (n) => n * 3600e3;
const base = () => Date.now();

describe('getSlaState (STEP 8 SLA state logic)', () => {
  test('TEST A — HIGH, created now, deadline +6h, unresolved → WITHIN_SLA', () => {
    const now = base();
    const s = getSlaState({ slaDeadline: new Date(now + H(6)), status: 'in_progress' }, now);
    expect(s.code).toBe('WITHIN_SLA');
    expect(s.label).toBe('Within SLA');
    expect(s.tone).toBe('blue');
    expect(s.detail).toMatch(/remaining$/);
  });

  test('TEST B — HIGH, deadline in the past, in_progress → SLA_BREACHED', () => {
    const now = base();
    const s = getSlaState({ slaDeadline: new Date(now - H(2)), status: 'in_progress' }, now);
    expect(s.code).toBe('SLA_BREACHED');
    expect(s.label).toBe('SLA Breached');
    expect(s.tone).toBe('red');
    expect(s.detail).toMatch(/overdue$/);
  });

  test('TEST C — resolved before deadline → RESOLVED_WITHIN_SLA', () => {
    const now = base();
    const deadline = new Date(now - H(1));
    const resolvedAt = new Date(now - H(3)); // 2h before deadline
    const s = getSlaState({ slaDeadline: deadline, status: 'resolved', resolvedAt }, now);
    expect(s.code).toBe('RESOLVED_WITHIN_SLA');
    expect(s.label).toBe('Resolved Within SLA');
    expect(s.tone).toBe('success');
  });

  test('TEST D — resolved after deadline → RESOLVED_AFTER_SLA', () => {
    const now = base();
    const deadline = new Date(now - H(5));
    const resolvedAt = new Date(now - H(1)); // 4h after deadline
    const s = getSlaState({ slaDeadline: deadline, status: 'resolved', resolvedAt }, now);
    expect(s.code).toBe('RESOLVED_AFTER_SLA');
    expect(s.label).toBe('Resolved After SLA');
    expect(s.tone).toBe('red');
  });

  test('TEST F — legacy complaint, no slaDeadline → NOT_AVAILABLE (nothing fabricated)', () => {
    const s = getSlaState({ slaDeadline: null, status: 'open' });
    expect(s.code).toBe('NOT_AVAILABLE');
    expect(s.label).toBe('SLA information unavailable');
    expect(s.tone).toBe('neutral');
    expect(s.detail).toBeNull();
  });

  test('resolved with no resolvedAt → RESOLVED (outcome unknown, not fabricated)', () => {
    const s = getSlaState({ slaDeadline: new Date(), status: 'resolved', resolvedAt: null });
    expect(s.code).toBe('RESOLVED');
    expect(s.detail).toBe('SLA outcome not recorded');
  });

  test('exact deadline boundary counts as within SLA', () => {
    const now = base();
    const s = getSlaState({ slaDeadline: new Date(now), status: 'open' }, now);
    expect(s.code).toBe('WITHIN_SLA');
  });

  test('closed status is treated as resolved for SLA purposes', () => {
    const now = base();
    const s = getSlaState(
      { slaDeadline: new Date(now - H(2)), status: 'closed', resolvedAt: new Date(now - H(3)) },
      now
    );
    expect(s.code).toBe('RESOLVED_WITHIN_SLA');
  });
});

describe('formatDuration', () => {
  test('minutes only', () => expect(formatDuration(18 * 60e3)).toBe('18m'));
  test('hours and minutes, zero-padded', () => expect(formatDuration(H(1) + 8 * 60e3)).toBe('1h 08m'));
  test('multi-hour', () => expect(formatDuration(H(5) + 42 * 60e3)).toBe('5h 42m'));
  test('days and hours', () => expect(formatDuration(H(50))).toBe('2d 2h'));
  test('never negative', () => expect(formatDuration(-5000)).toBe('0m'));
});
