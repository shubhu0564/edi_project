import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { maintenanceAPI } from '../../utils/api';
import { PriorityBadge, CategoryBadge, LoadingState, EmptyState, StatCard, Modal } from '../../components/UI';
import { SLABadge } from '../../components/SLAStatus';
import Logo from '../../components/Logo';
import toast from 'react-hot-toast';
import {
  WrenchScrewdriverIcon, ClockIcon, CheckCircleIcon,
  ArrowRightIcon, PlusCircleIcon, ArrowTrendingUpIcon
} from '@heroicons/react/24/outline';

const taskStatusColors = {
  assigned: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-escalation-100 text-escalation-600',
};

export default function MaintenanceDashboard() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [noteModal, setNoteModal] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      const { data } = await maintenanceAPI.getMyTasks(params);
      setTasks(data.data);
    } catch {}
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleUpdateStatus = async (taskId, status) => {
    setUpdating(true);
    try {
      await maintenanceAPI.updateTask(taskId, { status });
      toast.success(`Task marked as ${status}`);
      fetchTasks();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    }
    setUpdating(false);
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setUpdating(true);
    try {
      await maintenanceAPI.updateTask(noteModal, { note: noteText, status: 'in_progress' });
      toast.success('Note added & status set to In Progress');
      setNoteModal(null);
      setNoteText('');
      fetchTasks();
    } catch (err) {
      toast.error('Failed to add note');
    }
    setUpdating(false);
  };

  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'assigned').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
  };

  const timeAgo = (date) => {
    const diff = Date.now() - new Date(date);
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days}d ago`;
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="page-header flex items-center gap-2.5">
          <Logo size={26} /> My Tasks
        </h1>
        <p className="text-ink-muted mt-1">Welcome back, {user?.name?.split(' ')[0]}! Here are your assigned tasks.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Assigned" value={stats.total} icon={WrenchScrewdriverIcon} color="brand" />
        <StatCard label="Pending" value={stats.pending} icon={ClockIcon} color="yellow" />
        <StatCard label="In Progress" value={stats.inProgress} icon={WrenchScrewdriverIcon} color="blue" />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircleIcon} color="green" />
      </div>

      {/* Filter */}
      <div className="card p-4">
        <div className="flex gap-3 flex-wrap">
          {['', 'assigned', 'in_progress', 'completed'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filterStatus === s ? 'bg-brand-600 text-white' : 'bg-surface-hover border border-surface-border text-ink-muted hover:text-ink'}`}>
              {s === '' ? 'All' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div className="card overflow-hidden">
        {loading ? <LoadingState /> : tasks.length === 0 ? (
          <EmptyState icon={WrenchScrewdriverIcon} title="No tasks assigned"
            description="You'll see tasks here once the admin assigns complaints to you" />
        ) : (
          <div className="divide-y divide-surface-border">
            {tasks.map(t => {
              const complaint = t.complaintId;
              if (!complaint) return null;
              return (
                <div key={t._id} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {complaint.category && <CategoryBadge category={complaint.category} />}
                        {complaint.priority && <PriorityBadge priority={complaint.priority} />}
                        <span className={`badge ${taskStatusColors[t.status]}`}>{t.status.replace('_', ' ')}</span>
                        <span className="text-ink-muted text-xs">{timeAgo(t.createdAt)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <SLABadge slaDeadline={complaint.slaDeadline} status={complaint.status} resolvedAt={complaint.resolvedAt} />
                        {complaint.isEscalated && (
                          <span className="badge bg-red-50 text-red-700 border border-red-200">
                            <ArrowTrendingUpIcon className="w-3.5 h-3.5" />
                            Escalated · L{complaint.escalationLevel || 1}
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-ink mb-1">{complaint.title}</p>
                      <p className="text-ink-muted text-sm line-clamp-2">{complaint.description}</p>
                      <p className="text-ink-muted text-xs mt-1">
                        Room {complaint.roomNumber}
                        {complaint.studentId?.name && ` · ${complaint.studentId.name}`}
                      </p>

                      {/* Latest note */}
                      {t.notes?.length > 0 && (
                        <div className="mt-3 p-3 bg-surface rounded-xl border border-surface-border">
                          <p className="text-xs text-ink-muted mb-1">Latest note</p>
                          <p className="text-ink-soft text-sm">{t.notes[t.notes.length - 1].text}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-4 flex-wrap">
                    {t.status === 'assigned' && (
                      <button onClick={() => handleUpdateStatus(t._id, 'in_progress')} disabled={updating}
                        className="btn-primary text-sm py-2">
                        <WrenchScrewdriverIcon className="w-4 h-4" /> Start Task
                      </button>
                    )}
                    {t.status === 'in_progress' && (
                      <button onClick={() => handleUpdateStatus(t._id, 'completed')} disabled={updating}
                        className="bg-green-100 border border-green-200 text-green-700 hover:bg-green-200 font-medium px-4 py-2 rounded-xl transition-all text-sm flex items-center gap-2">
                        <CheckCircleIcon className="w-4 h-4" /> Mark Complete
                      </button>
                    )}
                    <button onClick={() => { setNoteModal(t._id); setNoteText(''); }}
                      className="btn-secondary text-sm py-2">
                      <PlusCircleIcon className="w-4 h-4" /> Add Note
                    </button>
                    <Link to={`/maintenance/complaints/${complaint._id}`}
                      className="btn-secondary text-sm py-2">
                      View Details <ArrowRightIcon className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Note Modal */}
      <Modal isOpen={!!noteModal} onClose={() => setNoteModal(null)} title="Add Progress Note" size="sm">
        <div className="space-y-4">
          <textarea className="input resize-none min-h-28"
            placeholder="Describe the work done or current progress..."
            value={noteText} onChange={e => setNoteText(e.target.value)} />
          <p className="text-xs text-ink-muted">Adding a note will set task status to "In Progress"</p>
          <div className="flex gap-3">
            <button onClick={() => setNoteModal(null)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleAddNote} disabled={updating || !noteText.trim()} className="btn-primary flex-1">
              {updating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              Add Note
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
