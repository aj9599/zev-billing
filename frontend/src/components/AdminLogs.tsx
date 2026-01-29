import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import type { AdminLog } from '../types';
import { useTranslation } from '../i18n';
import { AdminLogsHeader } from './admin-logs/AdminLogsHeader';
import { UpdateInfoCard } from './admin-logs/UpdateInfoCard';
import { SystemHealthCards } from './admin-logs/SystemHealthCards';
import { DebugInfoCards } from './admin-logs/DebugInfoCards';
import { StatisticsCards } from './admin-logs/StatisticsCards';
import { SystemHealthCharts } from './admin-logs/SystemHealthCharts';
import { LogsTable } from './admin-logs/LogsTable';
import { LogsTableMobile } from './admin-logs/LogsTableMobile';
import { UpdateOverlay } from './admin-logs/UpdateOverlay';
import { FactoryResetModal } from './admin-logs/FactoryResetModal';
import { useSystemHealth } from './admin-logs/hooks/useSystemHealth';
import { useUpdateInfo } from './admin-logs/hooks/useUpdateInfo';
import { useSystemActions } from './admin-logs/hooks/useSystemActions';
import { categorizeAction, type LogCategory } from './admin-logs/LogIcon';
import {
  AlertCircle,
  CheckCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  Key,
  Globe,
  FileText,
  Shield,
  Database,
  Info,
  Filter
} from 'lucide-react';

const filterOptions: { key: LogCategory | 'all'; label: string; icon: typeof Info; color: string }[] = [
  { key: 'all',        label: 'All',          icon: Filter,      color: '#374151' },
  { key: 'error',      label: 'Errors',       icon: AlertCircle, color: '#dc3545' },
  { key: 'connection', label: 'Connected',    icon: Wifi,        color: '#10b981' },
  { key: 'disconnect', label: 'Disconnected', icon: WifiOff,     color: '#f59e0b' },
  { key: 'reconnect',  label: 'Reconnects',   icon: RefreshCw,   color: '#f97316' },
  { key: 'auth',       label: 'Auth',         icon: Key,         color: '#8b5cf6' },
  { key: 'dns',        label: 'DNS',          icon: Globe,       color: '#6366f1' },
  { key: 'collection', label: 'Collection',   icon: Database,    color: '#14b8a6' },
  { key: 'billing',    label: 'Billing',      icon: FileText,    color: '#0ea5e9' },
  { key: 'security',   label: 'Security',     icon: Shield,      color: '#ec4899' },
  { key: 'success',    label: 'Success',      icon: CheckCircle, color: '#28a745' },
  { key: 'info',       label: 'Info',         icon: Info,        color: '#6b7280' },
];

