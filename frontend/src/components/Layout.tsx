import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Building, Zap, Car, FileText, Settings, LogOut, Activity, DollarSign } from 'lucide-react';
import { api } from '../api/client';
import { useTranslation } from '../i18n';

interface LayoutProps {
  onLogout: () => void;
}

export default function Layout({ onLogout }: LayoutProps) {
  const location = useLocation();
  const { t, language, setLanguage } = useTranslation();

  const handleLogout = () => {
    api.logout();
    onLogout();
  };

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: t('nav.dashboard') },
    { path: '/users', icon: Users, label: t('nav.users') },
    { path: '/buildings', icon: Building, label: t('nav.buildings') },
    { path: '/meters', icon: Zap, label: t('nav.meters') },
    { path: '/chargers', icon: Car, label: t('nav.chargers') },
    { path: '/billing', icon: FileText, label: t('nav.billing') },
    { path: '/pricing', icon: DollarSign, label: t('nav.pricing') },
    { path: '/logs', icon: Activity, label: t('nav.logs') },
    { path: '/settings', icon: Settings, label: t('nav.settings') },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width: '250px',
        backgroundColor: '#1a1a1a',
        color: 'white',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto'
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

        {/* Language Switcher */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          padding: '8px', 
          backgroundColor: '#2a2a2a',
          borderRadius: '8px',
          marginBottom: '12px'
        }}>
          <button
            onClick={() => setLanguage('en')}
            style={{
              flex: 1,
              padding: '8px',
              backgroundColor: language === 'en' ? '#667eea' : 'transparent',
              color: 'white',
              border: language === 'en' ? '2px solid #667eea' : '1px solid #444',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            EN
          </button>
          <button
            onClick={() => setLanguage('de')}
            style={{
              flex: 1,
              padding: '8px',
              backgroundColor: language === 'de' ? '#667eea' : 'transparent',
              color: 'white',
              border: language === 'de' ? '2px solid #667eea' : '1px solid #444',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            DE
          </button>
        </div>

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
            fontSize: '14px',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <LogOut size={20} />
          <span>{t('nav.logout')}</span>
        </button>
      </aside>

      <main style={{
        marginLeft: '250px',
        flex: 1,
        padding: '30px',
        backgroundColor: '#f5f5f5',
        minHeight: '100vh'
      }}>
        <Outlet />
      </main>
    </div>
  );
}