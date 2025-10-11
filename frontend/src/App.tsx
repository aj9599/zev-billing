import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Users from './components/Users';
import Buildings from './components/Buildings';
import Meters from './components/Meters';
import Chargers from './components/Chargers';
import Billing from './components/Billing';
import PricingSettings from './components/PricingSettings';
import Settings from './components/Settings';
import AdminLogs from './components/AdminLogs';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    !!localStorage.getItem('token')
  );

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, []);

  if (!isAuthenticated) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login onLogin={() => setIsAuthenticated(true)} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout onLogout={() => setIsAuthenticated(false)} />}>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<Users />} />
          <Route path="buildings" element={<Buildings />} />
          <Route path="meters" element={<Meters />} />
          <Route path="chargers" element={<Chargers />} />
          <Route path="billing" element={<Billing />} />
          <Route path="pricing" element={<PricingSettings />} />
          <Route path="settings" element={<Settings />} />
          <Route path="logs" element={<AdminLogs />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;