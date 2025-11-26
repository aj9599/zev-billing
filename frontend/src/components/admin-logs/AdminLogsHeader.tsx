import { Activity, Database, Upload, RefreshCw, RotateCcw, Trash2, Power } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { UpdateInfo } from './types';
import { useState, useEffect } from 'react';

interface AdminLogsHeaderProps {
  isLive: boolean;
  backing: boolean;
  restoring: boolean;
  checkingUpdates: boolean;
  updating: boolean;
  updateInfo: UpdateInfo | null;
  factoryResetting: boolean;
  rebooting: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onBackup: () => void;
  onRestore: () => void;
  onRestoreFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onCheckUpdates: () => void;
  onUpdate: () => void;
  onFactoryReset: () => void;
  onReboot: () => void;
}

export const AdminLogsHeader = ({
  isLive,
  backing,
  restoring,
  checkingUpdates,
  updating,
  updateInfo,
  factoryResetting,
  rebooting,
  fileInputRef,
  onBackup,
  onRestore,
  onRestoreFile,
  onCheckUpdates,
  onUpdate,
  onFactoryReset,
  onReboot
}: AdminLogsHeaderProps) => {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const buttonBaseStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isMobile ? '6px' : '8px',
    padding: isMobile ? '10px 14px' : '12px 20px',
    color: 'white',
    border: 'none',
    borderRadius: isMobile ? '8px' : '10px',
    fontSize: isMobile ? '12px' : '14px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap' as const
  };

  return (
    <div className="logs-header" style={{ marginBottom: isMobile ? '20px' : '30px' }}>
      <div className="logs-header-title" style={{ marginBottom: isMobile ? '16px' : '20px' }}>
        <h1 className="logs-title" style={{ 
          fontSize: isMobile ? '24px' : '36px', 
          fontWeight: '800', 
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? '8px' : '12px',
          color: '#667eea'
        }}>
          <Activity size={isMobile ? 24 : 36} />
          {t('logs.title')}
        </h1>
        <p className="logs-subtitle" style={{ 
          color: '#6b7280', 
          fontSize: isMobile ? '13px' : '16px',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          margin: 0
        }}>
          <span>{t('logs.subtitle')}</span>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: isMobile ? '3px 10px' : '4px 12px',
            backgroundColor: isLive ? '#d1fae5' : '#fee2e2',
            color: isLive ? '#065f46' : '#991b1b',
            borderRadius: isMobile ? '10px' : '12px',
            fontSize: isMobile ? '11px' : '12px',
            fontWeight: '600'
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: isLive ? '#10b981' : '#dc3545',
              animation: isLive ? 'pulse 2s infinite' : 'none'
            }}></span>
            {isLive ? 'LIVE' : 'OFFLINE'}
          </span>
        </p>
      </div>
      
      <div className="logs-actions" style={{ 
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: isMobile ? '8px' : '12px',
        width: '100%'
      }}>
        <button
          onClick={onBackup}
          disabled={backing}
          style={{
            ...buttonBaseStyle,
            backgroundColor: backing ? '#9ca3af' : '#667eea',
            cursor: backing ? 'not-allowed' : 'pointer',
            boxShadow: backing ? 'none' : '0 2px 8px rgba(102, 126, 234, 0.2)'
          }}
          onMouseEnter={(e) => {
            if (!backing && !isMobile) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (!backing && !isMobile) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.2)';
            }
          }}
        >
          <Database size={isMobile ? 16 : 18} />
          <span className="button-text">{backing ? t('logs.creatingBackup') : t('logs.createBackup')}</span>
        </button>

        <button
          onClick={onRestore}
          disabled={restoring}
          style={{
            ...buttonBaseStyle,
            backgroundColor: restoring ? '#9ca3af' : '#f59e0b',
            cursor: restoring ? 'not-allowed' : 'pointer',
            boxShadow: restoring ? 'none' : '0 2px 8px rgba(245, 158, 11, 0.2)'
          }}
          onMouseEnter={(e) => {
            if (!restoring && !isMobile) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (!restoring && !isMobile) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(245, 158, 11, 0.2)';
            }
          }}
        >
          <Upload size={isMobile ? 16 : 18} />
          <span className="button-text">{restoring ? t('logs.restoringBackup') : t('logs.restoreBackup')}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".db"
          onChange={onRestoreFile}
          style={{ display: 'none' }}
        />

        <button
          onClick={onCheckUpdates}
          disabled={checkingUpdates}
          style={{
            ...buttonBaseStyle,
            backgroundColor: checkingUpdates ? '#9ca3af' : '#10b981',
            cursor: checkingUpdates ? 'not-allowed' : 'pointer',
            boxShadow: checkingUpdates ? 'none' : '0 2px 8px rgba(16, 185, 129, 0.2)'
          }}
          onMouseEnter={(e) => {
            if (!checkingUpdates && !isMobile) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (!checkingUpdates && !isMobile) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.2)';
            }
          }}
        >
          <RefreshCw size={isMobile ? 16 : 18} />
          <span className="button-text">{checkingUpdates ? t('logs.checkingUpdates') : t('logs.checkUpdates')}</span>
        </button>

        <button
          onClick={onUpdate}
          disabled={updating || !updateInfo || !updateInfo.updates_available}
          style={{
            ...buttonBaseStyle,
            backgroundColor: updating ? '#9ca3af' : (!updateInfo || !updateInfo.updates_available) ? '#6b7280' : '#ec4899',
            cursor: (updating || !updateInfo || !updateInfo.updates_available) ? 'not-allowed' : 'pointer',
            boxShadow: (updating || !updateInfo || !updateInfo.updates_available) ? 'none' : '0 2px 8px rgba(236, 72, 153, 0.2)'
          }}
          onMouseEnter={(e) => {
            if (!updating && updateInfo && updateInfo.updates_available && !isMobile) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(236, 72, 153, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (!updating && updateInfo && updateInfo.updates_available && !isMobile) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(236, 72, 153, 0.2)';
            }
          }}
        >
          <RotateCcw size={isMobile ? 16 : 18} />
          <span className="button-text">
            {updating ? t('logs.updating') : 
             (!updateInfo || !updateInfo.updates_available) ? t('logs.upToDate') : t('logs.applyUpdate')}
          </span>
        </button>

        <button
          onClick={onFactoryReset}
          disabled={factoryResetting}
          style={{
            ...buttonBaseStyle,
            backgroundColor: factoryResetting ? '#9ca3af' : '#dc2626',
            cursor: factoryResetting ? 'not-allowed' : 'pointer',
            boxShadow: factoryResetting ? 'none' : '0 2px 8px rgba(220, 38, 38, 0.2)'
          }}
          onMouseEnter={(e) => {
            if (!factoryResetting && !isMobile) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (!factoryResetting && !isMobile) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(220, 38, 38, 0.2)';
            }
          }}
        >
          <Trash2 size={isMobile ? 16 : 18} />
          <span className="button-text">{t('logs.factoryReset')}</span>
        </button>

        <button
          onClick={onReboot}
          disabled={rebooting}
          className="reboot-button"
          style={{
            ...buttonBaseStyle,
            backgroundColor: rebooting ? '#9ca3af' : '#ef4444',
            cursor: rebooting ? 'not-allowed' : 'pointer',
            boxShadow: rebooting ? 'none' : '0 2px 8px rgba(239, 68, 68, 0.2)'
          }}
          onMouseEnter={(e) => {
            if (!rebooting && !isMobile) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (!rebooting && !isMobile) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(239, 68, 68, 0.2)';
            }
          }}
        >
          <Power size={isMobile ? 16 : 18} />
          <span className="button-text">{rebooting ? t('logs.rebooting') : t('logs.rebootSystem')}</span>
        </button>
      </div>
    </div>
  );
};