import { useState, useRef, useCallback } from 'react';
import { api } from '../../../api/client';
import type { UpdateInfo } from '../types';

export const useSystemActions = (updateInfo: UpdateInfo | null, t: any) => {
  const [rebooting, setRebooting] = useState(false);
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [factoryResetting, setFactoryResetting] = useState(false);
  const [showUpdateOverlay, setShowUpdateOverlay] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [showFactoryResetModal, setShowFactoryResetModal] = useState(false);
  const [factoryCaptchaValid, setFactoryCaptchaValid] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

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
    setUpdateMessage(t('logs.updateStarting') || 'Starting update...');
    setUpdateError('');

    try {
      await api.applyUpdate();

      // Poll backend for real status
      pollIntervalRef.current = setInterval(async () => {
        try {
          const status = await api.getUpdateStatus();
          setUpdateProgress(status.progress);
          setUpdateMessage(status.message);

          if (status.phase === 'error') {
            stopPolling();
            setUpdateError(status.error);
            setUpdateProgress(0);
            return;
          }

          if (status.phase === 'done') {
            stopPolling();
            // Server will restart, try to reconnect
            setTimeout(() => {
              window.location.reload();
            }, 3000);
          }
        } catch {
          // Server might have restarted (os.Exit), try to reload
          stopPolling();
          setTimeout(() => {
            window.location.reload();
          }, 5000);
        }
      }, 1500);
    } catch (err) {
      setShowUpdateOverlay(false);
      setUpdating(false);
      alert(t('logs.updateFailed'));
      console.error('Update failed:', err);
    }
  };

  const dismissUpdateError = useCallback(() => {
    setUpdateError('');
    setShowUpdateOverlay(false);
    setUpdating(false);
    stopPolling();
  }, [stopPolling]);

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

      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (err) {
      alert(t('logs.factoryResetFailed'));
      console.error('Factory reset failed:', err);
      setFactoryResetting(false);
    }
  };

  return {
    rebooting,
    backing,
    restoring,
    updating,
    factoryResetting,
    showUpdateOverlay,
    updateProgress,
    updateMessage,
    updateError,
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
    handleFactoryResetConfirm,
    dismissUpdateError
  };
};
