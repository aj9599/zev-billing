import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Building, Zap, Car, FileText, Settings, LogOut, Activity } from 'lucide-react';
import { api } from '../api/client';

interface LayoutProps {
  onLogout: () => void;
}

export default function Layout({ onLogout }: LayoutProps) {
  const location = useLocation();

  const handleLogout = () => {
    api.logout();
    onLogout();
  };

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/users', icon: Users, label: 'Users' },
    { path: '/buildings', icon: Building, label: 'Buildings' },
    { path: '/meters', icon: Zap, label: 'Meters' },
    { path: '/chargers', icon: Car, label: 'Chargers' },
    { path: '/billing', icon: FileText, label: 'Billing' },
    { path: '/pricing', icon: Settings, label: 'Pricing' },
    { path: '/settings', icon: Settings, label: 'Settings' },
    { path: '/logs', icon: Activity, label: 'Logs' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: '250px',
        backgroundColor: '#1a1a1a',
        color: 'white',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '30px' }}>
          ZEV Billing
        </h1>
        
        <nav style={{ flex: 1 }}>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  marginBottom: '4px',
                  borderRadius: '8px',
                  backgroundColor: isActive ? '#333' : 'transparent',
                  color: 'white',
                  textDecoration: 'none',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = '#2a2a2a';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <button
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: 'transparent',
            color: 'white',
            border: '1px solid #333',
            width: '100%',
            fontSize: '14px'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </aside>

      <main style={{
        flex: 1,
        padding: '30px',
        backgroundColor: '#f5f5f5',
        overflow: 'auto'
      }}>
        <Outlet />
      </main>
    </div>
  );
}