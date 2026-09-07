import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import StudentDashboard from './pages/student/StudentDashboard';
import SubmitComplaint from './pages/student/SubmitComplaint';
import MyComplaints from './pages/student/MyComplaints';
import ComplaintDetail from './pages/shared/ComplaintDetail';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminComplaints from './pages/admin/AdminComplaints';
import AdminStudents from './pages/admin/AdminStudents';
import AdminRooms from './pages/admin/AdminRooms';
import MaintenanceDashboard from './pages/maintenance/MaintenanceDashboard';
import WardenDashboard from './pages/warden/WardenDashboard';
import WardenEscalations from './pages/warden/WardenEscalations';
import WardenEscalationDetail from './pages/warden/WardenEscalationDetail';
import Layout from './components/Layout';

const ProtectedRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-ink-muted text-sm">Loading...</p>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

const RoleRedirect = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.role === 'maintenance') return <Navigate to="/maintenance" replace />;
  if (user.role === 'warden') return <Navigate to="/warden" replace />;
  return <Navigate to="/student" replace />;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<RoleRedirect />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />

    {/* Student routes */}
    <Route path="/student" element={<ProtectedRoute roles={['student']}><Layout /></ProtectedRoute>}>
      <Route index element={<StudentDashboard />} />
      <Route path="submit-complaint" element={<SubmitComplaint />} />
      <Route path="complaints" element={<MyComplaints />} />
      <Route path="complaints/:id" element={<ComplaintDetail />} />
    </Route>

    {/* Admin routes */}
    <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Layout /></ProtectedRoute>}>
      <Route index element={<AdminDashboard />} />
      <Route path="complaints" element={<AdminComplaints />} />
      <Route path="complaints/:id" element={<ComplaintDetail />} />
      <Route path="students" element={<AdminStudents />} />
      <Route path="rooms" element={<AdminRooms />} />
    </Route>

    {/* Maintenance routes */}
    <Route path="/maintenance" element={<ProtectedRoute roles={['maintenance']}><Layout /></ProtectedRoute>}>
      <Route index element={<MaintenanceDashboard />} />
      <Route path="complaints/:id" element={<ComplaintDetail />} />
    </Route>

    {/* Warden routes */}
    <Route path="/warden" element={<ProtectedRoute roles={['warden']}><Layout /></ProtectedRoute>}>
      <Route index element={<WardenDashboard />} />
      <Route path="escalations" element={<WardenEscalations />} />
      <Route path="escalations/:id" element={<WardenEscalationDetail />} />
    </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: '#ffffff', color: '#1c1917', border: '1px solid #e7e1de', boxShadow: '0 4px 12px rgba(74,16,18,0.12)' },
            success: { iconTheme: { primary: '#9b1c1c', secondary: '#fff' } },
            error: { iconTheme: { primary: '#c81212', secondary: '#fff' } },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
