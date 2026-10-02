import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import QuizApp from '@/pages/QuizApp';
import Admin from '@/pages/Admin';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AdminLayout from '@/components/admin/AdminLayout';
import AdminHome from '@/components/admin/AdminHome';
import ScoresPage from '@/components/admin/ScoresPage';
import CertificatesPage from '@/components/admin/CertificatesPage';
import StudentsPage from '@/components/admin/StudentsPage';
import ExamsPage from '@/components/admin/ExamsPage';

const AuthenticatedApp = () => {
  // Public chemistry quiz — no auth gate required
  return (
    <Routes>
      <Route path="/" element={<QuizApp />} />
      <Route path="/admin" element={<Admin />}>
        <Route element={<AdminLayout />}>
          <Route index element={<AdminHome />} />
          <Route path="scores" element={<ScoresPage />} />
          <Route path="certificates" element={<CertificatesPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="exams" element={<ExamsPage />} />
        </Route>
      </Route>
      <Route path="/login" element={<Navigate to="/admin" replace />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<Navigate to="/admin" replace />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
