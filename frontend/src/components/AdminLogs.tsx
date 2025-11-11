import { useState, useEffect, useRef } from 'react';
import { Activity, AlertCircle, CheckCircle, Info, Power, Cpu, HardDrive, Thermometer, Clock, Database, Upload, RotateCcw, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { AdminLog } from '../types';
import { useTranslation } from '../i18n';
import DeleteCaptcha from '../components/DeleteCaptcha';

interface SystemHealth {
  cpu_usage: number;
  memory_used: number;
  memory_total: number;
  memory_percent: number;
  disk_used: number;
  disk_total: number;
  disk_percent: number;
  temperature: number;
  uptime: string;
}

interface UpdateInfo {
  updates_available: boolean;
  current_commit: string;
  remote_commit: string;
  commit_log: string;
}

export default function AdminLogs() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebooting, setRebooting] = useState(false);
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [factoryResetting, setFactoryResetting] = useState(false);
  const [showUpdateOverlay, setShowUpdateOverlay] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [isLive, setIsLive] = useState(true);
  const [showUpdateCard, setShowUpdateCard] = useState(true);
  const [showFactoryResetModal, setShowFactoryResetModal] = useState(false);
  const [factoryCaptchaValid, setFactoryCaptchaValid] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    }, 5000); // 5 seconds for live monitoring

    return () => clearInterval(interval);
  }, []);

  // Auto-hide update card after 5 seconds if system is up to date
  useEffect(() => {
    if (updateInfo) {
      setShowUpdateCard(true); // Show card when new update info arrives
      
      if (!updateInfo.updates_available) {
        // If system is up to date, hide after 5 seconds
        const timer = setTimeout(() => {
          setShowUpdateCard(false);
        }, 5000);
        
        return () => clearTimeout(timer);
      }
      // If updates are available, keep card visible (no timer)
    }
  }, [updateInfo]);

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

  const loadDebugInfo = async () => {
    try {
      const response = await fetch('/api/debug/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setDebugInfo(data);
      if (data.system_health) {
        setSystemHealth(data.system_health);
      }
    } catch (err) {
      console.error(t('logs.debugInfoFailed'), err);
    }
  };

  const checkForUpdates = async () => {
    setCheckingUpdates(true);
    setShowUpdateCard(true); // Always show card when manually checking
    try {
      const data = await api.checkForUpdates();
      setUpdateInfo(data);
    } catch (err) {
      console.error('Failed to check for updates:', err);
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleReboot = async () => {
    if (!confirm(t('logs.rebootConfirm'))) {
      return;
    }

    setRebooting(true);
    try {
      const response = await fetch('/api/system/reboot', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        alert(t('logs.rebootSuccess'));
        setTimeout(() => {
          window.location.reload();
        }, 5000);
      } else {
        alert(t('logs.rebootFailed'));
        setRebooting(false);
      }
    } catch (err) {
      alert(t('logs.rebootFailed'));
      setRebooting(false);
    }
  };

  const handleBackup = async () => {
    setBacking(true);
    try {
      const result = await api.createBackup();
      alert(t('logs.backupSuccess'));
      
      // Automatically download the backup
      const downloadUrl = api.downloadBackup(result.backup_name);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = result.backup_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert(t('logs.backupFailed'));
      console.error('Backup failed:', err);
    } finally {
      setBacking(false);
    }
  };

  const handleRestoreClick = () => {
    if (confirm(t('logs.restoreConfirm'))) {
      fileInputRef.current?.click();
    }
  };

  const handleRestoreFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.db')) {
      alert(t('logs.invalidBackupFile'));
      return;
    }

    setRestoring(true);
    try {
      await api.restoreBackup(file);
      alert(t('logs.restoreSuccess'));
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (err) {
      alert(t('logs.restoreFailed'));
      console.error('Restore failed:', err);
      setRestoring(false);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpdate = async () => {
    if (!updateInfo?.updates_available) {
      alert(t('logs.noUpdatesAvailable'));
      return;
    }

    if (!confirm(t('logs.updateConfirm'))) {
      return;
    }

    setUpdating(true);
    setShowUpdateOverlay(true);
    setUpdateProgress(0);

    try {
      await api.applyUpdate();
      
      // Animate progress bar over 40 seconds
      const duration = 40000; // 40 seconds
      const steps = 100;
      const interval = duration / steps;
      
      let currentProgress = 0;
      const progressInterval = setInterval(() => {
        currentProgress += 1;
        setUpdateProgress(currentProgress);
        
        if (currentProgress >= 100) {
          clearInterval(progressInterval);
        }
      }, interval);
      
      // Wait 40 seconds for service to restart
      setTimeout(() => {
        window.location.reload();
      }, duration);
    } catch (err) {
      setShowUpdateOverlay(false);
      setUpdating(false);
      alert(t('logs.updateFailed'));
      console.error('Update failed:', err);
    }
  };

  const handleFactoryResetClick = () => {
    setShowFactoryResetModal(true);
    setFactoryCaptchaValid(false);
  };

  const handleFactoryResetConfirm = async () => {
    if (!factoryCaptchaValid) {
      alert(t('logs.factoryResetCaptchaRequired'));
      return;
    }

    setFactoryResetting(true);
    try {
      const result = await api.factoryReset();
      alert(`${t('logs.factoryResetSuccess')} ${result.backup_name}`);
      
      setShowFactoryResetModal(false);
      
      // Wait for service restart
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (err) {
      alert(t('logs.factoryResetFailed'));
      console.error('Factory reset failed:', err);
      setFactoryResetting(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getLogIcon = (action: string) => {
    if (action.toLowerCase().includes('error') || action.toLowerCase().includes('failed')) {
      return <AlertCircle size={16} color="#dc3545" />;
    } else if (action.toLowerCase().includes('success') || action.toLowerCase().includes('collected')) {
      return <CheckCircle size={16} color="#28a745" />;
    }
    return <Info size={16} color="#007bff" />;
  };

  const getLogColor = (action: string) => {
    if (action.toLowerCase().includes('error') || action.toLowerCase().includes('failed')) {
      return '#fef2f2';
    } else if (action.toLowerCase().includes('success') || action.toLowerCase().includes('collected')) {
      return '#f0fdf4';
    }
    return '#fff';
  };

  const getHealthColor = (percent: number) => {
    if (percent >= 90) return '#dc3545';
    if (percent >= 75) return '#ffc107';
    return '#10b981';
  };

  const getTempColor = (temp: number) => {
    if (temp >= 80) return '#dc3545';
    if (temp >= 70) return '#ffc107';
    return '#10b981';
  };

  return (
    <div className="admin-logs-container" style={{ width: '100%', maxWidth: '100%' }}>
      {/* Factory Reset Modal */}
      {showFactoryResetModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '20px',
            padding: '32px',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '24px'
            }}>
              <div style={{
                padding: '12px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Trash2 size={28} color="white" />
              </div>
              <h2 style={{
                fontSize: '24px',
                fontWeight: '700',
                margin: 0,
                color: '#1f2937'
              }}>
                {t('logs.factoryResetTitle')}
              </h2>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: '#fee2e2',
              border: '2px solid #dc2626',
              borderRadius: '12px',
              marginBottom: '24px'
            }}>
              <p style={{
                fontSize: '14px',
                color: '#991b1b',
                marginBottom: '12px',
                fontWeight: '600'
              }}>
                âš ï¸ {t('logs.factoryResetWarning')}
              </p>
              <ul style={{
                fontSize: '13px',
                color: '#7f1d1d',
                marginLeft: '20px',
                marginBottom: 0
              }}>
                <li>{t('logs.factoryResetWarning1')}</li>
                <li>{t('logs.factoryResetWarning2')}</li>
                <li>{t('logs.factoryResetWarning3')}</li>
                <li>{t('logs.factoryResetWarning4')}</li>
              </ul>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: '#dbeafe',
              border: '2px solid #3b82f6',
              borderRadius: '12px',
              marginBottom: '24px'
            }}>
              <p style={{
                fontSize: '13px',
                color: '#1e40af',
                marginBottom: 0,
                fontWeight: '500'
              }}>
                â„¹ï¸ {t('logs.factoryResetInfo')}
              </p>
            </div>

            <DeleteCaptcha onValidationChange={setFactoryCaptchaValid} />

            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
              marginTop: '24px'
            }}>
              <button
                onClick={() => {
                  setShowFactoryResetModal(false);
                  setFactoryCaptchaValid(false);
                }}
                disabled={factoryResetting}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#f3f4f6',
                  color: '#4b5563',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: factoryResetting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {t('logs.cancel')}
              </button>
              <button
                onClick={handleFactoryResetConfirm}
                disabled={factoryResetting || !factoryCaptchaValid}
                style={{
                  padding: '12px 24px',
                  background: (factoryResetting || !factoryCaptchaValid) 
                    ? '#9ca3af' 
                    : 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: (factoryResetting || !factoryCaptchaValid) ? 'not-allowed' : 'pointer',
                  boxShadow: (factoryResetting || !factoryCaptchaValid) ? 'none' : '0 4px 12px rgba(220, 38, 38, 0.3)',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Trash2 size={16} />
                {factoryResetting ? t('logs.factoryResetting') : t('logs.factoryResetConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Overlay */}
      {showUpdateOverlay && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '20px',
            padding: '48px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
            textAlign: 'center'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 24px',
              border: '4px solid #e5e7eb',
              borderTop: '4px solid #667eea',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              marginBottom: '12px',
              color: '#1f2937'
            }}>
              {t('logs.updatingSystem')}
            </h2>
            
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              marginBottom: '32px'
            }}>
              {t('logs.updateInProgress')}
            </p>
            
            <div style={{
              width: '100%',
              height: '12px',
              backgroundColor: '#e5e7eb',
              borderRadius: '6px',
              overflow: 'hidden',
              marginBottom: '16px'
            }}>
              <div style={{
                width: `${updateProgress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                transition: 'width 0.2s ease',
                borderRadius: '6px'
              }}></div>
            </div>
            
            <p style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#667eea'
            }}>
              {updateProgress}%
            </p>
            
            <p style={{
              fontSize: '12px',
              color: '#9ca3af',
              marginTop: '16px'
            }}>
              {t('logs.doNotCloseWindow')}
            </p>
          </div>
        </div>
      )}

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
            onClick={handleBackup}
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
            onClick={handleRestoreClick}
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
            onChange={handleRestoreFile}
            style={{ display: 'none' }}
          />

          <button
            onClick={checkForUpdates}
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
              onClick={handleUpdate}
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
            onClick={handleFactoryResetClick}
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
            onClick={handleReboot}
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

      {/* Update Info Card */}
      {updateInfo && showUpdateCard && (
        <div style={{ 
          marginBottom: '30px',
          backgroundColor: updateInfo.updates_available ? '#fef3c7' : '#d1fae5',
          padding: '20px',
          borderRadius: '12px',
          border: `2px solid ${updateInfo.updates_available ? '#fbbf24' : '#10b981'}`,
          animation: 'fadeIn 0.3s ease-in',
          position: 'relative'
        }}>
          {/* Close button - only show if updates are available */}
          {updateInfo.updates_available && (
            <button
              onClick={() => setShowUpdateCard(false)}
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
              Ã—
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
      )}

      {/* System Health Cards */}
      {systemHealth && (
        <div style={{ marginBottom: '30px', width: '100%' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '16px', color: '#1f2937' }}>
            {t('logs.deviceHealth')}
          </h2>
          <div className="debug-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '20px',
            width: '100%'
          }}>
            <div className="debug-card" style={{
              backgroundColor: 'white', 
              padding: '24px', 
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)', 
              border: `2px solid ${getHealthColor(systemHealth.cpu_usage)}`,
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <Cpu size={24} color={getHealthColor(systemHealth.cpu_usage)} />
                <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>{t('logs.cpuUsage')}</div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: getHealthColor(systemHealth.cpu_usage) }}>
                {systemHealth.cpu_usage.toFixed(1)}%
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                {systemHealth.cpu_usage < 50 ? t('logs.cpuLow') : systemHealth.cpu_usage < 80 ? t('logs.cpuModerate') : t('logs.cpuHigh')}
              </div>
              <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', marginTop: '12px', overflow: 'hidden' }}>
                <div style={{ width: `${systemHealth.cpu_usage}%`, height: '100%', backgroundColor: getHealthColor(systemHealth.cpu_usage), transition: 'width 0.3s ease' }}></div>
              </div>
            </div>

            <div className="debug-card" style={{
              backgroundColor: 'white', 
              padding: '24px', 
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)', 
              border: `2px solid ${getHealthColor(systemHealth.memory_percent)}`,
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <Activity size={24} color={getHealthColor(systemHealth.memory_percent)} />
                <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>{t('logs.memoryUsage')}</div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: getHealthColor(systemHealth.memory_percent) }}>
                {systemHealth.memory_percent.toFixed(1)}%
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                {formatBytes(systemHealth.memory_used)} / {formatBytes(systemHealth.memory_total)}
              </div>
              <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', marginTop: '12px', overflow: 'hidden' }}>
                <div style={{ width: `${systemHealth.memory_percent}%`, height: '100%', backgroundColor: getHealthColor(systemHealth.memory_percent), transition: 'width 0.3s ease' }}></div>
              </div>
            </div>

            <div className="debug-card" style={{
              backgroundColor: 'white', 
              padding: '24px', 
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)', 
              border: `2px solid ${getHealthColor(systemHealth.disk_percent)}`,
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <HardDrive size={24} color={getHealthColor(systemHealth.disk_percent)} />
                <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>{t('logs.diskUsage')}</div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: getHealthColor(systemHealth.disk_percent) }}>
                {systemHealth.disk_percent.toFixed(1)}%
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                {formatBytes(systemHealth.disk_used)} / {formatBytes(systemHealth.disk_total)}
              </div>
              <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', marginTop: '12px', overflow: 'hidden' }}>
                <div style={{ width: `${systemHealth.disk_percent}%`, height: '100%', backgroundColor: getHealthColor(systemHealth.disk_percent), transition: 'width 0.3s ease' }}></div>
              </div>
            </div>

            {systemHealth.temperature > 0 && (
              <div className="debug-card" style={{
                backgroundColor: 'white', 
                padding: '24px', 
                borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)', 
                border: `2px solid ${getTempColor(systemHealth.temperature)}`,
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <Thermometer size={24} color={getTempColor(systemHealth.temperature)} />
                  <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>{t('logs.cpuTemperature')}</div>
                </div>
                <div style={{ fontSize: '28px', fontWeight: '800', color: getTempColor(systemHealth.temperature) }}>
                  {systemHealth.temperature.toFixed(1)}Â°C
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                  {systemHealth.temperature < 70 ? t('logs.tempNormal') : systemHealth.temperature < 80 ? t('logs.tempWarm') : t('logs.tempHot')}
                </div>
              </div>
            )}

            <div className="debug-card" style={{
              backgroundColor: 'white', 
              padding: '24px', 
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)', 
              border: '2px solid #3b82f6',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <Clock size={24} color="#3b82f6" />
                <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>{t('logs.systemUptime')}</div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#3b82f6' }}>
                {systemHealth.uptime}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                {t('logs.sinceLastRestart')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Debug Information Cards */}
      {debugInfo && (
        <div style={{ marginBottom: '30px', width: '100%' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '16px', color: '#1f2937' }}>
            {t('logs.realTimeStatus')}
          </h2>
          <div className="debug-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '20px',
            width: '100%'
          }}>
            <div className="debug-card" style={{
              backgroundColor: 'white', 
              padding: '24px', 
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)', 
              border: '2px solid #10b981',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>{t('logs.dataCollectorStatus')}</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#10b981', marginBottom: '8px' }}>
              â— {t('logs.running')}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {t('logs.collectionInterval')}
              </div>
            </div>

            <div className="debug-card" style={{
              backgroundColor: 'white', 
              padding: '24px', 
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              border: '2px solid #667eea',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>{t('logs.activeMeters')}</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#667eea' }}>
                {debugInfo.active_meters || 0} / {debugInfo.total_meters || 0}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {t('logs.collectingData')}
              </div>
            </div>

            <div className="debug-card" style={{
              backgroundColor: 'white', 
              padding: '24px', 
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              border: '2px solid #764ba2',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>{t('logs.activeChargers')}</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#764ba2' }}>
                {debugInfo.active_chargers || 0} / {debugInfo.total_chargers || 0}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {t('logs.monitoringSessions')}
              </div>
            </div>

            <div className="debug-card" style={{
              backgroundColor: 'white', 
              padding: '24px', 
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              border: '2px solid #f59e0b',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>{t('logs.lastCollection')}</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#f59e0b' }}>
                {debugInfo.last_collection ? new Date(debugInfo.last_collection).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : t('logs.never')}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {t('logs.nextIn').replace('{minutes}', (debugInfo.next_collection_minutes || 15).toString())}
              </div>
            </div>

            {debugInfo.udp_listeners && debugInfo.udp_listeners.length > 0 && (
              <div className="debug-card" style={{
                backgroundColor: 'white', 
                padding: '24px', 
                borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)', 
                border: '2px solid #3b82f6',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>{t('logs.udpListeners')}</div>
                <div style={{ fontSize: '28px', fontWeight: '800', color: '#3b82f6' }}>
                  {debugInfo.udp_listeners.length} {t('logs.udpActive')}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  {t('logs.ports')} {debugInfo.udp_listeners.join(', ')}
                </div>
              </div>
            )}

            <div className="debug-card" style={{
              backgroundColor: 'white', 
              padding: '24px', 
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              border: `2px solid ${debugInfo.recent_errors > 0 ? '#dc3545' : '#10b981'}`,
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>{t('logs.recentErrors')}</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: debugInfo.recent_errors > 0 ? '#dc3545' : '#10b981' }}>
                {debugInfo.recent_errors || 0}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {t('logs.last24Hours')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logs Table - Desktop */}
      <div className="desktop-table" style={{
        backgroundColor: 'white', 
        borderRadius: '16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)', 
        overflow: 'hidden',
        width: '100%'
      }}>
        <div style={{
          padding: '20px', 
          borderBottom: '2px solid #f3f4f6',
          backgroundColor: '#f9fafb', 
          fontWeight: '700',
          fontSize: '18px',
          color: '#1f2937'
        }}>
          {t('logs.activityLog')}
        </div>
        
        <div style={{ maxHeight: '600px', overflow: 'auto', width: '100%' }}>
          <table style={{ width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f9fafb', zIndex: 10 }}>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600', width: '40px' }}></th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('logs.timestamp')}</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('logs.action')}</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('logs.details')}</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('logs.ipAddress')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{
                  borderBottom: '1px solid #f3f4f6',
                  backgroundColor: getLogColor(log.action),
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = getLogColor(log.action)}>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    {getLogIcon(log.action)}
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                    {new Date(log.created_at).toLocaleString('de-CH')}
                  </td>
                  <td style={{ padding: '16px', fontWeight: '600', fontSize: '14px' }}>{log.action}</td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#6b7280', maxWidth: '400px', wordBreak: 'break-word' }}>
                    {log.details || '-'}
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', fontFamily: 'monospace', color: '#6b7280' }}>
                    {log.ip_address || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {logs.length === 0 && !loading && (
          <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>
            {t('logs.noLogs')}
          </div>
        )}

        {loading && (
          <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>
            {t('logs.loadingLogs')}
          </div>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="mobile-cards">
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>
            {t('logs.activityLog')}
          </h3>
        </div>

        {logs.map(log => (
          <div key={log.id} style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            borderLeft: `4px solid ${
              log.action.toLowerCase().includes('error') || log.action.toLowerCase().includes('failed') 
                ? '#dc3545' 
                : log.action.toLowerCase().includes('success') || log.action.toLowerCase().includes('collected')
                ? '#28a745'
                : '#007bff'
            }`
          }}>
            <div style={{ display: 'flex', alignItems: 'start', gap: '12px', marginBottom: '12px' }}>
              <div style={{ marginTop: '2px' }}>
                {getLogIcon(log.action)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px', color: '#1f2937' }}>
                  {log.action}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace', marginBottom: '8px' }}>
                  {new Date(log.created_at).toLocaleString('de-CH')}
                </div>
              </div>
            </div>
            
            {log.details && (
              <div style={{
                fontSize: '13px',
                color: '#4b5563',
                padding: '12px',
                backgroundColor: '#f9fafb',
                borderRadius: '6px',
                marginBottom: '8px',
                wordBreak: 'break-word'
              }}>
                {log.details}
              </div>
            )}
            
            {log.ip_address && (
              <div style={{ fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' }}>
                IP: {log.ip_address}
              </div>
            )}
          </div>
        ))}

        {logs.length === 0 && !loading && (
          <div style={{ 
            backgroundColor: 'white', 
            padding: '40px 20px', 
            textAlign: 'center', 
            color: '#9ca3af',
            borderRadius: '12px'
          }}>
            {t('logs.noLogs')}
          </div>
        )}

        {loading && (
          <div style={{ 
            backgroundColor: 'white', 
            padding: '40px 20px', 
            textAlign: 'center', 
            color: '#9ca3af',
            borderRadius: '12px'
          }}>
            {t('logs.loadingLogs')}
          </div>
        )}
      </div>

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