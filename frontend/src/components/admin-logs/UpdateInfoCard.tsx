import { Info } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { UpdateInfo } from './types';

interface UpdateInfoCardProps {
  updateInfo: UpdateInfo | null;
  showUpdateCard: boolean;
  onClose: () => void;
}

export const UpdateInfoCard = ({ updateInfo, showUpdateCard, onClose }: UpdateInfoCardProps) => {
  const { t } = useTranslation();

  if (!updateInfo || !showUpdateCard) return null;

  return (
    <div style={{ 
      marginBottom: '30px',
      backgroundColor: updateInfo.updates_available ? '#fef3c7' : '#d1fae5',
      padding: '20px',
      borderRadius: '12px',
      border: `2px solid ${updateInfo.updates_available ? '#fbbf24' : '#10b981'}`,
      animation: 'fadeIn 0.3s ease-in',
      position: 'relative'
    }}>
      {updateInfo.updates_available && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'none',
            border: 'none',
            fontSize: '20px',
            color: '#9ca3af',
            cursor: 'pointer',
            padding: '4px 8px',
            lineHeight: '1',
            borderRadius: '4px',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)';
            e.currentTarget.style.color = '#4b5563';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#9ca3af';
          }}
          title="Dismiss notification"
        >
          ×
        </button>
      )}
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <Info size={24} color={updateInfo.updates_available ? '#f59e0b' : '#10b981'} />
        <div style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937' }}>
          {updateInfo.updates_available ? t('logs.updatesAvailable') : t('logs.systemUpToDate')}
        </div>
      </div>
      <div style={{ fontSize: '14px', color: '#4b5563' }}>
        <div style={{ marginBottom: '8px' }}>
          <strong>{t('logs.currentVersion')}:</strong> {updateInfo.current_commit}
        </div>
        {updateInfo.updates_available && (
          <>
            <div style={{ marginBottom: '8px' }}>
              <strong>{t('logs.latestVersion')}:</strong> {updateInfo.remote_commit}
            </div>
            {updateInfo.commit_log && (
              <div style={{ 
                marginTop: '12px',
                padding: '12px',
                backgroundColor: 'white',
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '12px',
                whiteSpace: 'pre-wrap',
                maxHeight: '200px',
                overflow: 'auto'
              }}>
                <strong>{t('logs.changeLog')}:</strong>
                <br />
                {updateInfo.commit_log}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};