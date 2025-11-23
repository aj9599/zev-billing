import { useState, useRef } from 'react';
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
  const [showFactoryResetModal, setShowFactoryResetModal] = useState(false);
  const [factoryCaptchaValid, setFactoryCaptchaValid] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    try {
      await api.applyUpdate();
      
      const duration = 40000;
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
  };
};