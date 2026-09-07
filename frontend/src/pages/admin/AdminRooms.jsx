import React, { useState, useEffect, useCallback } from 'react';
import { roomAPI } from '../../utils/api';
import { LoadingState, EmptyState, Modal } from '../../components/UI';
import toast from 'react-hot-toast';
import { BuildingOfficeIcon, PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';

const statusColors = {
  available: 'bg-green-100 text-green-700',
  occupied: 'bg-blue-100 text-blue-700',
  maintenance: 'bg-amber-100 text-amber-700',
  reserved: 'bg-violet-100 text-violet-700',
};

const defaultForm = { roomNumber: '', floor: 1, capacity: 2, type: 'double', status: 'available', monthlyRent: 3000 };

export default function AdminRooms() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [modal, setModal] = useState(null); // null | 'create' | roomId
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      const { data } = await roomAPI.getAll(params);
      setRooms(data.data);
    } catch {}
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  const openCreate = () => { setForm(defaultForm); setModal('create'); };
  const openEdit = (room) => { setForm({ roomNumber: room.roomNumber, floor: room.floor, capacity: room.capacity, type: room.type, status: room.status, monthlyRent: room.monthlyRent }); setModal(room._id); };

  const handleSave = async () => {
    if (!form.roomNumber.trim()) return toast.error('Room number is required');
    setSaving(true);
    try {
      if (modal === 'create') {
        await roomAPI.create(form);
        toast.success('Room created successfully');
      } else {
        await roomAPI.update(modal, form);
        toast.success('Room updated successfully');
      }
      setModal(null);
      fetchRooms();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save room');
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try {
      await roomAPI.delete(id);
      toast.success('Room deleted');
      setDeleteConfirm(null);
      fetchRooms();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete room');
    }
  };

  const stats = {
    total: rooms.length,
    available: rooms.filter(r => r.status === 'available').length,
    occupied: rooms.filter(r => r.status === 'occupied').length,
    maintenance: rooms.filter(r => r.status === 'maintenance').length,
  };

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Rooms</h1>
          <p className="text-ink-muted mt-1">{rooms.length} rooms total</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <PlusIcon className="w-4 h-4" /> Add Room
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-ink' },
          { label: 'Available', value: stats.available, color: 'text-green-700' },
          { label: 'Occupied', value: stats.occupied, color: 'text-blue-700' },
          { label: 'Under Maintenance', value: stats.maintenance, color: 'text-amber-700' },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className={`font-display text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-ink-muted text-xs mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="card p-4">
        <select className="input w-auto py-2" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Rooms</option>
          <option value="available">Available</option>
          <option value="occupied">Occupied</option>
          <option value="maintenance">Under Maintenance</option>
          <option value="reserved">Reserved</option>
        </select>
      </div>

      {/* Rooms grid */}
      {loading ? <LoadingState /> : rooms.length === 0 ? (
        <div className="card">
          <EmptyState icon={BuildingOfficeIcon} title="No rooms found"
            description="Add rooms to get started"
            action={<button onClick={openCreate} className="btn-primary"><PlusIcon className="w-4 h-4" /> Add Room</button>} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {rooms.map(r => (
            <div key={r._id} className="card p-5 hover:border-surface-hover transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-display font-bold text-ink text-xl">Room {r.roomNumber}</p>
                  <p className="text-ink-muted text-xs">Floor {r.floor} · {r.type}</p>
                </div>
                <span className={`badge ${statusColors[r.status]}`}>{r.status}</span>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-ink-muted">Capacity</span>
                  <span className="text-ink-soft">{r.occupied}/{r.capacity}</span>
                </div>
                <div className="w-full bg-surface rounded-full h-1.5">
                  <div className="bg-brand-600 h-1.5 rounded-full transition-all" style={{ width: `${(r.occupied / r.capacity) * 100}%` }} />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-muted">Monthly Rent</span>
                  <span className="text-ink-soft">₹{r.monthlyRent?.toLocaleString()}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(r)} className="btn-secondary flex-1 py-1.5 text-sm">
                  <PencilIcon className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => setDeleteConfirm(r._id)} className="btn-danger py-1.5 px-3 text-sm">
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal isOpen={!!modal} onClose={() => setModal(null)}
        title={modal === 'create' ? 'Add New Room' : 'Edit Room'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Room Number</label>
              <input className="input" value={form.roomNumber}
                onChange={e => setForm({ ...form, roomNumber: e.target.value })}
                placeholder="e.g. 101" disabled={modal !== 'create'} />
            </div>
            <div>
              <label className="label">Floor</label>
              <input type="number" className="input" min="1" max="20" value={form.floor}
                onChange={e => setForm({ ...form, floor: parseInt(e.target.value) })} />
            </div>
            <div>
              <label className="label">Capacity</label>
              <input type="number" className="input" min="1" max="8" value={form.capacity}
                onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) })} />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="single">Single</option>
                <option value="double">Double</option>
                <option value="triple">Triple</option>
                <option value="dormitory">Dormitory</option>
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="available">Available</option>
                <option value="occupied">Occupied</option>
                <option value="maintenance">Under Maintenance</option>
                <option value="reserved">Reserved</option>
              </select>
            </div>
            <div>
              <label className="label">Monthly Rent (₹)</label>
              <input type="number" className="input" value={form.monthlyRent}
                onChange={e => setForm({ ...form, monthlyRent: parseInt(e.target.value) })} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(null)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              {modal === 'create' ? 'Create Room' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Room" size="sm">
        <div className="space-y-4">
          <p className="text-ink-soft">Are you sure you want to delete this room? This action cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={() => handleDelete(deleteConfirm)} className="btn-danger flex-1">Delete Room</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
