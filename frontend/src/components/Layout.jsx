import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { notificationAPI } from '../utils/api';
import Logo from './Logo';
import {
  HomeIcon, ClipboardDocumentListIcon, PlusCircleIcon,
  UsersIcon, BuildingOfficeIcon, WrenchScrewdriverIcon,
  BellIcon, Bars3Icon, XMarkIcon, ArrowRightOnRectangleIcon,
  ChevronDownIcon, ArrowTrendingUpIcon
} from '@heroicons/react/24/outline';

const navLinks = {
  student: [
    { to: '/student', icon: HomeIcon, label: 'Dashboard', end: true },
    { to: '/student/submit-complaint', icon: PlusCircleIcon, label: 'New Complaint' },
    { to: '/student/complaints', icon: ClipboardDocumentListIcon, label: 'My Complaints' },
  ],
  admin: [
    { to: '/admin', icon: HomeIcon, label: 'Dashboard', end: true },
    { to: '/admin/complaints', icon: ClipboardDocumentListIcon, label: 'All Complaints' },
    { to: '/admin/students', icon: UsersIcon, label: 'Students' },
    { to: '/admin/rooms', icon: BuildingOfficeIcon, label: 'Rooms' },
  ],
  maintenance: [
    { to: '/maintenance', icon: WrenchScrewdriverIcon, label: 'My Tasks', end: true },
  ],
  warden: [
    { to: '/warden', icon: HomeIcon, label: 'Dashboard', end: true },
    { to: '/warden/escalations', icon: ArrowTrendingUpIcon, label: 'Escalated Complaints' },
  ],
};

const roleColors = {
  student: 'text-blue-700 bg-blue-100',
  admin: 'text-brand-700 bg-brand-50',
  maintenance: 'text-amber-700 bg-amber-100',
  warden: 'text-blue-700 bg-blue-100',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  const links = navLinks[user?.role] || [];

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      const { data } = await notificationAPI.getAll();
      setNotifications(data.data);
      setUnread(data.unreadCount);
    } catch {}
  };

  const handleMarkRead = async (id) => {
    try {
      await notificationAPI.markRead(id);
      fetchNotifications();
    } catch {}
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="min-h-screen flex bg-surface">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-surface-card border-r border-surface-border flex flex-col transform transition-transform duration-300 lg:translate-x-0 lg:inset-auto lg:sticky lg:top-0 lg:h-screen ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-surface-border bg-brand-gradient-soft">
          <Logo size={32} withWordmark wordmarkClassName="text-lg" />
          <button className="lg:hidden text-ink-muted" onClick={() => setSidebarOpen(false)}>
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* User info */}
        <div className="px-4 py-4 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-gradient shadow-sm flex items-center justify-center text-white font-display font-bold text-sm">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-ink text-sm truncate">{user?.name}</p>
              <span className={`badge text-xs ${roleColors[user?.role]}`}>
                {user?.role}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {links.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon className="w-4.5 h-4.5 flex-shrink-0" style={{ width: 18, height: 18 }} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-surface-border">
          <button onClick={handleLogout} className="sidebar-link w-full text-escalation-600 hover:text-escalation-700 hover:bg-escalation-50">
            <ArrowRightOnRectangleIcon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-surface-card border-b border-surface-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-10">
          <div className="flex items-center gap-3 lg:hidden">
            <button className="text-ink-muted hover:text-ink" onClick={() => setSidebarOpen(true)}>
              <Bars3Icon className="w-6 h-6" />
            </button>
            <Logo size={26} withWordmark wordmarkClassName="text-base" />
          </div>
          <div className="hidden lg:block" />

          <div className="flex items-center gap-3">
            {/* Notifications */}
            <div className="relative">
              <button onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 text-ink-muted hover:text-ink hover:bg-surface-hover rounded-xl transition-all duration-200 hover:scale-105">
                <BellIcon className={`w-5 h-5 ${unread > 0 ? 'animate-pulse-slow' : ''}`} />
                {unread > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-brand-gradient rounded-full text-[10px] font-bold text-white flex items-center justify-center shadow-glow">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-12 w-80 card shadow-2xl z-50 animate-pop-in origin-top-right">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
                    <span className="font-medium text-ink text-sm">Notifications</span>
                    {unread > 0 && (
                      <button onClick={() => handleMarkRead('all')} className="text-xs text-brand-700 hover:text-brand-800">
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-center text-ink-muted text-sm py-6">No notifications</p>
                    ) : notifications.map((n) => (
                      <div key={n._id} onClick={() => handleMarkRead(n._id)}
                        className={`px-4 py-3 border-b border-surface-border cursor-pointer hover:bg-surface-hover transition-colors ${!n.isRead ? 'bg-brand-600/5' : ''}`}>
                        <div className="flex items-start gap-2">
                          {!n.isRead && <span className="w-2 h-2 bg-brand-500 rounded-full mt-1.5 flex-shrink-0" />}
                          <div className={!n.isRead ? '' : 'ml-4'}>
                            <p className="text-sm font-medium text-ink">{n.title}</p>
                            <p className="text-xs text-ink-muted mt-0.5">{n.message}</p>
                            <p className="text-[11px] text-ink-muted mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-2 text-sm text-ink-muted">
              <span>{user?.name}</span>
              <ChevronDownIcon className="w-4 h-4" />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
