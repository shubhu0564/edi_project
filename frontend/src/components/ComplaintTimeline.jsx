import React from 'react';
import { formatDateTime, getSlaState } from './slaState';
import {
  DocumentPlusIcon, WrenchScrewdriverIcon, ChatBubbleLeftRightIcon,
  FlagIcon, ExclamationTriangleIcon, ArrowTrendingUpIcon,
  ShieldCheckIcon, CheckCircleIcon, ClockIcon,
} from '@heroicons/react/24/outline';

/**
 * ResolveX — reusable complaint timeline (STEP 8).
 *
 * Renders ONLY events that are backed by a real timestamp / flag in the
 * complaint or its escalation records. Nothing is fabricated: if
 * firstResponseAt is null there is no "First Response" row.
 *
 * Props:
 *   complaint   — the complaint object (createdAt, slaDeadline, priority,
 *                 status, isEscalated, escalatedAt, currentAuthorityRole,
 *                 firstResponseAt, resolvedAt, …)
 *   assignedAt  — optional assignment timestamp (e.g. the Maintenance record's
 *                 createdAt); when absent, an "Assigned" row is shown without a
 *                 date only if the complaint has an assignee.
 *   escalations — optional array of Escalation records (warden detail only);
 *                 used for per-record Escalated / Acknowledged / Resolved rows.
 */

const RESOLVED_STATUSES = ['resolved', 'closed'];
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default function ComplaintTimeline({ complaint, assignedAt = null, escalations = [] }) {
  if (!complaint) return null;

  const now = Date.now();
  const isResolved = RESOLVED_STATUSES.includes(complaint.status);
  const events = [];

  // 1. Submitted
  events.push({
    key: 'submitted', label: 'Complaint Submitted', at: complaint.createdAt,
    icon: DocumentPlusIcon, state: 'done', sort: ts(complaint.createdAt),
  });

  // 2. Assigned
  if (assignedAt) {
    events.push({
      key: 'assigned', label: 'Assigned to Maintenance', at: assignedAt,
      icon: WrenchScrewdriverIcon, state: 'done', sort: ts(assignedAt),
    });
  } else if (complaint.assignedTo) {
    const name = complaint.assignedTo?.name;
    events.push({
      key: 'assigned', label: name ? `Assigned to ${name} (Maintenance)` : 'Assigned to Maintenance',
      at: null, icon: WrenchScrewdriverIcon, state: 'done', sort: ts(complaint.createdAt) + 1,
    });
  }

  // 3. First response
  if (complaint.firstResponseAt) {
    events.push({
      key: 'first-response', label: 'First Response', at: complaint.firstResponseAt,
      icon: ChatBubbleLeftRightIcon, state: 'done', sort: ts(complaint.firstResponseAt),
    });
  }

  // 4. SLA deadline marker (only when a deadline exists)
  if (complaint.slaDeadline) {
    const dlMs = ts(complaint.slaDeadline);
    const sla = getSlaState(complaint, now);
    const passed = dlMs != null && now > dlMs;
    let state = 'upcoming';
    let label = `SLA Deadline${complaint.priority ? ` — ${String(complaint.priority).toUpperCase()}` : ''}`;
    if (passed && !isResolved) { state = 'breached'; }
    else if (passed) { state = 'done'; }
    events.push({
      key: 'sla', label, at: complaint.slaDeadline,
      icon: state === 'breached' ? ExclamationTriangleIcon : FlagIcon,
      state, sort: dlMs, marker: true,
      note: sla.code === 'SLA_BREACHED' ? `Breached · ${sla.detail}`
        : sla.code === 'WITHIN_SLA' ? sla.detail
        : null,
    });
  }

  // 5. Escalations (+ acknowledged / resolved per record) — from real records
  const escList = Array.isArray(escalations) ? [...escalations].sort((a, b) => ts(a.escalatedAt) - ts(b.escalatedAt)) : [];
  if (escList.length > 0) {
    escList.forEach((e, i) => {
      events.push({
        key: `esc-${e._id || i}`,
        label: `Escalated ${cap(e.fromRole)} → ${cap(e.toRole)}${escList.length > 1 ? ` (L${e.toLevel})` : ''}`,
        at: e.escalatedAt, icon: ArrowTrendingUpIcon, state: 'alert', sort: ts(e.escalatedAt),
        note: e.reason || null,
      });
      if (e.acknowledgedAt) {
        events.push({
          key: `ack-${e._id || i}`, label: `${cap(e.toRole)} Acknowledged`, at: e.acknowledgedAt,
          icon: ShieldCheckIcon, state: 'done', sort: ts(e.acknowledgedAt),
        });
      }
      if (e.resolvedAt) {
        events.push({
          key: `escres-${e._id || i}`, label: 'Escalation Resolved', at: e.resolvedAt,
          icon: CheckCircleIcon, state: 'done', sort: ts(e.resolvedAt),
        });
      }
    });
  } else if (complaint.isEscalated && complaint.escalatedAt) {
    // No escalation records available in this view — fall back to the flags.
    const toRole = complaint.currentAuthorityRole || 'warden';
    events.push({
      key: 'esc', label: `Escalated to ${cap(toRole)}${complaint.escalationLevel ? ` (Level ${complaint.escalationLevel})` : ''}`,
      at: complaint.escalatedAt, icon: ArrowTrendingUpIcon, state: 'alert', sort: ts(complaint.escalatedAt),
    });
  }

  // 6. Resolved (the complaint itself)
  if (complaint.resolvedAt) {
    events.push({
      key: 'resolved', label: 'Complaint Resolved', at: complaint.resolvedAt,
      icon: CheckCircleIcon, state: 'done', sort: ts(complaint.resolvedAt),
    });
  } else if (isResolved) {
    events.push({
      key: 'resolved', label: `Complaint ${cap(complaint.status)}`, at: null,
      icon: CheckCircleIcon, state: 'done', sort: Number.MAX_SAFE_INTEGER - 1,
    });
  }

  // Chronological order; dateless events keep their relative position via `sort`.
  events.sort((a, b) => (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER));

  return (
    <ol className="relative">
      {events.map((e, i) => {
        const Icon = e.icon || ClockIcon;
        const isLast = i === events.length - 1;
        const ring = {
          done: 'bg-blue-600 border-blue-600 text-white',
          alert: 'bg-red-600 border-red-600 text-white',
          breached: 'bg-red-600 border-red-600 text-white',
          upcoming: 'bg-white border-surface-border text-ink-muted',
        }[e.state] || 'bg-white border-surface-border text-ink-muted';
        return (
          <li key={e.key} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 ${ring}`}>
                <Icon className="w-4 h-4" />
              </div>
              {!isLast && <div className="w-0.5 flex-1 bg-surface-border my-1 min-h-6" />}
            </div>
            <div className="pb-5 min-w-0">
              <p className={`text-sm font-medium ${e.state === 'breached' || e.state === 'alert' ? 'text-red-700' : 'text-ink'}`}>
                {e.label}
                {e.state === 'upcoming' && <span className="ml-2 text-xs font-normal text-ink-muted">upcoming</span>}
              </p>
              <p className="text-xs text-ink-muted mt-0.5">{e.at ? formatDateTime(e.at) : 'time not recorded'}</p>
              {e.note && <p className="text-xs text-ink-soft mt-1 break-words">{e.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ts(d) {
  if (!d) return null;
  const n = new Date(d).getTime();
  return Number.isNaN(n) ? null : n;
}
