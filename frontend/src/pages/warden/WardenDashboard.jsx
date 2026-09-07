import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from '../../components/UI';
import Logo from '../../components/Logo';
import {
  ArrowTrendingUpIcon, BellAlertIcon, CheckCircleIcon, FireIcon,
  ExclamationTriangleIcon, ClockIcon,
} from '@heroicons/react/24/outline';
import WardenEscalations from './WardenEscalations';
import { fmtHours } from './wardenUi';

export default function WardenDashboard() {
  const { user } = useAuth();
  const [kpis, setKpis] = useState(null);

  const k = kpis || {};

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="page-header flex items-center gap-2.5">
          <Logo size={26} /> Warden Dashboard
        </h1>
        <p className="text-ink-muted mt-1">
          MMCOE Hostel Grievance Portal
          {user?.name ? ` · ${user.name.split(' ')[0]}` : ''}
        </p>
      </div>

      {/* Escalation KPIs — red only for genuine breach / action-needed states */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Escalated Complaints" value={k.escalatedComplaints ?? 0} icon={ArrowTrendingUpIcon} color="blue" />
        <StatCard label="Pending Escalations" value={k.pendingEscalations ?? 0} icon={BellAlertIcon} color={k.pendingEscalations > 0 ? 'red' : 'blue'} />
        <StatCard label="Acknowledged" value={k.acknowledged ?? 0} icon={CheckCircleIcon} color="blue" />
        <StatCard label="SLA Breaches" value={k.slaBreaches ?? 0} icon={ExclamationTriangleIcon} color={k.slaBreaches > 0 ? 'red' : 'blue'} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Urgent Complaints" value={k.urgentComplaints ?? 0} icon={FireIcon} color={k.urgentComplaints > 0 ? 'red' : 'blue'} />
        <StatCard label="High Priority" value={k.highPriority ?? 0} icon={ArrowTrendingUpIcon} color="blue" />
        <StatCard label="Still Unresolved" value={k.unresolved ?? 0} icon={ClockIcon} color={k.unresolved > 0 ? 'red' : 'blue'} />
        <StatCard label="Avg Time Since Escalation" value={fmtHours(k.avgHoursSinceEscalation)} icon={ClockIcon} color="blue" />
      </div>

      <div>
        <h2 className="font-display font-semibold text-ink mb-3">Escalated Complaints</h2>
        <WardenEscalations embedded onKpis={setKpis} />
      </div>
    </div>
  );
}
