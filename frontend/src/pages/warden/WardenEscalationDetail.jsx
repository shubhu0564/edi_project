import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { wardenAPI } from '../../utils/api';
import { PriorityBadge, CategoryBadge, StatusBadge, LoadingState } from '../../components/UI';
import SLAStatus from '../../components/SLAStatus';
import ComplaintTimeline from '../../components/ComplaintTimeline';
import {
  ArrowLeftIcon, CheckCircleIcon, ShieldCheckIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  SlaBadge, EscalationStatusBadge, PeopleLine, fmtDate, fmtDateTime, fmtHours, hoursSince, shortRef,
} from './wardenUi';

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-surface-border last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-sm text-ink text-right">{value ?? '—'}</span>
    </div>
  );
}

export default function WardenEscalationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await wardenAPI.getEscalation(id);
      setData(res.data.data);
    } catch (err) {
      if (err.response?.status === 404) setError('This escalated complaint was not found or is not assigned to you.');
      else if (err.response?.status === 403) setError('You are not authorized to view this escalation.');
      else setError('Could not load the escalation. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const escalations = data?.escalations || [];
  const active = escalations.length ? escalations[escalations.length - 1] : null;
  const canAcknowledge = active && !active.acknowledgedAt;
  const canResolve = active && active.acknowledgedAt && !active.resolvedAt;

  const doAcknowledge = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const res = await wardenAPI.acknowledge(active._id);
      toast.success(res.data.message || 'Escalation acknowledged.');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to acknowledge.');
    }
    setBusy(false);
  };

  const doResolve = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const res = await wardenAPI.resolve(active._id);
      toast.success(res.data.message || 'Escalation resolved.');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to resolve.');
    }
    setBusy(false);
  };

  if (loading) return <LoadingState message="Loading escalation..." />;

  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate('/warden/escalations')} className="btn-secondary text-sm mb-6">
          <ArrowLeftIcon className="w-4 h-4" /> Back to escalations
        </button>
        <div className="card flex flex-col items-center gap-3 py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center">
            <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
          </div>
          <p className="text-ink-soft text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const c = data;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/warden/escalations')} className="p-2 text-ink-muted hover:text-ink hover:bg-surface-hover rounded-xl transition-colors mt-0.5">
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <CategoryBadge category={c.category} />
            <PriorityBadge priority={c.priority} />
            <StatusBadge status={c.status} />
            <SlaBadge state={c.slaState} />
            <EscalationStatusBadge status={c.escalationStatus} />
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">{c.title}</h1>
          <p className="text-sm text-ink-muted font-mono mt-1">{shortRef(c._id)}</p>
        </div>
      </div>

      {/* Authority actions */}
      <div className="card p-5">
        <h2 className="font-display font-semibold text-ink mb-1">Authority Action</h2>
        <p className="text-sm text-ink-muted mb-4">
          Acknowledging confirms you have taken ownership. Resolving closes out the escalation —
          it does <span className="font-medium text-ink-soft">not</span> mark the complaint itself resolved.
        </p>
        <div className="flex flex-wrap gap-3">
          <button onClick={doAcknowledge} disabled={busy || !canAcknowledge}
            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
            <ShieldCheckIcon className="w-4 h-4" />
            {active?.acknowledgedAt ? 'Acknowledged' : 'Acknowledge'}
          </button>
          <button onClick={doResolve} disabled={busy || !canResolve}
            className="inline-flex items-center justify-center gap-2 bg-white border border-green-300 text-green-700 hover:bg-green-50 font-medium px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <CheckCircleIcon className="w-4 h-4" />
            {active?.resolvedAt ? 'Escalation Resolved' : 'Resolve Escalation'}
          </button>
        </div>
        {active && !active.acknowledgedAt && (
          <p className="text-xs text-ink-muted mt-3">Resolve becomes available after acknowledgement.</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Complaint info */}
        <div className="card p-5">
          <h2 className="font-display font-semibold text-ink mb-3">Complaint</h2>
          <p className="text-ink-soft text-sm leading-relaxed mb-4">{c.description}</p>
          <Row label="Category" value={c.category} />
          <Row label="Priority" value={<PriorityBadge priority={c.priority} />} />
          <Row label="Room" value={c.roomNumber} />
          <Row label="Student" value={c.studentId?.name} />
          <Row label="Complaint status" value={<StatusBadge status={c.status} />} />
          <Row label="Currently unresolved" value={c.isUnresolved ? 'Yes' : 'No'} />
        </div>

        {/* Assignment + SLA */}
        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="font-display font-semibold text-ink mb-3">Assignment</h2>
            <PeopleLine assignedTo={c.assignedTo} currentAuthority={c.currentAuthority} />
          </div>

          <div className="card p-5">
            <h2 className="font-display font-semibold text-ink mb-3">SLA</h2>
            <Row label="Created" value={fmtDateTime(c.createdAt)} />
            <div className="py-3">
              <SLAStatus slaDeadline={c.slaDeadline} status={c.status} resolvedAt={c.resolvedAt} />
            </div>
            <Row label="Resolved at" value={c.resolvedAt ? fmtDateTime(c.resolvedAt) : '—'} />
            <Row
              label="Resolved within SLA"
              value={c.resolvedWithinSla == null ? '—' : c.resolvedWithinSla ? 'Yes' : 'No'}
            />
          </div>
        </div>
      </div>

      {/* Escalation summary */}
      <div className="card p-5">
        <h2 className="font-display font-semibold text-ink mb-3">Escalation</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <div>
            <Row label="Escalation level" value={`Level ${c.escalationLevel}`} />
            <Row label="Escalation count" value={`${c.escalationCount}×`} />
            <Row label="First escalated" value={fmtDateTime(c.escalatedAt)} />
            <Row label="Time since escalation" value={fmtHours(hoursSince(c.escalatedAt))} />
          </div>
          <div>
            <Row label="From role" value={active?.fromRole} />
            <Row label="To role" value={active?.toRole} />
            <Row label="Acknowledged" value={active?.acknowledgedAt ? fmtDateTime(active.acknowledgedAt) : 'Not yet'} />
            <Row label="Escalation resolved" value={active?.resolvedAt ? fmtDateTime(active.resolvedAt) : 'Not yet'} />
          </div>
        </div>
        {active?.reason && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-xs text-red-700 font-medium mb-0.5">Reason</p>
            <p className="text-sm text-ink-soft">{active.reason}</p>
          </div>
        )}
      </div>

      {/* Complaint + escalation timeline (built from real timestamps only) */}
      <div className="card p-5">
        <h2 className="font-display font-semibold text-ink mb-4">Complaint Timeline</h2>
        <ComplaintTimeline complaint={c} escalations={escalations} />
      </div>

      <p className="text-xs text-ink-muted text-center">Last updated {fmtDate(c.updatedAt)}</p>
    </div>
  );
}
