import { useEffect, useState } from 'react';
import { Users, Building2, Zap, FileText } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { api } from '../../api/client';

interface Statistics {
  total_users: number;
  regular_users: number;
  admin_users: number;
  total_buildings: number;
  total_complexes: number;
  total_meters: number;
  total_chargers: number;
  total_invoices: number;
}

export const StatisticsCards = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Statistics | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadStatistics();
    const interval = setInterval(loadStatistics, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadStatistics = async () => {
    try {
      const [dashboardStats, invoices] = await Promise.all([
        api.getDashboardStats(),
        api.getInvoices()
      ]);
      
      setStats({
        total_users: dashboardStats.total_users,
        regular_users: dashboardStats.regular_users,
        admin_users: dashboardStats.admin_users,
        total_buildings: dashboardStats.total_buildings,
        total_complexes: dashboardStats.total_complexes,
        total_meters: dashboardStats.total_meters,
        total_chargers: dashboardStats.total_chargers,
        total_invoices: invoices.length
      });
    } catch (err) {
      console.error('Failed to load statistics:', err);
    }
  };

  if (!stats) return null;

  const cardStyle = {
    backgroundColor: 'white',
    padding: isMobile ? '16px' : '24px',
    borderRadius: isMobile ? '12px' : '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    transition: 'all 0.3s ease'
  };

  return (
    <div style={{ marginBottom: isMobile ? '20px' : '30px', width: '100%' }}>
      <h2 style={{ 
        fontSize: isMobile ? '18px' : '20px', 
        fontWeight: '700', 
        marginBottom: '12px', 
        color: '#1f2937',
        paddingLeft: '4px'
      }}>
        {t('logs.systemOverview')}
      </h2>
      <div className="debug-grid" style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: isMobile ? '12px' : '20px',
        width: '100%'
      }}>
        <div className="debug-card" style={{
          ...cardStyle,
          border: '2px solid #667eea'
        }}
        onMouseEnter={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(-4px)')}
        onMouseLeave={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(0)')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <Users size={isMobile ? 20 : 24} color="#667eea" />
            <div style={{ fontSize: isMobile ? '13px' : '14px', color: '#6b7280', fontWeight: '500' }}>
              {t('logs.totalUsers')}
            </div>
          </div>
          <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: '800', color: '#667eea' }}>
            {stats.total_users}
          </div>
          <div style={{ fontSize: isMobile ? '11px' : '12px', color: '#6b7280', marginTop: '8px' }}>
            {stats.regular_users} {t('logs.regular')} • {stats.admin_users} {t('logs.admins')}
          </div>
        </div>

        <div className="debug-card" style={{
          ...cardStyle,
          border: '2px solid #10b981'
        }}
        onMouseEnter={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(-4px)')}
        onMouseLeave={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(0)')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <Building2 size={isMobile ? 20 : 24} color="#10b981" />
            <div style={{ fontSize: isMobile ? '13px' : '14px', color: '#6b7280', fontWeight: '500' }}>
              {t('logs.totalBuildings')}
            </div>
          </div>
          <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: '800', color: '#10b981' }}>
            {stats.total_buildings}
          </div>
          <div style={{ fontSize: isMobile ? '11px' : '12px', color: '#6b7280', marginTop: '8px' }}>
            {stats.total_complexes} {t('logs.complexes')}
          </div>
        </div>

        <div className="debug-card" style={{
          ...cardStyle,
          border: '2px solid #f59e0b'
        }}
        onMouseEnter={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(-4px)')}
        onMouseLeave={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(0)')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <Zap size={isMobile ? 20 : 24} color="#f59e0b" />
            <div style={{ fontSize: isMobile ? '13px' : '14px', color: '#6b7280', fontWeight: '500' }}>
              {t('logs.metersAndChargers')}
            </div>
          </div>
          <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: '800', color: '#f59e0b' }}>
            {stats.total_meters + stats.total_chargers}
          </div>
          <div style={{ fontSize: isMobile ? '11px' : '12px', color: '#6b7280', marginTop: '8px' }}>
            {stats.total_meters} {t('logs.meters')} • {stats.total_chargers} {t('logs.chargers')}
          </div>
        </div>

        <div className="debug-card" style={{
          ...cardStyle,
          border: '2px solid #3b82f6'
        }}
        onMouseEnter={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(-4px)')}
        onMouseLeave={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(0)')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <FileText size={isMobile ? 20 : 24} color="#3b82f6" />
            <div style={{ fontSize: isMobile ? '13px' : '14px', color: '#6b7280', fontWeight: '500' }}>
              {t('logs.totalInvoices')}
            </div>
          </div>
          <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: '800', color: '#3b82f6' }}>
            {stats.total_invoices}
          </div>
          <div style={{ fontSize: isMobile ? '11px' : '12px', color: '#6b7280', marginTop: '8px' }}>
            {t('logs.invoicesGenerated')}
          </div>
        </div>
      </div>
    </div>
  );
};