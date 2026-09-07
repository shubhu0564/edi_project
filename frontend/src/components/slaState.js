/**
 * ResolveX — pure SLA-state logic (STEP 8).
 *
 * No React, no JSX — importable by components AND by verification scripts.
 * The backend `slaDeadline` (computed once at creation from the SLA matrix) is
 * the single source of truth; this module only compares timestamps the backend
 * already provides. It NEVER re-derives an SLA duration from priority.
 */

export const RESOLVED_STATUSES = ['resolved', 'closed'];

export function formatDuration(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, '0')}m`;
  return `${mins}m`;
}

export function formatDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/**
 * Resolve the SLA state for a complaint.
 * @param {{slaDeadline?:any, status?:string, resolvedAt?:any}} complaint
 * @param {number} [now] epoch ms (default Date.now())
 * @returns {{code:string,label:string,tone:'neutral'|'blue'|'red'|'success',detail:string|null}}
 *
 * codes: NOT_AVAILABLE | WITHIN_SLA | SLA_BREACHED |
 *        RESOLVED_WITHIN_SLA | RESOLVED_AFTER_SLA | RESOLVED
 */
export function getSlaState({ slaDeadline, status, resolvedAt } = {}, now = Date.now()) {
  if (!slaDeadline) {
    return { code: 'NOT_AVAILABLE', label: 'SLA information unavailable', tone: 'neutral', detail: null };
  }
  const deadlineMs = new Date(slaDeadline).getTime();
  if (Number.isNaN(deadlineMs)) {
    return { code: 'NOT_AVAILABLE', label: 'SLA information unavailable', tone: 'neutral', detail: null };
  }

  const isResolved = RESOLVED_STATUSES.includes(status);
  if (isResolved) {
    const resolvedMs = resolvedAt != null ? new Date(resolvedAt).getTime() : NaN;
    if (Number.isNaN(resolvedMs)) {
      return { code: 'RESOLVED', label: 'Resolved', tone: 'success', detail: 'SLA outcome not recorded' };
    }
    if (resolvedMs <= deadlineMs) {
      return {
        code: 'RESOLVED_WITHIN_SLA', label: 'Resolved Within SLA', tone: 'success',
        detail: `${formatDuration(deadlineMs - resolvedMs)} to spare`,
      };
    }
    return {
      code: 'RESOLVED_AFTER_SLA', label: 'Resolved After SLA', tone: 'red',
      detail: `${formatDuration(resolvedMs - deadlineMs)} over deadline`,
    };
  }

  if (now <= deadlineMs) {
    return { code: 'WITHIN_SLA', label: 'Within SLA', tone: 'blue', detail: `${formatDuration(deadlineMs - now)} remaining` };
  }
  return { code: 'SLA_BREACHED', label: 'SLA Breached', tone: 'red', detail: `${formatDuration(now - deadlineMs)} overdue` };
}
