import React from 'react';

// Status badge for complaints
export const StatusBadge = ({ status }) => {
  const map = {
    open: 'bg-amber-100 text-amber-700 border border-amber-200',
    in_progress: 'bg-blue-100 text-blue-700 border border-blue-200',
    resolved: 'bg-green-100 text-green-700 border border-green-200',
    closed: 'bg-surface-hover text-ink-muted border border-surface-border',
    rejected: 'bg-escalation-100 text-escalation-600 border border-escalation-200',
  };
  const labels = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed', rejected: 'Rejected' };
  return (
    <span className={`badge ${map[status] || 'bg-surface-hover text-ink-muted'}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {labels[status] || status}
    </span>
  );
};

// Priority badge — ResolveX palette: neutral / blue / red. No orange, no gradients.
// HIGH = light red chip, URGENT = solid red chip (distinct + readable).
export const PriorityBadge = ({ priority }) => {
  const map = {
    low: 'bg-surface-hover text-ink-soft border border-surface-border',
    medium: 'bg-blue-50 text-blue-700 border border-blue-200',
    high: 'bg-red-50 text-red-700 border border-red-200',
    urgent: 'bg-red-600 text-white animate-pulse-slow shadow-glow',
  };
  return <span className={`badge hover:scale-105 ${map[priority] || 'bg-surface-hover text-ink-soft border border-surface-border'}`}>{priority}</span>;
};

// Category badge
export const CategoryBadge = ({ category }) => {
  const map = {
    electricity: '⚡', plumbing: '🔧', internet: '📶', room: '🏠',
    furniture: '🪑', housekeeping: '🧹', security: '🔒', other: '📋'
  };
  return (
    <span className="badge bg-surface-hover border border-surface-border text-ink-soft">
      {map[category] || '📋'} {category}
    </span>
  );
};

// Loading spinner
export const Spinner = ({ size = 'md' }) => {
  const sizes = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' };
  return (
    <div className={`${sizes[size]} border-2 border-brand-600 border-t-transparent rounded-full animate-spin`} />
  );
};

// Loading state full page
export const LoadingState = ({ message = 'Loading...' }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-in">
    <Spinner size="lg" />
    <p className="text-ink-muted text-sm animate-pulse-slow">{message}</p>
  </div>
);

// Empty state
export const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 gap-4 text-center animate-pop-in">
    <div className="w-16 h-16 bg-brand-gradient-soft rounded-2xl flex items-center justify-center animate-float">
      {Icon && <Icon className="w-8 h-8 text-brand-600" />}
    </div>
    <div>
      <h3 className="font-display font-semibold text-ink mb-1">{title}</h3>
      <p className="text-ink-muted text-sm">{description}</p>
    </div>
    {action}
  </div>
);

// Stat card
export const StatCard = ({ label, value, icon: Icon, color = 'brand', trend }) => {
  const colors = {
    brand: 'text-brand-700 bg-brand-50 group-hover:bg-brand-gradient group-hover:text-white',
    green: 'text-green-700 bg-green-100 group-hover:bg-green-600 group-hover:text-white',
    yellow: 'text-amber-700 bg-amber-100 group-hover:bg-amber-500 group-hover:text-white',
    red: 'text-escalation-600 bg-escalation-100 group-hover:bg-escalation-600 group-hover:text-white',
    blue: 'text-blue-700 bg-blue-100 group-hover:bg-blue-600 group-hover:text-white',
    purple: 'text-violet-700 bg-violet-100 group-hover:bg-violet-600 group-hover:text-white',
  };
  return (
    <div className="group card-interactive p-5 overflow-hidden relative">
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-sm text-ink-muted mb-1">{label}</p>
          <p className="font-display text-3xl font-bold text-ink transition-transform duration-300 group-hover:scale-105 origin-left">{value}</p>
          {trend && <p className="text-xs text-ink-muted mt-1">{trend}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};

// Modal
export const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={`relative card w-full ${sizes[size]} shadow-2xl animate-pop-in`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h2 className="font-display font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink hover:rotate-90 transition-all duration-200 text-xl leading-none">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

// Select component
export const Select = ({ className = '', children, ...props }) => (
  <select className={`input ${className}`} {...props}>{children}</select>
);
