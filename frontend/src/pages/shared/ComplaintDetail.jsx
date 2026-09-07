import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { complaintAPI, studentAPI, maintenanceAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge, PriorityBadge, CategoryBadge, LoadingState, Modal } from '../../components/UI';
import SLAStatus from '../../components/SLAStatus';
import ComplaintTimeline from '../../components/ComplaintTimeline';
import toast from 'react-hot-toast';
import {
  ArrowLeftIcon, UserIcon, CalendarIcon, HomeIcon,
  ClockIcon, CheckCircleIcon, WrenchScrewdriverIcon, ArrowTrendingUpIcon
} from '@heroicons/react/24/outline';

export default function ComplaintDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [complaint, setComplaint] = useState(null);
  const [maintenance, setMaintenance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assignModal, setAssignModal] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [assignData, setAssignData] = useState({ assignedTo: '', adminNotes: '', priority: '' });
  const [noteText, setNoteText] = useState('');
  const [updating, setUpdating] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadComplaint(); }, [id]);

  const loadComplaint = async () => {
    setLoading(true);
    try {
      const { data } = await complaintAPI.getOne(id);
      setComplaint(data.data);
      setMaintenance(data.data.maintenance);
    } catch { toast.error('Failed to load complaint'); }
    setLoading(false);
  };

  const loadStaff = async () => {
    try {
      const { data } = await studentAPI.getMaintenanceStaff();
      setStaffList(data.data);
    } catch {}
  };

  const handleOpenAssign = async () => {
    await loadStaff();
    setAssignData({
      assignedTo: complaint.assignedTo?._id || '',
      adminNotes: complaint.adminNotes || '',
      priority: complaint.priority
    });
    setAssignModal(true);
  };

  const handleAssign = async () => {
    setUpdating(true);
    try {
      await complaintAPI.update(id, assignData);
      toast.success('Complaint updated successfully');
      setAssignModal(false);
      loadComplaint();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    }
    setUpdating(false);
  };

  const handleStatusUpdate = async (status) => {
    setUpdating(true);
    try {
      await complaintAPI.update(id, { status });
      toast.success(`Status updated to ${status}`);
      loadComplaint();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    }
    setUpdating(false);
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setUpdating(true);
    try {
      await maintenanceAPI.updateTask(maintenance._id, { note: noteText, status: maintenance.status });
      toast.success('Note added');
      setNoteText('');
      loadComplaint();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add note');
    }
    setUpdating(false);
  };

  const handleMarkComplete = async () => {
    setUpdating(true);
    try {
      await maintenanceAPI.updateTask(maintenance._id, { status: 'completed', note: 'Task completed' });
      toast.success('Marked as completed!');
      loadComplaint();
    } catch (err) {
      toast.error('Failed to update');
    }
    setUpdating(false);
  };

  const goBack = () => {
    if (user.role === 'admin') navigate('/admin/complaints');
    else if (user.role === 'maintenance') navigate('/maintenance');
    else navigate('/student/complaints');
  };

  if (loading) return <LoadingState message="Loading complaint details..." />;
  if (!complaint) return <div className="text-center text-ink-muted py-20">Complaint not found</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={goBack} className="p-2 text-ink-muted hover:text-ink hover:bg-surface-hover rounded-xl transition-colors mt-0.5">
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <CategoryBadge category={complaint.category} />
            <PriorityBadge priority={complaint.priority} />
            <StatusBadge status={complaint.status} />
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">{complaint.title}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Description */}
          <div className="card p-6">
            <h2 className="font-display font-semibold text-ink mb-3">Description</h2>
            <p className="text-ink-soft leading-relaxed">{complaint.description}</p>
            {complaint.adminNotes && (
              <div className="mt-4 p-3 bg-brand-50 border border-brand-100 rounded-xl">
                <p className="text-xs text-brand-700 font-medium mb-1">Admin Notes</p>
                <p className="text-ink-soft text-sm">{complaint.adminNotes}</p>
              </div>
            )}
          </div>

          {/* Maintenance notes */}
          {maintenance?.notes?.length > 0 && (
            <div className="card p-6">
              <h2 className="font-display font-semibold text-ink mb-4">Progress Notes</h2>
              <div className="space-y-3">
                {maintenance.notes.map((note, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-surface-hover border border-surface-border flex items-center justify-center text-xs text-ink-muted flex-shrink-0 mt-0.5">
                      {note.addedBy?.name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 bg-surface p-3 rounded-xl border border-surface-border">
                      <p className="text-ink-soft text-sm">{note.text}</p>
                      <p className="text-ink-muted text-xs mt-1">{new Date(note.addedAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add note (maintenance staff) */}
          {user.role === 'maintenance' && maintenance && complaint.status !== 'resolved' && (
            <div className="card p-6">
              <h2 className="font-display font-semibold text-ink mb-4">Add Progress Note</h2>
              <textarea className="input resize-none min-h-24" placeholder="Describe what work was done..."
                value={noteText} onChange={e => setNoteText(e.target.value)} />
              <div className="flex gap-3 mt-3">
                <button onClick={handleAddNote} disabled={updating || !noteText.trim()} className="btn-primary">
                  {updating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                  Add Note
                </button>
                <button onClick={handleMarkComplete} disabled={updating} className="btn-secondary">
                  <CheckCircleIcon className="w-4 h-4" /> Mark Complete
                </button>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="card p-6">
            <h2 className="font-display font-semibold text-ink mb-4">Timeline</h2>
            <ComplaintTimeline complaint={complaint} assignedAt={maintenance?.createdAt} />
          </div>
        </div>

        {/* Sidebar info */}
        <div className="space-y-5">
          {/* SLA */}
          <div className="card p-5 space-y-4">
            <h2 className="font-display font-semibold text-ink">SLA</h2>
            <SLAStatus
              slaDeadline={complaint.slaDeadline}
              status={complaint.status}
              resolvedAt={complaint.resolvedAt}
            />
            {complaint.isEscalated && (
              <div className="pt-3 border-t border-surface-border">
                <p className="text-xs text-ink-muted">Escalation</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="badge bg-red-50 text-red-700 border border-red-200">
                    <ArrowTrendingUpIcon className="w-3.5 h-3.5" />
                    Escalated
                  </span>
                  <span className="text-sm text-ink-soft">
                    Level {complaint.escalationLevel || 1}
                    {complaint.currentAuthorityRole ? ` · ${complaint.currentAuthorityRole.charAt(0).toUpperCase() + complaint.currentAuthorityRole.slice(1)}` : ''}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="card p-5 space-y-4">
            <h2 className="font-display font-semibold text-ink">Details</h2>
            {[
              { icon: HomeIcon, label: 'Room', value: complaint.roomNumber },
              { icon: CalendarIcon, label: 'Submitted', value: new Date(complaint.createdAt).toLocaleDateString() },
              { icon: UserIcon, label: 'Student', value: complaint.studentId?.name || 'N/A' },
              { icon: WrenchScrewdriverIcon, label: 'Assigned To', value: complaint.assignedTo?.name || 'Unassigned' },
              { icon: ClockIcon, label: 'Last Updated', value: new Date(complaint.updatedAt).toLocaleDateString() },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-surface-hover rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-ink-muted" />
                </div>
                <div>
                  <p className="text-xs text-ink-muted">{label}</p>
                  <p className="text-sm text-ink">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Admin actions */}
          {user.role === 'admin' && (
            <div className="card p-5 space-y-3">
              <h2 className="font-display font-semibold text-ink">Admin Actions</h2>
              <button onClick={handleOpenAssign} className="btn-primary w-full">
                <WrenchScrewdriverIcon className="w-4 h-4" />
                {complaint.assignedTo ? 'Reassign / Edit' : 'Assign to Staff'}
              </button>
              {complaint.status !== 'resolved' && (
                <button onClick={() => handleStatusUpdate('resolved')} disabled={updating}
                  className="btn-secondary w-full text-green-700">
                  <CheckCircleIcon className="w-4 h-4" /> Mark Resolved
                </button>
              )}
              {complaint.status !== 'rejected' && complaint.status !== 'resolved' && (
                <button onClick={() => handleStatusUpdate('rejected')} disabled={updating}
                  className="btn-danger w-full">Reject Complaint</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Assign Modal */}
      <Modal isOpen={assignModal} onClose={() => setAssignModal(false)} title="Assign Complaint" size="md">
        <div className="space-y-4">
          <div>
            <label className="label">Assign to Staff</label>
            <select className="input" value={assignData.assignedTo}
              onChange={e => setAssignData({ ...assignData, assignedTo: e.target.value })}>
              <option value="">-- Unassigned --</option>
              {staffList.map(s => <option key={s._id} value={s._id}>{s.name} ({s.email})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="input" value={assignData.priority}
              onChange={e => setAssignData({ ...assignData, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className="label">Admin Notes (optional)</label>
            <textarea className="input resize-none min-h-20" placeholder="Add notes for the maintenance staff..."
              value={assignData.adminNotes}
              onChange={e => setAssignData({ ...assignData, adminNotes: e.target.value })} />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setAssignModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleAssign} disabled={updating} className="btn-primary flex-1">
              {updating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              Save Changes
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
