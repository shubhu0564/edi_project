import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { complaintAPI } from '../../utils/api';
import { StatCard, StatusBadge, CategoryBadge, LoadingState } from '../../components/UI';
import { SLABadge } from '../../components/SLAStatus';
import Logo from '../../components/Logo';
import {
  ClipboardDocumentListIcon, PlusCircleIcon, CheckCircleIcon,
  ClockIcon, ExclamationTriangleIcon, ArrowRightIcon
} from '@heroicons/react/24/outline';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await complaintAPI.getAll({ limit: 5 });
        setComplaints(data.data);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const stats = {
    total: complaints.length,
    open: complaints.filter(c => c.status === 'open').length,
    inProgress: complaints.filter(c => c.status === 'in_progress').length,
    resolved: complaints.filter(c => c.status === 'resolved').length,
  };

  const timeAgo = (date) => {
    const diff = Date.now() - new Date(date);
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-header flex items-center gap-2.5">
            <Logo size={26} /> Good morning, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-ink-muted mt-1">
            {user?.studentProfile?.roomNumber && `Room ${user.studentProfile.roomNumber} · `}
            {user?.studentProfile?.course && `${user.studentProfile.course}`}
          </p>
        </div>
        <Link to="/student/submit-complaint" className="btn-primary">
          <PlusCircleIcon className="w-4 h-4" />
          New Complaint
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Complaints" value={stats.total} icon={ClipboardDocumentListIcon} color="brand" />
        <StatCard label="Open" value={stats.open} icon={ExclamationTriangleIcon} color="yellow" />
        <StatCard label="In Progress" value={stats.inProgress} icon={ClockIcon} color="blue" />
        <StatCard label="Resolved" value={stats.resolved} icon={CheckCircleIcon} color="green" />
      </div>

      {/* Recent complaints */}
      <div className="card">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h2 className="font-display font-semibold text-ink">Recent Complaints</h2>
          <Link to="/student/complaints" className="text-sm text-brand-700 hover:text-brand-800 flex items-center gap-1">
            View all <ArrowRightIcon className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? <LoadingState /> : complaints.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-4 text-center">
            <div className="w-14 h-14 bg-surface-hover rounded-2xl flex items-center justify-center">
              <ClipboardDocumentListIcon className="w-7 h-7 text-ink-muted" />
            </div>
            <div>
              <p className="font-medium text-ink">No complaints yet</p>
              <p className="text-ink-muted text-sm mt-1">Submit your first complaint to get started</p>
            </div>
            <Link to="/student/submit-complaint" className="btn-primary">
              <PlusCircleIcon className="w-4 h-4" /> Submit Complaint
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-surface-border">
            {complaints.map((c) => (
              <Link key={c._id} to={`/student/complaints/${c._id}`}
                className="flex items-start justify-between px-6 py-4 hover:bg-surface-hover transition-colors group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <CategoryBadge category={c.category} />
                    <span className="text-ink-muted text-xs">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="font-medium text-ink truncate group-hover:text-brand-800 transition-colors">{c.title}</p>
                  <p className="text-ink-muted text-sm truncate mt-0.5">{c.description}</p>
                  <div className="mt-1.5">
                    <SLABadge slaDeadline={c.slaDeadline} status={c.status} resolvedAt={c.resolvedAt} />
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

      {/* Quick action card */}
      <div className="card p-6 border-brand-600/30 bg-gradient-to-br from-brand-50 to-transparent">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-brand-600/20 rounded-2xl flex items-center justify-center flex-shrink-0">
            <PlusCircleIcon className="w-6 h-6 text-brand-700" />
          </div>
          <div className="flex-1">
            <h3 className="font-display font-semibold text-ink">Need help with something?</h3>
            <p className="text-ink-muted text-sm mt-0.5">Submit a complaint and our maintenance team will resolve it quickly.</p>
          </div>
          <Link to="/student/submit-complaint" className="btn-primary flex-shrink-0">Submit</Link>
        </div>
      </div>
    </div>
  );
}
