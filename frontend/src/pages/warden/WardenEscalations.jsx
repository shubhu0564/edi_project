import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { wardenAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { PriorityBadge, CategoryBadge, StatusBadge, LoadingState, EmptyState } from '../../components/UI';
import Logo from '../../components/Logo';
import { InboxIcon, ArrowRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { SlaBadge, EscalationStatusBadge, fmtDateTime, shortRef } from './wardenUi';

const PRIORITIES = ['', 'urgent', 'high', 'medium', 'low'];
const STATUSES = ['', 'open', 'in_progress', 'resolved', 'closed', 'rejected'];
const SLA_STATES = ['', 'breached', 'within', 'resolved'];

function FilterPills({ label, options, value, onChange, renderLabel }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-ink-muted uppercase tracking-wide mr-1">{label}</span>
      {options.map((o) => (
        <button
          key={o || 'all'}
          onClick={() => onChange(o)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
            value === o
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-ink-muted border-surface-border hover:text-ink hover:border-blue-300'
          }`}
        >
          {o === '' ? 'All' : renderLabel ? renderLabel(o) : o.replace('_', ' ')}
        </button>
      ))}
    </div>
  );
}

/**
 * Escalated-complaints list + filters for the Warden.
 * - embedded: hide the page header (used inside WardenDashboard)
 * - onKpis: called with the KPI object returned by the endpoint
 */
export default function WardenEscalations({ embedded = false, onKpis }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ priority: '', status: '', sla: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (filters.priority) params.priority = filters.priority;
      if (filters.status) params.status = filters.status;
      if (filters.sla) params.sla = filters.sla;
      const { data } = await wardenAPI.getEscalations(params);
      setItems(data.data || []);
      if (onKpis && data.kpis) onKpis(data.kpis);
    } catch (err) {
      if (err.response?.status === 403) setError('You are not authorized to view escalations.');
      else setError('Could not load escalated complaints. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filters, onKpis]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // keep in step with the notification poll
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className={embedded ? '' : 'space-y-6 animate-slide-up'}>
      {!embedded && (
        <div>
          <h1 className="page-header flex items-center gap-2.5">
            <Logo size={26} /> Escalated Complaints
          </h1>
          <p className="text-ink-muted mt-1">
            MMCOE Hostel Grievance Portal
            {user?.name ? ` · ${user.name.split(' ')[0]}` : ''}
          </p>
        </div>
      )}

      <div className="card p-4 space-y-3">
        <FilterPills
          label="Priority"
          options={PRIORITIES}
          value={filters.priority}
          onChange={(v) => setFilters((f) => ({ ...f, priority: v }))}
        />
        <FilterPills
          label="Status"
          options={STATUSES}
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          renderLabel={(o) => o.replace('_', ' ')}
        />
        <FilterPills
          label="SLA"
          options={SLA_STATES}
          value={filters.sla}
          onChange={(v) => setFilters((f) => ({ ...f, sla: v }))}
          renderLabel={(o) => (o === 'within' ? 'Within SLA' : o === 'breached' ? 'Breached' : 'Closed')}
        />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <LoadingState message="Loading escalations..." />
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center">
              <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
            </div>
            <p className="text-ink-soft text-sm">{error}</p>
            <button onClick={load} className="btn-secondary text-sm">Retry</button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={InboxIcon}
            title="No escalated complaints"
            description="You're all caught up. Complaints appear here when their SLA is breached and they escalate to you."
          />
        ) : (
          <>
            {/* Desktop / wide: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-muted border-b border-surface-border">
                    <th className="px-4 py-3 font-medium">Complaint</th>
                    <th className="px-4 py-3 font-medium">Priority</th>
                    <th className="px-4 py-3 font-medium">Assigned Staff</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">SLA</th>
                    <th className="px-4 py-3 font-medium">Escalation</th>
                    <th className="px-4 py-3 font-medium">Escalated</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {items.map((c) => (
                    <tr key={c._id} className="hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3">
                        <Link to={`/warden/escalations/${c._id}`} className="font-medium text-ink hover:text-blue-700">
                          {c.title}
                        </Link>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-ink-muted font-mono">{shortRef(c._id)}</span>
                          <CategoryBadge category={c.category} />
                        </div>
                      </td>
                      <td className="px-4 py-3"><PriorityBadge priority={c.priority} /></td>
                      <td className="px-4 py-3 text-ink-soft">
                        {c.assignedTo?.name || <span className="text-ink-muted">Unassigned</span>}
                        {c.assignedTo?.name && <span className="text-ink-muted"> · Maintenance</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                      <td className="px-4 py-3"><SlaBadge state={c.slaState} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <EscalationStatusBadge status={c.escalationStatus} />
                          <span className="text-xs text-ink-muted">Level {c.escalationLevel} · {c.escalationCount}×</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-muted text-xs">{fmtDateTime(c.escalatedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/warden/escalations/${c._id}`} className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-800 text-sm font-medium">
                          Manage <ArrowRightIcon className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden divide-y divide-surface-border">
              {items.map((c) => (
                <Link key={c._id} to={`/warden/escalations/${c._id}`} className="block p-4 hover:bg-surface-hover transition-colors">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <CategoryBadge category={c.category} />
                    <PriorityBadge priority={c.priority} />
                  </div>
                  <p className="font-medium text-ink">{c.title}</p>
                  <p className="text-xs text-ink-muted font-mono mb-2">{shortRef(c._id)}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={c.status} />
                    <SlaBadge state={c.slaState} />
                    <EscalationStatusBadge status={c.escalationStatus} />
                  </div>
                  <p className="text-xs text-ink-muted mt-2">
                    Assigned: {c.assignedTo?.name || 'Unassigned'}{c.assignedTo?.name ? ' · Maintenance' : ''} ·
                    {' '}Escalated {fmtDateTime(c.escalatedAt)}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
