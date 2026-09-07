import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { complaintAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import { PlusCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

const CATEGORIES = [
  { value: 'electricity', label: 'Electricity', icon: '⚡', desc: 'Power cuts, wiring, fan/AC issues' },
  { value: 'plumbing', label: 'Plumbing', icon: '🔧', desc: 'Water leaks, taps, drainage' },
  { value: 'internet', label: 'Internet', icon: '📶', desc: 'WiFi, LAN connectivity issues' },
  { value: 'room', label: 'Room', icon: '🏠', desc: 'Doors, windows, walls, ceiling' },
  { value: 'furniture', label: 'Furniture', icon: '🪑', desc: 'Beds, chairs, tables, almirahs' },
  { value: 'housekeeping', label: 'Housekeeping', icon: '🧹', desc: 'Cleaning, sanitation, hygiene' },
  { value: 'security', label: 'Security', icon: '🔒', desc: 'Locks, CCTV, entry issues' },
  { value: 'other', label: 'Other', icon: '📋', desc: 'Any other issue' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low', desc: 'Can wait a few days', color: 'text-ink-muted' },
  { value: 'medium', label: 'Medium', desc: 'Should be fixed this week', color: 'text-blue-700' },
  { value: 'high', label: 'High', desc: 'Needs urgent attention', color: 'text-red-600' },
  { value: 'urgent', label: 'Urgent', desc: 'Emergency! Fix ASAP', color: 'text-red-700' },
];

export default function SubmitComplaint() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    category: '',
    priority: 'medium',
    title: '',
    description: '',
    roomNumber: user?.studentProfile?.roomNumber || '',
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!form.category) errs.category = 'Please select a category';
    if (!form.title.trim()) errs.title = 'Title is required';
    if (form.description.trim().length < 10) errs.description = 'Description must be at least 10 characters';
    if (!form.roomNumber.trim()) errs.roomNumber = 'Room number is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await complaintAPI.create(form);
      toast.success('Complaint submitted successfully!');
      navigate('/student/complaints');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit complaint');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-slide-up">
      <div>
        <h1 className="page-header">Submit a Complaint</h1>
        <p className="text-ink-muted mt-1">Describe your issue and we'll get it resolved quickly.</p>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-2 ${step >= s ? 'text-brand-700' : 'text-ink-muted'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-colors
                ${step > s ? 'bg-brand-600 border-brand-600 text-white' : step === s ? 'border-brand-600 text-brand-700' : 'border-surface-border text-ink-muted'}`}>
                {step > s ? '✓' : s}
              </div>
              <span className="text-sm hidden sm:block">{['Category', 'Details', 'Review'][s - 1]}</span>
            </div>
            {s < 3 && <div className={`flex-1 h-px ${step > s ? 'bg-brand-600' : 'bg-surface-border'}`} />}
          </React.Fragment>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {/* Step 1: Category */}
        {step === 1 && (
          <div className="card p-6 space-y-4 animate-slide-up">
            <h2 className="font-display font-semibold text-ink">Select Category</h2>
            {errors.category && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-escalation-50 border border-escalation-200 text-escalation-600 text-sm">
                <ExclamationCircleIcon className="w-4 h-4" /> {errors.category}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {CATEGORIES.map((cat) => (
                <button key={cat.value} type="button"
                  onClick={() => { setForm({ ...form, category: cat.value }); setErrors({ ...errors, category: '' }); }}
                  className={`p-4 rounded-xl border text-left transition-all duration-200 hover:border-brand-600/50
                    ${form.category === cat.value
                      ? 'border-brand-600 bg-brand-600/10 text-ink'
                      : 'border-surface-border bg-surface-hover text-ink-soft'}`}>
                  <div className="text-2xl mb-1">{cat.icon}</div>
                  <div className="font-medium text-sm">{cat.label}</div>
                  <div className="text-xs text-ink-muted mt-0.5">{cat.desc}</div>
                </button>
              ))}
            </div>

            <div>
              <label className="label">Priority Level</label>
              <div className="grid grid-cols-2 gap-2">
                {PRIORITIES.map((p) => (
                  <button key={p.value} type="button"
                    onClick={() => setForm({ ...form, priority: p.value })}
                    className={`p-3 rounded-xl border text-left transition-all
                      ${form.priority === p.value
                        ? 'border-brand-600 bg-brand-600/10'
                        : 'border-surface-border bg-surface-hover'}`}>
                    <div className={`font-medium text-sm ${p.color}`}>{p.label}</div>
                    <div className="text-xs text-ink-muted">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <button type="button" onClick={() => {
              if (!form.category) { setErrors({ ...errors, category: 'Please select a category' }); return; }
              setStep(2);
            }} className="btn-primary w-full">Continue</button>
          </div>
        )}

        {/* Step 2: Details */}
        {step === 2 && (
          <div className="card p-6 space-y-4 animate-slide-up">
            <h2 className="font-display font-semibold text-ink">Complaint Details</h2>
            <div>
              <label className="label">Room Number</label>
              <input className={`input ${errors.roomNumber ? 'border-red-500' : ''}`}
                value={form.roomNumber}
                onChange={e => setForm({ ...form, roomNumber: e.target.value })}
                placeholder="e.g. 101" />
              {errors.roomNumber && <p className="text-escalation-600 text-xs mt-1">{errors.roomNumber}</p>}
            </div>

            <div>
              <label className="label">Title <span className="text-ink-muted font-normal">(brief summary)</span></label>
              <input className={`input ${errors.title ? 'border-red-500' : ''}`}
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Ceiling fan not working" maxLength={100} />
              <div className="flex justify-between mt-1">
                {errors.title ? <p className="text-escalation-600 text-xs">{errors.title}</p> : <span />}
                <span className="text-xs text-ink-muted">{form.title.length}/100</span>
              </div>
            </div>

            <div>
              <label className="label">Description <span className="text-ink-muted font-normal">(detailed explanation)</span></label>
              <textarea className={`input min-h-32 resize-none ${errors.description ? 'border-red-500' : ''}`}
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the issue in detail. Include when it started, how it affects you, etc."
                maxLength={1000} />
              <div className="flex justify-between mt-1">
                {errors.description ? <p className="text-escalation-600 text-xs">{errors.description}</p> : <span />}
                <span className="text-xs text-ink-muted">{form.description.length}/1000</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1">Back</button>
              <button type="button" onClick={() => {
                const errs = {};
                if (!form.title.trim()) errs.title = 'Title is required';
                if (form.description.trim().length < 10) errs.description = 'Description must be at least 10 characters';
                if (!form.roomNumber.trim()) errs.roomNumber = 'Room number is required';
                if (Object.keys(errs).length > 0) { setErrors(errs); return; }
                setStep(3);
              }} className="btn-primary flex-1">Review</button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="card p-6 space-y-4 animate-slide-up">
            <h2 className="font-display font-semibold text-ink">Review & Submit</h2>
            <div className="space-y-3 p-4 bg-surface rounded-xl border border-surface-border">
              {[
                { label: 'Category', value: `${CATEGORIES.find(c => c.value === form.category)?.icon} ${CATEGORIES.find(c => c.value === form.category)?.label}` },
                { label: 'Priority', value: PRIORITIES.find(p => p.value === form.priority)?.label },
                { label: 'Room', value: form.roomNumber },
                { label: 'Title', value: form.title },
                { label: 'Description', value: form.description },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-4">
                  <span className="text-ink-muted text-sm w-24 flex-shrink-0">{label}</span>
                  <span className="text-ink text-sm flex-1">{value}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(2)} className="btn-secondary flex-1">Back</button>
              <button type="submit" disabled={loading} className="btn-primary flex-1">
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</>
                ) : (
                  <><PlusCircleIcon className="w-4 h-4" />Submit Complaint</>
                )}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
