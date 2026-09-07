import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import Logo from '../components/Logo';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'student',
    roomNumber: '', contact: '', course: '', year: '1'
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    if (form.password.length < 6) errs.password = 'Password must be at least 6 characters';
    if (form.role === 'student') {
      if (!form.roomNumber.trim()) errs.roomNumber = 'Room number is required';
      if (!/^[0-9]{10}$/.test(form.contact)) errs.contact = 'Enter valid 10-digit number';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const user = await register(form);
      toast.success('Account created successfully!');
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'maintenance') navigate('/maintenance');
      else navigate('/student');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const f = (field) => ({
    value: form[field],
    onChange: (e) => { setForm({ ...form, [field]: e.target.value }); setErrors({ ...errors, [field]: '' }); }
  });

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="mb-8">
          <Logo size={44} withWordmark wordmarkClassName="text-2xl" />
          <p className="text-ink-muted text-sm mt-2">MMCOE Hostel Grievance Portal</p>
        </div>

        <div className="card p-8">
          <h2 className="font-display text-2xl font-bold text-ink mb-1">Create account</h2>
          <p className="text-ink-muted mb-6 text-sm">Fill in your details to get started</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Full Name</label>
                <input className={`input ${errors.name ? 'border-red-500' : ''}`} placeholder="John Doe" {...f('name')} />
                {errors.name && <p className="text-escalation-600 text-xs mt-1">{errors.name}</p>}
              </div>

              <div className="col-span-2">
                <label className="label">Email Address</label>
                <input type="email" className={`input ${errors.email ? 'border-red-500' : ''}`} placeholder="you@example.com" {...f('email')} />
                {errors.email && <p className="text-escalation-600 text-xs mt-1">{errors.email}</p>}
              </div>

              <div className="col-span-2">
                <label className="label">Password</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} className={`input pr-10 ${errors.password ? 'border-red-500' : ''}`} placeholder="Min. 6 characters" {...f('password')} />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-soft">
                    {showPass ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                  </button>
                </div>
                {errors.password && <p className="text-escalation-600 text-xs mt-1">{errors.password}</p>}
              </div>

              <div className="col-span-2">
                <label className="label">Account Type</label>
                <select className="input" {...f('role')}>
                  <option value="student">Student</option>
                  <option value="maintenance">Maintenance Staff</option>
                  <option value="admin">Admin / Warden</option>
                </select>
              </div>

              {form.role === 'student' && (
                <>
                  <div>
                    <label className="label">Room Number</label>
                    <input className={`input ${errors.roomNumber ? 'border-red-500' : ''}`} placeholder="e.g. 101" {...f('roomNumber')} />
                    {errors.roomNumber && <p className="text-escalation-600 text-xs mt-1">{errors.roomNumber}</p>}
                  </div>
                  <div>
                    <label className="label">Contact Number</label>
                    <input className={`input ${errors.contact ? 'border-red-500' : ''}`} placeholder="10-digit number" {...f('contact')} />
                    {errors.contact && <p className="text-escalation-600 text-xs mt-1">{errors.contact}</p>}
                  </div>
                  <div>
                    <label className="label">Course (optional)</label>
                    <input className="input" placeholder="e.g. B.Tech CSE" {...f('course')} />
                  </div>
                  <div>
                    <label className="label">Year</label>
                    <select className="input" {...f('year')}>
                      {[1,2,3,4,5,6].map(y => <option key={y} value={y}>Year {y}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating account...</>
              ) : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-ink-muted text-sm mt-4">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-700 hover:text-brand-800 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
