import React from 'react';
import { getSlaState, formatDateTime } from './slaState';

/**
 * ResolveX — reusable SLA status display (STEP 8).
 *
 * All SLA-state logic lives in ./slaState.js (pure, no React) so it can be
 * unit-tested. This file is only presentation. The backend `slaDeadline` is the
 * single source of truth — the duration is never re-derived from priority.
 */

export { getSlaState, formatDuration, formatDateTime } from './slaState';

const TONE_BADGE = {
  neutral: 'bg-surface-hover text-ink-muted border border-surface-border',
  blue: 'bg-blue-50 text-blue-700 border border-blue-200',
  red: 'bg-red-50 text-red-700 border border-red-200',
  success: 'bg-green-50 text-green-700 border border-green-200',
};

/** Compact one-line badge for list rows. */
export function SLABadge({ slaDeadline, status, resolvedAt, className = '' }) {
  const s = getSlaState({ slaDeadline, status, resolvedAt });
  return (
    <span className={`badge ${TONE_BADGE[s.tone]} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {s.label}
      {s.detail && <span className="font-normal opacity-80"> · {s.detail}</span>}
    </span>
  );
}

/**
 * Full SLA block for detail views:
 *   SLA Deadline
 *   06 Sep 2026, 6:30 PM
 *   SLA Status
 *   Within SLA · 4h 12m remaining
 */
export default function SLAStatus({ slaDeadline, status, resolvedAt, className = '' }) {
  const s = getSlaState({ slaDeadline, status, resolvedAt });

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <p className="text-xs text-ink-muted">SLA Deadline</p>
        <p className="text-sm text-ink">{slaDeadline ? formatDateTime(slaDeadline) : 'Not set'}</p>
      </div>
      <div>
        <p className="text-xs text-ink-muted">SLA Status</p>
        <div className="mt-1">
          <span className={`badge ${TONE_BADGE[s.tone]}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {s.label}
            {s.detail && <span className="font-normal opacity-80"> · {s.detail}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}
