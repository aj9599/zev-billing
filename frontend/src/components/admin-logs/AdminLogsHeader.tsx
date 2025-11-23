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
    <div className="logs-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', gap: '15px', flexWrap: 'wrap' }}>
      <div>
        <h1 className="logs-title" style={{ 
          fontSize: '36px', 
          fontWeight: '800', 
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          <Activity size={36} style={{ color: '#667eea' }} />
          {t('logs.title')}
        </h1>
        <p className="logs-subtitle" style={{ 
          color: '#6b7280', 
          fontSize: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
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
      
      <div className="logs-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={onBackup}
          disabled={backing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 20px',
            background: backing ? '#9ca3af' : '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: backing ? 'not-allowed' : 'pointer',
            boxShadow: backing ? 'none' : '0 4px 12px rgba(102, 126, 234, 0.3)',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            if (!backing) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!backing) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
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
            gap: '8px',
            padding: '12px 20px',
            background: restoring ? '#9ca3af' : '#f59e0b',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: restoring ? 'not-allowed' : 'pointer',
            boxShadow: restoring ? 'none' : '0 4px 12px rgba(245, 158, 11, 0.3)',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            if (!restoring) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(245, 158, 11, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!restoring) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.3)';
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
            gap: '8px',
            padding: '12px 20px',
            background: checkingUpdates ? '#9ca3af' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: checkingUpdates ? 'not-allowed' : 'pointer',
            boxShadow: checkingUpdates ? 'none' : '0 4px 12px rgba(16, 185, 129, 0.3)',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            if (!checkingUpdates) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!checkingUpdates) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
            }
          }}
        >
          <RefreshCw size={18} />
          <span className="button-text">{checkingUpdates ? t('logs.checkingUpdates') : t('logs.checkUpdates')}</span>
        </button>

        {updateInfo && (
          <button
            onClick={onUpdate}
            disabled={updating || !updateInfo.updates_available}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              background: updating ? '#9ca3af' : !updateInfo.updates_available ? '#6b7280' : '#ec4899',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: (updating || !updateInfo.updates_available) ? 'not-allowed' : 'pointer',
              boxShadow: (updating || !updateInfo.updates_available) ? 'none' : '0 4px 12px rgba(236, 72, 153, 0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              if (!updating && updateInfo.updates_available) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(236, 72, 153, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (!updating && updateInfo.updates_available) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(236, 72, 153, 0.3)';
              }
            }}
          >
            <RotateCcw size={18} />
            <span className="button-text">
              {updating ? t('logs.updating') : 
               updateInfo.updates_available ? t('logs.applyUpdate') : t('logs.upToDate')}
            </span>
          </button>
        )}

        <button
          onClick={onFactoryReset}
          disabled={factoryResetting}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 20px',
            background: factoryResetting ? '#9ca3af' : 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: factoryResetting ? 'not-allowed' : 'pointer',
            boxShadow: factoryResetting ? 'none' : '0 4px 12px rgba(220, 38, 38, 0.3)',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            if (!factoryResetting) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(220, 38, 38, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!factoryResetting) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.3)';
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
            gap: '8px', 
            padding: '12px 20px',
            background: rebooting ? '#9ca3af' : '#ef4444',
            color: 'white', 
            border: 'none',
            borderRadius: '10px', 
            fontSize: '14px',
            fontWeight: '600',
            cursor: rebooting ? 'not-allowed' : 'pointer',
            boxShadow: rebooting ? 'none' : '0 4px 12px rgba(239, 68, 68, 0.3)',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            if (!rebooting) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!rebooting) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
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