export default function AdminLogs() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [logMode, setLogMode] = useState<'recent' | '24h' | 'all'>('recent');
  const [logFilter, setLogFilter] = useState<LogCategory | 'all'>('all');

  // Count logs per category for filter badges
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: logs.length };
    for (const log of logs) {
      const cat = categorizeAction(log.action);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [logs]);

  const { systemHealth, debugInfo, healthHistory, loadDebugInfo } = useSystemHealth();
  const { updateInfo, showUpdateCard, setShowUpdateCard, checkingUpdates, checkForUpdates } = useUpdateInfo();
  const {
    rebooting,
    backing,
    restoring,
    updating,
    factoryResetting,
    showUpdateOverlay,
    updateProgress,
    showFactoryResetModal,
    setShowFactoryResetModal,
    factoryCaptchaValid,
    setFactoryCaptchaValid,
    fileInputRef,
    handleReboot,
    handleBackup,
    handleRestoreClick,
    handleRestoreFile,
    handleUpdate,
    handleFactoryResetClick,
    handleFactoryResetConfirm
  } = useSystemActions(updateInfo, t);

  // Initial load
  useEffect(() => {
    loadLogs();
    loadDebugInfo();
    checkForUpdates();
  }, []);

  // Live refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadLogs();
      loadDebugInfo();
    }, 5000);

    return () => clearInterval(interval);
  }, [logMode]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      let data: AdminLog[];
      if (logMode === '24h') {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        data = await api.getLogs(200, since);
      } else if (logMode === 'all') {
        data = await api.getLogs(10000);
      } else {
        data = await api.getLogs(200);
      }
      setLogs(data);
      setIsLive(true);
    } catch (err) {
      console.error('Failed to load logs:', err);
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-logs-container" style={{ width: '100%', maxWidth: '100%' }}>
      <FactoryResetModal
        show={showFactoryResetModal}
        factoryResetting={factoryResetting}
        factoryCaptchaValid={factoryCaptchaValid}
        onClose={() => {
          setShowFactoryResetModal(false);
          setFactoryCaptchaValid(false);
        }}
        onConfirm={handleFactoryResetConfirm}
        onValidationChange={setFactoryCaptchaValid}
      />

      <UpdateOverlay
        show={showUpdateOverlay}
        progress={updateProgress}
      />

      <AdminLogsHeader
        isLive={isLive}
        backing={backing}
        restoring={restoring}
        checkingUpdates={checkingUpdates}
        updating={updating}
        updateInfo={updateInfo}
        factoryResetting={factoryResetting}
        rebooting={rebooting}
        fileInputRef={fileInputRef}
        onBackup={handleBackup}
        onRestore={handleRestoreClick}
        onRestoreFile={handleRestoreFile}
        onCheckUpdates={checkForUpdates}
        onUpdate={handleUpdate}
        onFactoryReset={handleFactoryResetClick}
        onReboot={handleReboot}
      />

      <UpdateInfoCard
        updateInfo={updateInfo}
        showUpdateCard={showUpdateCard}
        onClose={() => setShowUpdateCard(false)}
      />

      <StatisticsCards />

      <SystemHealthCards systemHealth={systemHealth} />

      <SystemHealthCharts healthHistory={healthHistory} />

      <DebugInfoCards debugInfo={debugInfo} />

      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937', margin: 0 }}>
          {t('logs.activityLog')}
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['recent', '24h', 'all'] as const).map((mode) => {
            const isActive = logMode === mode;
            const labelKeys: Record<string, string> = { recent: 'logs.modeRecent', '24h': 'logs.mode24h', all: 'logs.modeAll' };
            return (
              <button
                key={mode}
                onClick={() => setLogMode(mode)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: isActive ? '#3b82f6' : 'white',
                  color: isActive ? 'white' : '#6b7280',
                  border: isActive ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {t(labelKeys[mode])}
              </button>
            );
          })}
        </div>
      </div>

      {/* Category filter bar */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
        flexWrap: 'wrap',
      }}>
        {filterOptions.map(opt => {
          const count = categoryCounts[opt.key] || 0;
          const isActive = logFilter === opt.key;
          const Icon = opt.icon;
          if (opt.key !== 'all' && count === 0) return null;
          return (
            <button
              key={opt.key}
              onClick={() => setLogFilter(opt.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                border: isActive ? `2px solid ${opt.color}` : '2px solid #e5e7eb',
                borderRadius: '20px',
                backgroundColor: isActive ? opt.color + '14' : 'white',
                color: isActive ? opt.color : '#6b7280',
                fontSize: '13px',
                fontWeight: isActive ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={14} />
              <span>{opt.label}</span>
              <span style={{
                fontSize: '11px',
                backgroundColor: isActive ? opt.color + '22' : '#f3f4f6',
                color: isActive ? opt.color : '#9ca3af',
                padding: '0 5px',
                borderRadius: '10px',
                fontWeight: '600',
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <LogsTable logs={logs} loading={loading} filter={logFilter} />

      <LogsTableMobile logs={logs} loading={loading} filter={logFilter} />

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @keyframes fadeIn {
          from { 
            opacity: 0;
            transform: translateY(-10px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }

        .admin-logs-container {
          width: 100%;
          max-width: 100%;
        }

        @media (max-width: 768px) {
          .admin-logs-container .logs-title {
            font-size: 24px !important;
            gap: 8px !important;
          }

          .admin-logs-container .logs-title svg {
            width: 24px !important;
            height: 24px !important;
          }

          .admin-logs-container .logs-subtitle {
            font-size: 14px !important;
          }

          .logs-header {
            flex-direction: column !important;
            align-items: stretch !important;
          }

          .logs-header-title {
            width: 100% !important;
          }

          .logs-actions {
            width: 100%;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 12px !important;
          }

          .logs-actions button {
            width: 100% !important;
            justify-content: center !important;
          }

          .debug-grid {
            grid-template-columns: 1fr !important;
            gap: 15px !important;
          }

          .debug-card {
            padding: 16px !important;
          }

          .debug-card > div:first-child {
            font-size: 12px !important;
          }

          .debug-card > div:nth-child(2) {
            font-size: 24px !important;
          }

          .debug-card > div:last-child {
            font-size: 11px !important;
          }

          .desktop-table {
            display: none;
          }

          .mobile-cards {
            display: block;
          }

          .button-text {
            display: inline !important;
          }

          .chart-container {
            height: 250px !important;
          }
        }

        @media (min-width: 769px) {
          .mobile-cards {
            display: none;
          }

          .desktop-table {
            display: block;
          }
        }

        @media (max-width: 480px) {
          .admin-logs-container .logs-title {
            font-size: 20px !important;
            gap: 6px !important;
          }

          .admin-logs-container .logs-title svg {
            width: 20px !important;
            height: 20px !important;
          }

          .logs-subtitle {
            font-size: 13px !important;
          }

          .logs-actions {
            grid-template-columns: 1fr !important;
          }

          .logs-actions button {
            padding: 10px 16px !important;
            font-size: 13px !important;
          }

          .debug-card {
            padding: 14px !important;
          }

          .debug-card > div:nth-child(2) {
            font-size: 22px !important;
          }
        }
      `}</style>
    </div>
  );
}