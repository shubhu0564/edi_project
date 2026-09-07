import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

// Approved MMCOE brand mark. Served from frontend/public/logo.png so it is
// referenced as an absolute path at the site root. Aspect ratio preserved via
// fixed height + auto width + object-contain (never stretched or cropped).
const LOGO_SRC = '/logo.png';

const DEMO_ACCOUNTS = [
  { label: 'Student', email: 'arjun@student.com', password: 'student123' },
  { label: 'Staff', email: 'ravi@hostel.com', password: 'staff123' },
  { label: 'Warden', email: 'warden@hostel.com', password: 'warden123' },
  { label: 'Admin', email: 'admin@hostel.com', password: 'admin123' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return toast.error('Please fill all fields');
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      toast.success(`Welcome back, ${user.name}!`);
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'maintenance') navigate('/maintenance');
      else navigate('/student');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (acc) => setForm({ email: acc.email, password: acc.password });

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left branding panel — minimal, institutional */}
      <div className="hidden lg:flex lg:w-1/2 bg-white border-r border-surface-border flex-col items-center justify-center p-12">
        <div className="flex flex-col items-center text-center">
          <img
            src={LOGO_SRC}
            alt="MMCOE"
            className="h-28 w-auto object-contain"
          />
          <h1 className="font-display text-5xl font-bold text-ink mt-8 tracking-tight">
            Resolve<span className="text-blue-700">X</span>
          </h1>
          <p className="text-ink-soft text-lg mt-3">
            MMCOE Hostel Grievance Portal
          </p>
        </div>
      </div>

      {/* Right login panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile branding (left panel is hidden below lg) */}
          <div className="lg:hidden mb-8 flex flex-col items-center text-center">
            <img src={LOGO_SRC} alt="MMCOE" className="h-16 w-auto object-contain mb-3" />
            <span className="font-display text-2xl font-bold text-ink tracking-tight">
              Resolve<span className="text-blue-700">X</span>
            </span>
            <span className="text-ink-muted text-sm mt-1">MMCOE Hostel Grievance Portal</span>
          </div>

          <h2 className="font-display text-3xl font-bold text-ink mb-1">Welcome back</h2>
          <p className="text-ink-muted mb-8">Sign in to your account</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input type="email" className="input" placeholder="you@example.com"
                value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} className="input pr-10"
                  placeholder="Enter your password"
                  value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-soft">
                  {showPass ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</>
              ) : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-ink-muted text-sm mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-brand-700 hover:text-brand-800 font-medium">Register here</Link>
          </p>

          {/* Demo accounts */}
          <div className="mt-8 p-4 card">
            <p className="text-xs text-ink-muted mb-3 font-medium uppercase tracking-wide">Demo Accounts</p>
            <div className="flex gap-2 flex-wrap">
              {DEMO_ACCOUNTS.map((acc) => (
                <button key={acc.label} onClick={() => fillDemo(acc)}
                  className="px-3 py-1.5 rounded-lg bg-surface-hover border border-surface-border text-sm text-ink-soft font-medium hover:border-blue-600/50 hover:text-ink transition-colors">
                  {acc.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-muted mt-2">Click to auto-fill credentials</p>
          </div>
        </div>
      </div>
    </div>
  );
}
