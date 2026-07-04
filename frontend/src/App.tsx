import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider, RequireRole } from './hooks/useAuth';
import { UserRole } from '@production-ops/shared';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import VendorPage from './pages/VendorPage';
import SettingsPage from './pages/SettingsPage';
import ReportsPage from './pages/ReportsPage';
import TemplatesPage from './pages/TemplatesPage';
import WorkflowsPage from './pages/WorkflowsPage';

function OrderDetailWrapper() {
  const { id } = useParams();
  if (!id) return null;
  return <OrderDetailPage orderId={id} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:id" element={<OrderDetailWrapper />} />
          <Route path="master/factories" element={<VendorPage endpoint="factories" />} />
          <Route path="master/printing" element={<VendorPage endpoint="printing-places" />} />
          <Route path="master/fabric" element={<VendorPage endpoint="fabric-suppliers" />} />
          <Route path="workflows" element={<WorkflowsPage />} />
          <Route
            path="settings"
            element={
              <RequireRole roles={[UserRole.ADMIN]}>
                <SettingsPage />
              </RequireRole>
            }
          />
          <Route path="reports" element={<ReportsPage />} />
          <Route
            path="templates"
            element={
              <RequireRole roles={[UserRole.ADMIN]}>
                <TemplatesPage />
              </RequireRole>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
