import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { complaintAPI, studentAPI, roomAPI } from '../../utils/api';
import { StatCard, StatusBadge, CategoryBadge, PriorityBadge, LoadingState } from '../../components/UI';
import Logo from '../../components/Logo';
import {
  ClipboardDocumentListIcon, UsersIcon, BuildingOfficeIcon,
  ExclamationTriangleIcon, ClockIcon, CheckCircleIcon,
  WrenchScrewdriverIcon, ArrowRightIcon, ShieldCheckIcon,
  ArrowTrendingUpIcon, ArrowUpRightIcon, FireIcon
} from '@heroicons/react/24/outline';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

// ResolveX chart palette — blue primary, red reserved for critical series.
const COLORS = ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd'];

const pct = (n) => `${Number(n ?? 0).toFixed(1)}%`;
const hrs = (n) => `${Number(n ?? 0).toFixed(1)} hrs`;

/**
 * KPI card in the ResolveX visual language.
 * tone: 'blue' (normal metric) | 'critical' (red — escalation / breach risk) |
 *       'feature' (prominent blue — SLA compliance headline)
 */
function KpiCard({ label, value, icon: Icon, tone = 'blue', hint }) {
  const tones = {
    blue: {
      wrap: 'bg-white border-surface-border',
      value: 'text-ink',
      chip: 'bg-blue-50 text-blue-700',
    },
    feature: {
      wrap: 'bg-white border-blue-300 ring-1 ring-blue-100',
      value: 'text-blue-700',
      chip: 'bg-blue-600 text-white',
    },
    critical: {
      wrap: 'bg-red-50 border-red-200',
      value: 'text-red-700',
      chip: 'bg-red-600 text-white',
    },
  };
  const t = tones[tone] || tones.blue;
  return (
    <div className={`card p-5 border ${t.wrap} transition-colors`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm text-ink-muted mb-1">{label}</p>
          <p className={`font-display text-3xl font-bold ${t.value}`}>{value}</p>
          {hint && <p className="text-xs text-ink-muted mt-1">{hint}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${t.chip}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [counts, setCounts] = useState({ students: 0, rooms: 0, staff: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, studentsRes, roomsRes, staffRes] = await Promise.all([
          complaintAPI.getStats(),
          studentAPI.getAll({ limit: 1 }),
          roomAPI.getAll(),
          studentAPI.getMaintenanceStaff(),
        ]);
        setStats(statsRes.data.data);
        setCounts({
          students: studentsRes.data.total || 0,
          rooms: roomsRes.data.total || 0,
          staff: staffRes.data.data?.length || 0,
        });
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <LoadingState message="Loading dashboard..." />;

  const statusData = stats?.statusStats?.map(s => ({
    name: s._id.replace('_', ' '),
    value: s.count
  })) || [];

  const categoryData = stats?.categoryStats?.map(s => ({
    name: s._id,
    count: s.count
  })) || [];

  const statusMap = {};
  stats?.statusStats?.forEach(s => { statusMap[s._id] = s.count; });

  const priorityMap = {};
  stats?.priorityStats?.forEach(s => { priorityMap[s._id] = s.count; });

  // KPI block from the extended /complaints/stats endpoint, with legacy-safe fallbacks.
  const k = stats?.kpis || {};
  const totalComplaints = k.totalComplaints ?? stats?.total ?? 0;
  const activeEscalations = k.activeEscalations ?? 0;

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="page-header flex items-center gap-2.5">
          <Logo size={26} /> ResolveX Dashboard
        </h1>
        <p className="text-ink-muted mt-1">MMCOE Hostel Grievance Portal &middot; complaint &amp; SLA intelligence</p>
      </div>

      {/* Complaint volume */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Complaints" value={totalComplaints} icon={ClipboardDocumentListIcon} color="blue" />
        <StatCard label="Open" value={k.openComplaints ?? statusMap['open'] ?? 0} icon={ExclamationTriangleIcon} color="yellow" />
        <StatCard label="In Progress" value={k.inProgressComplaints ?? statusMap['in_progress'] ?? 0} icon={ClockIcon} color="blue" />
        <StatCard label="Resolved" value={k.resolvedComplaints ?? statusMap['resolved'] ?? 0} icon={CheckCircleIcon} color="green" />
      </div>

      {/* Performance & SLA intelligence */}
      <div>
        <h2 className="font-display font-semibold text-ink mb-3">Performance &amp; SLA</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard
            label="SLA Compliance"
            value={pct(k.slaCompliance)}
            icon={ShieldCheckIcon}
            tone="feature"
            hint="Resolved on or before SLA deadline"
          />
          <KpiCard
            label="Resolution Rate"
            value={pct(k.resolutionRate)}
            icon={ArrowTrendingUpIcon}
            tone="blue"
            hint="Resolved / total complaints"
          />
          <KpiCard
            label="Avg Resolution Time"
            value={hrs(k.averageResolutionTimeHours)}
            icon={ClockIcon}
            tone="blue"
            hint="From creation to resolution"
          />
          <KpiCard
            label="Escalation Rate"
            value={pct(k.escalationRate)}
            icon={ArrowUpRightIcon}
            tone="critical"
            hint="Complaints ever escalated / total"
          />
          <KpiCard
            label="Active Escalations"
            value={activeEscalations}
            icon={FireIcon}
            tone={activeEscalations > 0 ? 'critical' : 'blue'}
            hint={activeEscalations > 0 ? 'Currently need escalated authority' : 'None outstanding'}
          />
        </div>
      </div>

      {/* Directory counts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Students" value={counts.students} icon={UsersIcon} color="purple" />
        <StatCard label="Total Rooms" value={counts.rooms} icon={BuildingOfficeIcon} color="blue" />
        <StatCard label="Maintenance Staff" value={counts.staff} icon={WrenchScrewdriverIcon} color="yellow" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status pie */}
        <div className="card p-6">
          <h2 className="font-display font-semibold text-ink mb-4">Complaints by Status</h2>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}
                  labelLine={{ stroke: '#4b5563' }}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e7e1de', borderRadius: 12, color: '#1c1917' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-ink-muted text-center py-10">No data</p>}
        </div>

        {/* Category bar */}
        <div className="card p-6">
          <h2 className="font-display font-semibold text-ink mb-4">Complaints by Category</h2>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e1de" />
                <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e7e1de', borderRadius: 12, color: '#1c1917' }} />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-ink-muted text-center py-10">No data</p>}
        </div>
      </div>

      {/* Priority breakdown */}
      <div className="card p-6">
        <h2 className="font-display font-semibold text-ink mb-4">Complaints by Priority</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {['low', 'medium', 'high', 'urgent'].map((p) => (
            <div key={p} className={`rounded-xl border p-4 ${p === 'urgent' ? 'border-red-200 bg-red-50' : 'border-surface-border bg-white'}`}>
              <div className="flex items-center gap-2 mb-2">
                <PriorityBadge priority={p} />
              </div>
              <p className={`font-display text-2xl font-bold ${p === 'urgent' ? 'text-red-700' : 'text-ink'}`}>
                {priorityMap[p] || 0}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent complaints */}
      <div className="card">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h2 className="font-display font-semibold text-ink">Recent Complaints</h2>
          <Link to="/admin/complaints" className="text-sm text-brand-700 hover:text-brand-800 flex items-center gap-1">
            View all <ArrowRightIcon className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="divide-y divide-surface-border">
          {stats?.recentComplaints?.length === 0 && (
            <p className="text-ink-muted text-center py-10">No complaints yet</p>
          )}
          {stats?.recentComplaints?.map(c => (
            <Link key={c._id} to={`/admin/complaints/${c._id}`}
              className="flex items-center justify-between px-6 py-4 hover:bg-surface-hover transition-colors group">
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <CategoryBadge category={c.category} />
                    <PriorityBadge priority={c.priority} />
                  </div>
                  <p className="font-medium text-ink truncate group-hover:text-brand-800">{c.title}</p>
                  <p className="text-ink-muted text-xs">{c.studentId?.name} · Room {c.roomNumber}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 ml-4">
                <StatusBadge status={c.status} />
                <ArrowRightIcon className="w-4 h-4 text-ink-muted group-hover:text-brand-700" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
