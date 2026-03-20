import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useAppContext } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { lookupsApi } from './services/api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import CostCodes from './pages/CostCodes';
import Allocations from './pages/Allocations';
import AvailableResources from './pages/AvailableResources';
import ConsolidatedAllocations from './pages/ConsolidatedAllocations';
import BulkUpload from './pages/BulkUpload';
import ManageDropdowns from './pages/ManageDropdowns';
import SubmissionHistory from './pages/SubmissionHistory';

function ProtectedRoutes() {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/cost-codes" element={<CostCodes />} />
        <Route path="/allocations" element={<Allocations />} />
        <Route path="/available-resources" element={<AvailableResources />} />
        <Route path="/consolidated-allocations" element={<ConsolidatedAllocations />} />
        <Route path="/bulk-upload" element={<BulkUpload />} />
        <Route path="/manage-dropdowns" element={<ManageDropdowns />} />
        <Route path="/submission-history" element={<SubmissionHistory />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function VersionChecker() {
  const { user } = useAuth();
  const initialVersion = useRef(null);

  useEffect(() => {
    if (!user) return;

    async function checkVersion() {
      try {
        const lookups = await lookupsApi.getAll();
        const versionItem = lookups.find(l => l.category === 'app-version');
        const serverVersion = versionItem?.values?.[0] || '1';

        if (initialVersion.current === null) {
          initialVersion.current = serverVersion;
        } else if (serverVersion !== initialVersion.current) {
          window.location.reload();
        }
      } catch { /* ignore fetch errors */ }
    }

    checkVersion();
    const interval = setInterval(checkVersion, 2 * 60 * 1000); // check every 2 minutes
    return () => clearInterval(interval);
  }, [user]);

  return null;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppProvider>
          <AuthProvider>
            <VersionChecker />
            <AppRoutes />
          </AuthProvider>
        </AppProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
