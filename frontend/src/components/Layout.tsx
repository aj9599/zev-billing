import { Outlet, Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { LayoutDashboard, Users, Building, Zap, Car, FileText, Settings, LogOut, Activity, DollarSign, Menu, X } from 'lucide-react';
import { api } from '../api/client';
import { useTranslation } from '../i18n';

interface LayoutProps {
  onLogout: () => void;
}

export default function Layout({ onLogout }: LayoutProps) {
  const location = useLocation();
  const { t, language, setLanguage } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile Header */}
      <div className="mobile-header" style={{
        display: 'none',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '60px',
        backgroundColor: '#1a1a1a',
        color: 'white',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 1001
      }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold' }}>ZEV Billing</h1>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            padding: '8px'
          }}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Overlay for mobile menu */}
      {mobileMenuOpen && (
        <div
          className="mobile-overlay"
          onClick={closeMobileMenu}
          style={{
            display: 'none',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 999
          }}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`} style={{
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
        overflowY: 'auto',
        zIndex: 1000,
        transition: 'transform 0.3s ease'
      }}>
        <h1 className="desktop-only" style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '30px' }}>
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
                onClick={closeMobileMenu}
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

      <main className="main-content" style={{
        marginLeft: '250px',
        flex: 1,
        padding: '30px',
        backgroundColor: '#f5f5f5',
        minHeight: '100vh'
      }}>
        <Outlet />
      </main>

      <style>{`
        @media (max-width: 768px) {
          .mobile-header {
            display: flex !important;
          }

          .mobile-overlay {
            display: block !important;
          }

          .sidebar {
            transform: translateX(-100%);
            top: 60px;
          }

          .sidebar.mobile-open {
            transform: translateX(0);
          }

          .desktop-only {
            display: none !important;
          }

          .main-content {
            margin-left: 0 !important;
            padding: 80px 15px 15px 15px !important;
          }
        }

        @media (max-width: 480px) {
          .main-content {
            padding: 70px 10px 10px 10px !important;
          }
        }
      `}</style>
    </div>
  );
}