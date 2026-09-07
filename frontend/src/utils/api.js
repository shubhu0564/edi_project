import axios from 'axios';

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}, (error) => Promise.reject(error));

// Handle 401 globally
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// --- Auth ---
export const authAPI = {
  register: (data) => API.post('/auth/register', data),
  login: (data) => API.post('/auth/login', data),
  getMe: () => API.get('/auth/me'),
  updatePassword: (data) => API.put('/auth/update-password', data),
};

// --- Complaints ---
export const complaintAPI = {
  create: (data) => API.post('/complaints', data),
  getAll: (params) => API.get('/complaints', { params }),
  getOne: (id) => API.get(`/complaints/${id}`),
  update: (id, data) => API.put(`/complaints/${id}`, data),
  delete: (id) => API.delete(`/complaints/${id}`),
  getStats: () => API.get('/complaints/stats'),
};

// --- Rooms ---
export const roomAPI = {
  getAll: (params) => API.get('/rooms', { params }),
  getOne: (id) => API.get(`/rooms/${id}`),
  create: (data) => API.post('/rooms', data),
  update: (id, data) => API.put(`/rooms/${id}`, data),
  delete: (id) => API.delete(`/rooms/${id}`),
};

// --- Students ---
export const studentAPI = {
  getAll: (params) => API.get('/students', { params }),
  getOne: (id) => API.get(`/students/${id}`),
  update: (id, data) => API.put(`/students/${id}`, data),
  getMaintenanceStaff: () => API.get('/students/maintenance-staff'),
};

// --- Maintenance ---
export const maintenanceAPI = {
  getMyTasks: (params) => API.get('/maintenance/tasks', { params }),
  updateTask: (id, data) => API.put(`/maintenance/tasks/${id}`, data),
};

// --- Notifications ---
export const notificationAPI = {
  getAll: () => API.get('/notifications'),
  markRead: (id) => API.put(`/notifications/${id}/read`),
};

// --- Warden (escalation management) ---
export const wardenAPI = {
  getEscalations: (params) => API.get('/warden/escalations', { params }),
  getEscalation: (complaintId) => API.get(`/warden/escalations/${complaintId}`),
  acknowledge: (escalationId) => API.patch(`/warden/escalations/${escalationId}/acknowledge`),
  resolve: (escalationId) => API.patch(`/warden/escalations/${escalationId}/resolve`),
};

export default API;
