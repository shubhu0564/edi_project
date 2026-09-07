import React from 'react';

/* Shared bits for the Warden dashboard — keeps badge styling and date
   formatting consistent across the list and detail views.
   Colours follow the ResolveX identity: blue = normal/healthy, red = breach /
   escalation / action-needed, green = resolved (existing success styling). */

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString() : '—');

export const hoursSince = (d) => {
  if (!d) return null;
  return Math.max(0, (Date.now() - new Date(d).getTime()) / 3600000);
};

export const fmtHours = (h) => {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} hrs`;
  return `${Math.round(h / 24)} days`;
};

// SLA state badge — 'breached' | 'within' | 'resolved'
export function SlaBadge({ state }) {
  const map = {
    breached: 'bg-red-50 text-red-700 border border-red-200',
    within: 'bg-blue-50 text-blue-700 border border-blue-200',
    resolved: 'bg-green-50 text-green-700 border border-green-200',
  };
  const label = { breached: 'SLA Breached', within: 'Within SLA', resolved: 'Closed' };
  return (
    <span className={`badge ${map[state] || map.within}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label[state] || state}
    </span>
  );
}

// Escalation lifecycle badge — 'pending' | 'acknowledged' | 'resolved' | 'none'
export function EscalationStatusBadge({ status }) {
  const map = {
    pending: 'bg-red-50 text-red-700 border border-red-200',
    acknowledged: 'bg-blue-50 text-blue-700 border border-blue-200',
    resolved: 'bg-green-50 text-green-700 border border-green-200',
    none: 'bg-surface-hover text-ink-muted border border-surface-border',
  };
  const label = {
    pending: 'Needs Acknowledgement',
    acknowledged: 'Acknowledged',
    resolved: 'Escalation Resolved',
    none: 'No escalation',
  };
  return <span className={`badge ${map[status] || map.none}`}>{label[status] || status}</span>;
}

// "Assigned Staff" vs "Current Authority" — kept visually distinct because the
// distinction matters: the maintenance person does the work, the warden owns
// the escalation. Never shows the warden as the assignee.
export function PeopleLine({ assignedTo, currentAuthority }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <p className="text-xs text-ink-muted">Assigned Staff</p>
        <p className="text-sm text-ink">
          {assignedTo?.name || 'Unassigned'}
          {assignedTo?.name && <span className="text-ink-muted"> — Maintenance</span>}
        </p>
      </div>
      <div>
        <p className="text-xs text-ink-muted">Current Authority</p>
        <p className="text-sm text-ink">
          {currentAuthority?.name || '—'}
          {currentAuthority?.name && (
            <span className="text-ink-muted"> — {currentAuthority.role || 'Warden'}</span>
          )}
        </p>
      </div>
    </div>
  );
}

// Short complaint reference from its Mongo _id.
export const shortRef = (id) => (id ? `#${String(id).slice(-6).toUpperCase()}` : '');
