import { Outlet, Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { LayoutDashboard, Users, Building, Car, FileText, Settings, LogOut, Activity, DollarSign, Menu, X, Calendar, Zap } from 'lucide-react';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import Logo from './Logo';

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
    { path: '/buildings', icon: Building, label: t('nav.buildings') },
    { path: '/users', icon: Users, label: t('nav.users') },
    { path: '/meters', icon: Zap, label: t('nav.meters') },
    { path: '/chargers', icon: Car, label: t('nav.chargers') },
    { path: '/pricing', icon: DollarSign, label: t('nav.pricing') },
    { path: '/billing', icon: FileText, label: t('nav.billing') },
    { path: '/auto-billing', icon: Calendar, label: t('nav.autoBilling') },
    { path: '/logs', icon: Activity, label: t('nav.logs') },
    { path: '/settings', icon: Settings, label: t('nav.settings') },
  ];

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div className="app-container" style={{ display: 'flex', minHeight: '100vh', position: 'relative' }}>
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
        zIndex: 1001,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Logo size={32} animated={false} />
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>ZEV Billing</h1>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
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
        transition: 'transform 0.3s ease',
        WebkitOverflowScrolling: 'touch'
      }}>
        <div className="desktop-only" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px', 
          marginBottom: '30px' 
        }}>
          <Logo size={40} animated={false} />
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>
            ZEV Billing
          </h1>
        </div>
        
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', marginBottom: '12px' }}>
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
          marginBottom: '12px',
          flexShrink: 0
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
            cursor: 'pointer',
            flexShrink: 0
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
        minHeight: '100vh',
        width: 'calc(100% - 250px)',
        boxSizing: 'border-box'
      }}>
        <Outlet />
      </main>

      <style>{`
        * {
          box-sizing: border-box;
        }

        .app-container {
          overflow-x: hidden;
        }

        /* Tablet and smaller - Switch to mobile layout earlier */
        @media (max-width: 1280px) {
          .mobile-header {
            display: flex !important;
          }

          .mobile-overlay {
            display: block !important;
          }

          .sidebar {
            transform: translateX(-100%) !important;
            top: 60px !important;
            bottom: 0 !important;
            height: calc(100vh - 60px) !important;
            padding: 20px !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
            box-shadow: 2px 0 8px rgba(0,0,0,0.3);
          }

          .sidebar.mobile-open {
            transform: translateX(0) !important;
          }

          .desktop-only {
            display: none !important;
          }

          .main-content {
            margin-left: 0 !important;
            margin-top: 60px !important;
            padding: 20px 15px !important;
            width: 100% !important;
            min-height: calc(100vh - 60px) !important;
          }

          body {
            overflow-x: hidden;
          }
        }

        /* Mobile phones - Further optimizations */
        @media (max-width: 480px) {
          .main-content {
            padding: 15px 10px !important;
          }
          
          .sidebar {
            padding: 15px !important;
          }
        }

        /* Prevent horizontal scroll on all mobile sizes */
        @media (max-width: 1280px) {
          html, body {
            overflow-x: hidden;
            width: 100%;
            position: relative;
          }

          .app-container {
            width: 100%;
            overflow-x: hidden;
          }
        }

        /* Smooth scrolling on iOS */
        .sidebar {
          -webkit-overflow-scrolling: touch;
        }

        /* Prevent body scroll when mobile menu is open */
        body.mobile-menu-open {
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}