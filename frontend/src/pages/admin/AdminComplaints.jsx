import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { complaintAPI, studentAPI } from '../../utils/api';
import { StatusBadge, PriorityBadge, CategoryBadge, LoadingState, EmptyState, Modal } from '../../components/UI';
import { SLABadge } from '../../components/SLAStatus';
import toast from 'react-hot-toast';
import {
  ClipboardDocumentListIcon, MagnifyingGlassIcon, FunnelIcon,
  ArrowRightIcon, WrenchScrewdriverIcon
} from '@heroicons/react/24/outline';

export default function AdminComplaints() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({});
  const [filters, setFilters] = useState({ status: '', category: '', priority: '', search: '', page: 1, sortBy: 'createdAt', order: 'desc' });
  const [quickAssign, setQuickAssign] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [assignTo, setAssignTo] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      const { data } = await complaintAPI.getAll({ ...params, limit: 15 });
      setComplaints(data.data);
      setPagination(data.pagination);
    } catch {}
    setLoading(false);
  }, [filters]);

  useEffect(() => { fetchComplaints(); }, [fetchComplaints]);

  const setFilter = (key, value) => setFilters(f => ({ ...f, [key]: value, page: 1 }));

  const handleQuickAssign = async (complaint) => {
    try {
      const { data } = await studentAPI.getMaintenanceStaff();
      setStaffList(data.data);
      setAssignTo(complaint.assignedTo?._id || '');
      setQuickAssign(complaint);
    } catch { toast.error('Failed to load staff'); }
  };

  const submitAssign = async () => {
    setUpdating(true);
    try {
      await complaintAPI.update(quickAssign._id, { assignedTo: assignTo });
      toast.success('Assigned successfully');
      setQuickAssign(null);
      fetchComplaints();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign');
    }
    setUpdating(false);
  };

  const handleQuickStatus = async (id, status) => {
    try {
      await complaintAPI.update(id, { status });
      toast.success('Status updated');
      fetchComplaints();
    } catch { toast.error('Failed to update'); }
  };

  const timeAgo = (date) => {
    const diff = Date.now() - new Date(date);
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return '1d ago';
    return `${days}d ago`;
  };

  return (
    <div className="space-y-5 animate-slide-up">
      <div>
        <h1 className="page-header">All Complaints</h1>
        <p className="text-ink-muted mt-1">{pagination.total || 0} total complaints</p>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
            <input className="input pl-9 py-2" placeholder="Search by title, description, room..."
              value={filters.search} onChange={e => setFilter('search', e.target.value)} />
          </div>
          <select className="input w-auto py-2" value={filters.status} onChange={e => setFilter('status', e.target.value)}>
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
            <option value="rejected">Rejected</option>
          </select>
          <select className="input w-auto py-2" value={filters.category} onChange={e => setFilter('category', e.target.value)}>
            <option value="">All Categories</option>
            {['electricity','plumbing','internet','room','furniture','housekeeping','security','other'].map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
          <select className="input w-auto py-2" value={filters.priority} onChange={e => setFilter('priority', e.target.value)}>
            <option value="">All Priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select className="input w-auto py-2" value={`${filters.sortBy}-${filters.order}`}
            onChange={e => { const [s, o] = e.target.value.split('-'); setFilters(f => ({ ...f, sortBy: s, order: o })); }}>
            <option value="createdAt-desc">Newest First</option>
            <option value="createdAt-asc">Oldest First</option>
            <option value="priority-desc">Priority (High)</option>
          </select>
          {(filters.status || filters.category || filters.priority || filters.search) && (
            <button onClick={() => setFilters({ status: '', category: '', priority: '', search: '', page: 1, sortBy: 'createdAt', order: 'desc' })}
              className="btn-secondary py-2 text-sm">
              <FunnelIcon className="w-4 h-4" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? <LoadingState /> : complaints.length === 0 ? (
          <EmptyState icon={ClipboardDocumentListIcon} title="No complaints found" description="Try adjusting your filters" />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-border">
                    {['Complaint', 'Student / Room', 'Category', 'Priority', 'Status', 'Date', 'Actions'].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-ink-muted uppercase tracking-wide px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {complaints.map(c => (
                    <tr key={c._id} className="hover:bg-surface-hover transition-colors group">
                      <td className="px-5 py-4 max-w-xs">
                        <p className="font-medium text-ink truncate group-hover:text-brand-800">{c.title}</p>
                        <p className="text-ink-muted text-xs mt-0.5 truncate">{c.description}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <SLABadge slaDeadline={c.slaDeadline} status={c.status} resolvedAt={c.resolvedAt} />
                          {c.isEscalated && (
                            <span className="badge bg-red-50 text-red-700 border border-red-200">Escalated · L{c.escalationLevel || 1}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <p className="text-ink-soft text-sm">{c.studentId?.name || 'N/A'}</p>
                        <p className="text-ink-muted text-xs">Room {c.roomNumber}</p>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap"><CategoryBadge category={c.category} /></td>
                      <td className="px-5 py-4 whitespace-nowrap"><PriorityBadge priority={c.priority} /></td>
                      <td className="px-5 py-4 whitespace-nowrap"><StatusBadge status={c.status} /></td>
                      <td className="px-5 py-4 text-ink-muted text-sm whitespace-nowrap">{timeAgo(c.createdAt)}</td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleQuickAssign(c)} title="Assign"
                            className="p-1.5 text-ink-muted hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors">
                            <WrenchScrewdriverIcon className="w-4 h-4" />
                          </button>
                          {c.status === 'open' && (
                            <button onClick={() => handleQuickStatus(c._id, 'in_progress')}
                              className="text-xs text-blue-700 hover:text-blue-800 px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 transition-colors">
                              Start
                            </button>
                          )}
                          {c.status !== 'resolved' && c.status !== 'closed' && (
                            <button onClick={() => handleQuickStatus(c._id, 'resolved')}
                              className="text-xs text-green-700 hover:text-green-800 px-2 py-1 rounded bg-green-50 hover:bg-green-100 transition-colors">
                              Resolve
                            </button>
                          )}
                          <Link to={`/admin/complaints/${c._id}`}
                            className="p-1.5 text-ink-muted hover:text-ink hover:bg-surface rounded-lg transition-colors">
                            <ArrowRightIcon className="w-4 h-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden divide-y divide-surface-border">
              {complaints.map(c => (
                <div key={c._id} className="p-4">
                  <div className="flex flex-wrap gap-2 mb-2">
                    <CategoryBadge category={c.category} />
                    <PriorityBadge priority={c.priority} />
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <SLABadge slaDeadline={c.slaDeadline} status={c.status} resolvedAt={c.resolvedAt} />
                    {c.isEscalated && (
                      <span className="badge bg-red-50 text-red-700 border border-red-200">Escalated · L{c.escalationLevel || 1}</span>
                    )}
                  </div>
                  <p className="font-medium text-ink mb-1">{c.title}</p>
                  <p className="text-ink-muted text-xs mb-3">{c.studentId?.name} · Room {c.roomNumber} · {timeAgo(c.createdAt)}</p>
                  <div className="flex gap-2">
                    <button onClick={() => handleQuickAssign(c)} className="btn-secondary flex-1 text-sm py-1.5">
                      <WrenchScrewdriverIcon className="w-3.5 h-3.5" /> Assign
                    </button>
                    <Link to={`/admin/complaints/${c._id}`} className="btn-primary flex-1 text-sm py-1.5">
                      View <ArrowRightIcon className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
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

      {/* Quick Assign Modal */}
      <Modal isOpen={!!quickAssign} onClose={() => setQuickAssign(null)} title="Quick Assign" size="sm">
        {quickAssign && (
          <div className="space-y-4">
            <div className="p-3 bg-surface rounded-xl border border-surface-border">
              <p className="text-sm text-ink-soft">{quickAssign.title}</p>
              <p className="text-xs text-ink-muted mt-1">Room {quickAssign.roomNumber}</p>
            </div>
            <div>
              <label className="label">Assign to Maintenance Staff</label>
              <select className="input" value={assignTo} onChange={e => setAssignTo(e.target.value)}>
                <option value="">-- Unassigned --</option>
                {staffList.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setQuickAssign(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={submitAssign} disabled={updating} className="btn-primary flex-1">
                {updating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                Assign
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
