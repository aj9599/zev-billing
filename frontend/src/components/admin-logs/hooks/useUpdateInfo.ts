import { useState, useEffect } from 'react';
import { api } from '../../../api/client';
import type { UpdateInfo } from '../types';

export const useUpdateInfo = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [showUpdateCard, setShowUpdateCard] = useState(true);

  // Auto-hide update card after 5 seconds if system is up to date
  useEffect(() => {
    if (updateInfo) {
      setShowUpdateCard(true);
      
      if (!updateInfo.updates_available) {
        const timer = setTimeout(() => {
          setShowUpdateCard(false);
        }, 5000);
        
        return () => clearTimeout(timer);
      }
    }
  }, [updateInfo]);

  const checkForUpdates = async () => {
    setCheckingUpdates(true);
    setShowUpdateCard(true);
    try {
      const data = await api.checkForUpdates();
      setUpdateInfo(data);
    } catch (err) {
      console.error('Failed to check for updates:', err);
    } finally {
      setCheckingUpdates(false);
    }
  };

  return {
    updateInfo,
    checkingUpdates,
    showUpdateCard,
    setShowUpdateCard,
    checkForUpdates
  };
};