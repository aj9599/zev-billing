import { useState, useCallback } from 'react';
import { api } from '../../../api/client';
import type { Meter } from '../../../types';
import { useTranslation } from '../../../i18n';

interface DeletionImpact {
    meter_id: number;
    meter_name: string;
    readings_count: number;
    oldest_reading: string;
    newest_reading: string;
    has_data: boolean;
}

export function useMeterDeletion(loadData: () => void, fetchConnectionStatus: () => void) {
    const { t } = useTranslation();
    const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
    const [meterToDelete, setMeterToDelete] = useState<Meter | null>(null);
    const [deletionImpact, setDeletionImpact] = useState<DeletionImpact | null>(null);
    const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
    const [deleteUnderstandChecked, setDeleteUnderstandChecked] = useState(false);
    const [captchaValid, setCaptchaValid] = useState(false);

    const handleDeleteClick = async (meter: Meter) => {
        setMeterToDelete(meter);
        setDeleteConfirmationText('');
        setDeleteUnderstandChecked(false);
        setCaptchaValid(false);

        try {
            const impact = await api.getMeterDeletionImpact(meter.id);
            setDeletionImpact(impact);
            setShowDeleteConfirmation(true);
        } catch (err) {
            console.error('Failed to get deletion impact:', err);
            setDeletionImpact({
                meter_id: meter.id,
                meter_name: meter.name,
                readings_count: 0,
                oldest_reading: '',
                newest_reading: '',
                has_data: false
            });
            setShowDeleteConfirmation(true);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!meterToDelete || !deletionImpact) return;

        if (deleteConfirmationText !== deletionImpact.meter_name) {
            alert(t('meters.deleteNameMismatch') || 'The meter name does not match. Please type it exactly as shown.');
            return;
        }

        if (!deleteUnderstandChecked) {
            alert(t('meters.deleteCheckRequired') || 'Please check the confirmation box to proceed.');
            return;
        }

        if (!captchaValid) {
            alert(t('meters.captchaRequired') || 'Please solve the security challenge to proceed.');
            return;
        }

        try {
            await api.deleteMeter(meterToDelete.id);
            setShowDeleteConfirmation(false);
            setMeterToDelete(null);
            setDeletionImpact(null);
            setDeleteConfirmationText('');
            setDeleteUnderstandChecked(false);
            setCaptchaValid(false);
            loadData();
            fetchConnectionStatus();
        } catch (err) {
            alert(t('meters.deleteFailed'));
        }
    };

    const handleDeleteCancel = useCallback(() => {
        setShowDeleteConfirmation(false);
        setMeterToDelete(null);
        setDeletionImpact(null);
        setDeleteConfirmationText('');
        setDeleteUnderstandChecked(false);
        setCaptchaValid(false);
    }, []);

    return {
        showDeleteConfirmation,
        meterToDelete,
        deletionImpact,
        deleteConfirmationText,
        deleteUnderstandChecked,
        captchaValid,
        handleDeleteClick,
        handleDeleteConfirm,
        handleDeleteCancel,
        setDeleteConfirmationText,
        setDeleteUnderstandChecked,
        setCaptchaValid
    };
}