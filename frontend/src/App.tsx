import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { I18nProvider } from './i18n';
import Layout from './components/Layout';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Users from './components/Users';
import Buildings from './components/Buildings';
import Meters from './components/Meters';
import Chargers from './components/Chargers';
import Devices from './components/Devices';
import Billing from './components/Billing';
import AutoBilling from './components/AutoBilling';
import PricingSettings from './components/PricingSettings';
import Settings from './components/Settings';
import EmailSettings from './components/EmailSettings';
import AdminLogs from './components/AdminLogs';
import CSVUpload from './components/CSVUpload';
import License from './components/License';
import TenantPortal from './components/TenantPortal';

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
          <Routes>
            <Route path="/portal" element={<TenantPortal />} />
            <Route path="*" element={<Navigate to="/portal" replace />} />
          </Routes>
        </BrowserRouter>
      </I18nProvider>
    );
  }

  if (!isAuthenticated) {
    return (
      <I18nProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login onLogin={() => setIsAuthenticated(true)} />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider>
      <BrowserRouter>
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
      </BrowserRouter>
    </I18nProvider>
  );
}

export default App;