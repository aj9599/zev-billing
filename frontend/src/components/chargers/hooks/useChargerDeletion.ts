import { useState, useCallback } from 'react';
import { api } from '../../../api/client';
import type { Charger } from '../../../types';

export interface DeletionImpact {
  charger_id: number;
  charger_name: string;
  sessions_count: number;
  oldest_session: string;
  newest_session: string;
  has_data: boolean;
}

export const useChargerDeletion = (onDeleteSuccess: () => void) => {
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [chargerToDelete, setChargerToDelete] = useState<Charger | null>(null);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpact | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleteUnderstandChecked, setDeleteUnderstandChecked] = useState(false);
  const [captchaValid, setCaptchaValid] = useState(false);

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteConfirmation(false);
    setChargerToDelete(null);
    setDeletionImpact(null);
    setDeleteConfirmationText('');
    setDeleteUnderstandChecked(false);
    setCaptchaValid(false);
  }, []);

  const handleDeleteClick = async (charger: Charger) => {
    setChargerToDelete(charger);
    setDeleteConfirmationText('');
    setDeleteUnderstandChecked(false);
    setCaptchaValid(false);

    try {
      const response = await fetch(`/api/chargers/${charger.id}/deletion-impact`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const impact = await response.json();
        setDeletionImpact(impact);
      } else {
        setDeletionImpact({
          charger_id: charger.id,
          charger_name: charger.name,
          sessions_count: 0,
          oldest_session: '',
          newest_session: '',
          has_data: false
        });
      }
      setShowDeleteConfirmation(true);
    } catch (err) {
      console.error('Failed to get deletion impact:', err);
      setDeletionImpact({
        charger_id: charger.id,
        charger_name: charger.name,
        sessions_count: 0,
        oldest_session: '',
        newest_session: '',
        has_data: false
      });
      setShowDeleteConfirmation(true);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!chargerToDelete || !deletionImpact) return;

    if (deleteConfirmationText !== deletionImpact.charger_name) {
      alert('The charger name does not match. Please type it exactly as shown.');
      return;
    }

    if (!deleteUnderstandChecked) {
      alert('Please check the confirmation box to proceed.');
      return;
    }

    if (!captchaValid) {
      alert('Please solve the security challenge to proceed.');
      return;
    }

    try {
      await api.deleteCharger(chargerToDelete.id);
      handleDeleteCancel();
      onDeleteSuccess();
    } catch (err) {
      alert('Failed to delete charger. Please try again.');
    }
  };

  return {
    showDeleteConfirmation,
    chargerToDelete,
    deletionImpact,
    deleteConfirmationText,
    deleteUnderstandChecked,
    captchaValid,
    setDeleteConfirmationText,
    setDeleteUnderstandChecked,
    setCaptchaValid,
    handleDeleteClick,
    handleDeleteConfirm,
    handleDeleteCancel
  };
};