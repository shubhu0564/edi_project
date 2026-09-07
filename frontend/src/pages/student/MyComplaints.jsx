import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { complaintAPI } from '../../utils/api';
import { StatusBadge, PriorityBadge, CategoryBadge, LoadingState, EmptyState } from '../../components/UI';
import { SLABadge } from '../../components/SLAStatus';
import { ClipboardDocumentListIcon, MagnifyingGlassIcon, FunnelIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

export default function MyComplaints() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({});
  const [filters, setFilters] = useState({ status: '', category: '', priority: '', search: '', page: 1 });

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      const { data } = await complaintAPI.getAll({ ...params, limit: 10 });
      setComplaints(data.data);
      setPagination(data.pagination);
    } catch {}
    setLoading(false);
  }, [filters]);

  useEffect(() => { fetchComplaints(); }, [fetchComplaints]);

  const setFilter = (key, value) => setFilters(f => ({ ...f, [key]: value, page: 1 }));

  const timeAgo = (date) => {
    const diff = Date.now() - new Date(date);
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days}d ago`;
  };

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">My Complaints</h1>
          <p className="text-ink-muted mt-1">{pagination.total || 0} total complaints</p>
        </div>
        <Link to="/student/submit-complaint" className="btn-primary">+ New</Link>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
            <input className="input pl-9 py-2" placeholder="Search complaints..."
              value={filters.search} onChange={e => setFilter('search', e.target.value)} />
          </div>
          <select className="input w-auto py-2" value={filters.status} onChange={e => setFilter('status', e.target.value)}>
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select className="input w-auto py-2" value={filters.category} onChange={e => setFilter('category', e.target.value)}>
            <option value="">All Categories</option>
            {['electricity','plumbing','internet','room','furniture','housekeeping','security','other'].map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
          <select className="input w-auto py-2" value={filters.priority} onChange={e => setFilter('priority', e.target.value)}>
            <option value="">All Priority</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          {(filters.status || filters.category || filters.priority || filters.search) && (
            <button onClick={() => setFilters({ status: '', category: '', priority: '', search: '', page: 1 })}
              className="btn-secondary py-2 text-sm">
              <FunnelIcon className="w-4 h-4" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="card overflow-hidden">
        {loading ? <LoadingState /> : complaints.length === 0 ? (
          <EmptyState icon={ClipboardDocumentListIcon} title="No complaints found"
            description="Try adjusting your filters or submit a new complaint"
            action={<Link to="/student/submit-complaint" className="btn-primary">Submit Complaint</Link>} />
        ) : (
          <div className="divide-y divide-surface-border">
            {complaints.map((c) => (
              <Link key={c._id} to={`/student/complaints/${c._id}`}
                className="flex items-start justify-between p-5 hover:bg-surface-hover transition-colors group">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <CategoryBadge category={c.category} />
                    <PriorityBadge priority={c.priority} />
                    <span className="text-ink-muted text-xs">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="font-medium text-ink group-hover:text-brand-800 transition-colors truncate">{c.title}</p>
                  <p className="text-ink-muted text-sm mt-0.5 line-clamp-1">{c.description}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <SLABadge slaDeadline={c.slaDeadline} status={c.status} resolvedAt={c.resolvedAt} />
                    {c.isEscalated && (
                      <span className="badge bg-red-50 text-red-700 border border-red-200">Escalated</span>
                    )}
                    <span className="text-ink-muted text-xs">Room {c.roomNumber}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                  <StatusBadge status={c.status} />
                  <ArrowRightIcon className="w-4 h-4 text-ink-muted group-hover:text-brand-700 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={filters.page <= 1}
            onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
            className="btn-secondary py-2 px-3 text-sm disabled:opacity-40">← Prev</button>
          <span className="text-ink-muted text-sm">Page {pagination.page} of {pagination.pages}</span>
          <button disabled={filters.page >= pagination.pages}
            onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
            className="btn-secondary py-2 px-3 text-sm disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
