import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import { I18nProvider } from './i18n';
import Layout from './components/Layout';

// Page components are code-split so the initial bundle stays small; each route
// loads its own chunk on demand behind the <Suspense> fallback below.
const Login = lazy(() => import('./components/Login'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const Users = lazy(() => import('./components/Users'));
const Buildings = lazy(() => import('./components/Buildings'));
const Meters = lazy(() => import('./components/Meters'));
const Chargers = lazy(() => import('./components/Chargers'));
const Devices = lazy(() => import('./components/Devices'));
const Billing = lazy(() => import('./components/Billing'));
const AutoBilling = lazy(() => import('./components/AutoBilling'));
const PricingSettings = lazy(() => import('./components/PricingSettings'));
const Settings = lazy(() => import('./components/Settings'));
const EmailSettings = lazy(() => import('./components/EmailSettings'));
const AdminLogs = lazy(() => import('./components/AdminLogs'));
const CSVUpload = lazy(() => import('./components/CSVUpload'));
const License = lazy(() => import('./components/License'));
const TenantPortal = lazy(() => import('./components/TenantPortal'));

// Lightweight fallback shown while a route chunk is being fetched.
function RouteFallback() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      color: '#6c757d',
      fontSize: '15px'
    }}>
      Loading…
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    !!localStorage.getItem('token')
  );

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, []);

  // Tenant self-service portal lives entirely outside the admin auth gate; it
  // manages its own access token ('portal_token').
  if (window.location.pathname.startsWith('/portal')) {
    return (
      <I18nProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/portal" element={<TenantPortal />} />
              <Route path="*" element={<Navigate to="/portal" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </I18nProvider>
    );
  }

  if (!isAuthenticated) {
    return (
      <I18nProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<Login onLogin={() => setIsAuthenticated(true)} />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Layout onLogout={() => setIsAuthenticated(false)} />}>
              <Route index element={<Dashboard />} />
              <Route path="users" element={<Users />} />
              <Route path="buildings" element={<Buildings />} />
              <Route path="meters" element={<Meters />} />
              <Route path="chargers" element={<Chargers />} />
              <Route path="devices" element={<Devices />} />
              <Route path="billing" element={<Billing />} />
              <Route path="auto-billing" element={<AutoBilling />} />
              <Route path="pricing" element={<PricingSettings />} />
              <Route path="settings" element={<Settings />} />
              <Route path="email-settings" element={<EmailSettings />} />
              <Route path="license" element={<License />} />
              <Route path="logs" element={<AdminLogs />} />
              <Route path="csv-upload" element={<CSVUpload />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </I18nProvider>
  );
}

export default App;