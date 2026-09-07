import React, { useState, useEffect, useCallback } from 'react';
import { studentAPI } from '../../utils/api';
import { LoadingState, EmptyState, Modal } from '../../components/UI';
import toast from 'react-hot-toast';
import { UsersIcon, MagnifyingGlassIcon, PencilIcon } from '@heroicons/react/24/outline';

export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editModal, setEditModal] = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [pagination, setPagination] = useState({});
  const [page, setPage] = useState(1);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (search) params.search = search;
      const { data } = await studentAPI.getAll(params);
      setStudents(data.data);
      setPagination({ total: data.total, page: data.page });
    } catch {}
    setLoading(false);
  }, [search, page]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  useEffect(() => { setPage(1); }, [search]);

  const openEdit = (s) => {
    setEditData({
      name: s.name, email: s.email,
      roomNumber: s.profile?.roomNumber || '',
      contact: s.profile?.contact || '',
      course: s.profile?.course || '',
      year: s.profile?.year || 1,
      isActive: s.isActive,
    });
    setEditModal(s._id);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await studentAPI.update(editModal, editData);
      toast.success('Student updated successfully');
      setEditModal(null);
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Students</h1>
          <p className="text-ink-muted mt-1">{pagination.total || 0} registered students</p>
        </div>
      </div>

      {/* Search */}
      <div className="card p-4">
        <div className="relative max-w-sm">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <input className="input pl-9 py-2" placeholder="Search by name or email..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? <LoadingState /> : students.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No students found" description="No students match your search" />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-border">
                    {['Student', 'Room', 'Contact', 'Course', 'Status', 'Actions'].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-ink-muted uppercase tracking-wide px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {students.map(s => (
                    <tr key={s._id} className="hover:bg-surface-hover transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-brand-600/20 border border-brand-600/20 flex items-center justify-center text-brand-700 font-bold text-sm flex-shrink-0">
                            {s.name?.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-ink">{s.name}</p>
                            <p className="text-ink-muted text-xs">{s.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-ink-soft text-sm">{s.profile?.roomNumber || '—'}</td>
                      <td className="px-5 py-4 text-ink-soft text-sm">{s.profile?.contact || '—'}</td>
                      <td className="px-5 py-4 text-ink-soft text-sm">{s.profile?.course ? `${s.profile.course} Y${s.profile.year}` : '—'}</td>
                      <td className="px-5 py-4">
                        <span className={`badge ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-escalation-100 text-escalation-600'}`}>
                          {s.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <button onClick={() => openEdit(s)}
                          className="p-1.5 text-ink-muted hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors">
                          <PencilIcon className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-surface-border">
              {students.map(s => (
                <div key={s._id} className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-600/20 flex items-center justify-center text-brand-700 font-bold flex-shrink-0">
                    {s.name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink">{s.name}</p>
                    <p className="text-ink-muted text-xs">{s.email} · Room {s.profile?.roomNumber || '?'}</p>
                    <span className={`badge text-xs mt-1 ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-escalation-100 text-escalation-600'}`}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <button onClick={() => openEdit(s)} className="p-2 text-ink-muted hover:text-brand-700 rounded-lg transition-colors">
                    <PencilIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Edit Modal */}
      <Modal isOpen={!!editModal} onClose={() => setEditModal(null)} title="Edit Student" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Full Name</label>
              <input className="input" value={editData.name || ''} onChange={e => setEditData({ ...editData, name: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="label">Email</label>
              <input type="email" className="input" value={editData.email || ''} onChange={e => setEditData({ ...editData, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Room Number</label>
              <input className="input" value={editData.roomNumber || ''} onChange={e => setEditData({ ...editData, roomNumber: e.target.value })} />
            </div>
            <div>
              <label className="label">Contact</label>
              <input className="input" value={editData.contact || ''} onChange={e => setEditData({ ...editData, contact: e.target.value })} />
            </div>
            <div>
              <label className="label">Course</label>
              <input className="input" value={editData.course || ''} onChange={e => setEditData({ ...editData, course: e.target.value })} />
            </div>
            <div>
              <label className="label">Year</label>
              <select className="input" value={editData.year || 1} onChange={e => setEditData({ ...editData, year: parseInt(e.target.value) })}>
                {[1,2,3,4,5,6].map(y => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Account Status</label>
              <select className="input" value={editData.isActive ? 'true' : 'false'}
                onChange={e => setEditData({ ...editData, isActive: e.target.value === 'true' })}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setEditModal(null)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={saveEdit} disabled={saving} className="btn-primary flex-1">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              Save Changes
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
