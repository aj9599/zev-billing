import { Activity, Database, Upload, RefreshCw, RotateCcw, Trash2, Power } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { UpdateInfo } from './types';

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

  return (
    <div className="logs-header" style={{ marginBottom: '30px' }}>
      <div className="logs-header-title" style={{ marginBottom: '20px' }}>
        <h1 className="logs-title" style={{ 
          fontSize: '36px', 
          fontWeight: '800', 
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#667eea'
        }}>
          <Activity size={36} />
          {t('logs.title')}
        </h1>
        <p className="logs-subtitle" style={{ 
          color: '#6b7280', 
          fontSize: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          margin: 0
        }}>
          {t('logs.subtitle')}
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            backgroundColor: isLive ? '#d1fae5' : '#fee2e2',
            color: isLive ? '#065f46' : '#991b1b',
            borderRadius: '12px',
            fontSize: '12px',
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
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
        width: '100%'
      }}>
        <button
          onClick={onBackup}
          disabled={backing}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 20px',
            backgroundColor: backing ? '#9ca3af' : '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: backing ? 'not-allowed' : 'pointer',
            boxShadow: backing ? 'none' : '0 2px 8px rgba(102, 126, 234, 0.2)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (!backing) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (!backing) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.2)';
            }
          }}
        >
          <Database size={18} />
          <span className="button-text">{backing ? t('logs.creatingBackup') : t('logs.createBackup')}</span>
        </button>

        <button
          onClick={onRestore}
          disabled={restoring}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 20px',
            backgroundColor: restoring ? '#9ca3af' : '#f59e0b',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: restoring ? 'not-allowed' : 'pointer',
            boxShadow: restoring ? 'none' : '0 2px 8px rgba(245, 158, 11, 0.2)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (!restoring) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (!restoring) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(245, 158, 11, 0.2)';
            }
          }}
        >
          <Upload size={18} />
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
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 20px',
            backgroundColor: checkingUpdates ? '#9ca3af' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: checkingUpdates ? 'not-allowed' : 'pointer',
            boxShadow: checkingUpdates ? 'none' : '0 2px 8px rgba(16, 185, 129, 0.2)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (!checkingUpdates) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (!checkingUpdates) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.2)';
            }
          }}
        >
          <RefreshCw size={18} />
          <span className="button-text">{checkingUpdates ? t('logs.checkingUpdates') : t('logs.checkUpdates')}</span>
        </button>

        <button
          onClick={onUpdate}
          disabled={updating || !updateInfo || !updateInfo.updates_available}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 20px',
            backgroundColor: updating ? '#9ca3af' : (!updateInfo || !updateInfo.updates_available) ? '#6b7280' : '#ec4899',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: (updating || !updateInfo || !updateInfo.updates_available) ? 'not-allowed' : 'pointer',
            boxShadow: (updating || !updateInfo || !updateInfo.updates_available) ? 'none' : '0 2px 8px rgba(236, 72, 153, 0.2)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (!updating && updateInfo && updateInfo.updates_available) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(236, 72, 153, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (!updating && updateInfo && updateInfo.updates_available) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(236, 72, 153, 0.2)';
            }
          }}
        >
          <RotateCcw size={18} />
          <span className="button-text">
            {updating ? t('logs.updating') : 
             (!updateInfo || !updateInfo.updates_available) ? t('logs.upToDate') : t('logs.applyUpdate')}
          </span>
        </button>

        <button
          onClick={onFactoryReset}
          disabled={factoryResetting}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 20px',
            backgroundColor: factoryResetting ? '#9ca3af' : '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: factoryResetting ? 'not-allowed' : 'pointer',
            boxShadow: factoryResetting ? 'none' : '0 2px 8px rgba(220, 38, 38, 0.2)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (!factoryResetting) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (!factoryResetting) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(220, 38, 38, 0.2)';
            }
          }}
        >
          <Trash2 size={18} />
          <span className="button-text">{t('logs.factoryReset')}</span>
        </button>

        <button
          onClick={onReboot}
          disabled={rebooting}
          className="reboot-button"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 20px',
            backgroundColor: rebooting ? '#9ca3af' : '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: rebooting ? 'not-allowed' : 'pointer',
            boxShadow: rebooting ? 'none' : '0 2px 8px rgba(239, 68, 68, 0.2)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (!rebooting) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (!rebooting) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(239, 68, 68, 0.2)';
            }
          }}
        >
          <Power size={18} />
          <span className="button-text">{rebooting ? t('logs.rebooting') : t('logs.rebootSystem')}</span>
        </button>
      </div>
    </div>
  );
};