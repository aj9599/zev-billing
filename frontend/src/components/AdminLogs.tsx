import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { AdminLog } from '../types';
import { useTranslation } from '../i18n';
import { AdminLogsHeader } from './admin-logs/AdminLogsHeader';
import { UpdateInfoCard } from './admin-logs/UpdateInfoCard';
import { SystemHealthCards } from './admin-logs/SystemHealthCards';
import { DebugInfoCards } from './admin-logs/DebugInfoCards';
import { LogsTable } from './admin-logs/LogsTable';
import { LogsTableMobile } from './admin-logs/LogsTableMobile';
import { UpdateOverlay } from './admin-logs/UpdateOverlay';
import { FactoryResetModal } from './admin-logs/FactoryResetModal';
import { useSystemHealth } from './admin-logs/hooks/useSystemHealth';
import { useUpdateInfo } from './admin-logs/hooks/useUpdateInfo';
import { useSystemActions } from './admin-logs/hooks/useSystemActions';

export default function AdminLogs() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);

  const { systemHealth, debugInfo, loadDebugInfo } = useSystemHealth();
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
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getLogs(200);
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

      <SystemHealthCards systemHealth={systemHealth} />

      <DebugInfoCards debugInfo={debugInfo} />

      <LogsTable logs={logs} loading={loading} />

      <LogsTableMobile logs={logs} loading={loading} />

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
            flex-direction: column;
            align-items: flex-start !important;
          }

          .logs-header {
            flex-direction: column !important;
            align-items: stretch !important;
          }

          .logs-actions {
            width: 100%;
            flex-direction: column !important;
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