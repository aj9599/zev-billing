import { memo } from 'react';
import { AlertTriangle } from 'lucide-react';
import DeleteCaptcha from '../DeleteCaptcha';

interface DeletionImpact {
    meter_id: number;
    meter_name: string;
    readings_count: number;
    oldest_reading: string;
    newest_reading: string;
    has_data: boolean;
}

interface DeleteConfirmationModalProps {
    deletionImpact: DeletionImpact | null;
    deleteConfirmationText: string;
    deleteUnderstandChecked: boolean;
    captchaValid: boolean;
    onConfirmationTextChange: (text: string) => void;
    onUnderstandCheckChange: (checked: boolean) => void;
    onCaptchaValidationChange: (isValid: boolean) => void;
    onCancel: () => void;
    onConfirm: () => void;
    t: (key: string) => string;
}

const DeleteConfirmationModal = memo(({
    deletionImpact,
    deleteConfirmationText,
    deleteUnderstandChecked,
    captchaValid,
    onConfirmationTextChange,
    onUnderstandCheckChange,
    onCaptchaValidationChange,
    onCancel,
    onConfirm,
    t
}: DeleteConfirmationModalProps) => {
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2500,
            padding: '20px'
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: '32px',
                maxWidth: '550px',
                width: '100%',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                maxHeight: '90vh',
                overflow: 'auto'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '20px'
                }}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <AlertTriangle size={24} color="#ef4444" />
                    </div>
                    <div>
                        <h2 style={{
                            fontSize: '20px',
                            fontWeight: '700',
                            color: '#1f2937',
                            margin: 0
                        }}>
                            {t('meters.deleteConfirmTitle') || 'Confirm Deletion'}
                        </h2>
                        <p style={{
                            fontSize: '14px',
                            color: '#6b7280',
                            margin: '4px 0 0 0'
                        }}>
                            {t('meters.deleteWarning') || 'This action cannot be undone'}
                        </p>
                    </div>
                </div>

                {deletionImpact && (
                    <div style={{ marginBottom: '24px' }}>
                        <div style={{
                            backgroundColor: '#fef3c7',
                            border: '2px solid #f59e0b',
                            borderRadius: '12px',
                            padding: '16px',
                            marginBottom: '16px'
                        }}>
                            <p style={{
                                fontSize: '14px',
                                fontWeight: '600',
                                color: '#92400e',
                                marginBottom: '12px'
                            }}>
                                {t('meters.deleteImpactTitle') || 'The following will be permanently deleted:'}
                            </p>
                            <ul style={{
                                margin: 0,
                                paddingLeft: '20px',
                                color: '#92400e'
                            }}>
                                <li style={{ marginBottom: '8px' }}>
                                    <strong>{deletionImpact.meter_name}</strong>{' '}
                                    {t('meters.meterWillBeDeleted') || '(Meter configuration)'}
                                </li>
                                {deletionImpact.has_data && (
                                    <li style={{ marginBottom: '8px' }}>
                                        <strong>{deletionImpact.readings_count.toLocaleString()}</strong>{' '}
                                        {t('meters.readingsWillBeDeleted') || 'readings'}
                                        {deletionImpact.oldest_reading && deletionImpact.newest_reading && (
                                            <div style={{
                                                fontSize: '12px',
                                                marginTop: '4px',
                                                color: '#78350f'
                                            }}>
                                                {t('meters.dataRange') || 'Data from'}{' '}
                                                {new Date(deletionImpact.oldest_reading).toLocaleDateString()}{' '}
                                                {t('common.to') || 'to'}{' '}
                                                {new Date(deletionImpact.newest_reading).toLocaleDateString()}
                                            </div>
                                        )}
                                    </li>
                                )}
                            </ul>
                        </div>

                        <div style={{
                            backgroundColor: '#fee2e2',
                            border: '2px solid #ef4444',
                            borderRadius: '12px',
                            padding: '16px',
                            marginBottom: '16px'
                        }}>
                            <p style={{
                                fontSize: '13px',
                                fontWeight: '600',
                                color: '#991b1b',
                                margin: 0
                            }}>
                                ⚠️ {t('meters.dataLossWarning') || 'Warning: All historical data for this meter will be permanently lost. This cannot be recovered.'}
                            </p>
                        </div>

                        <DeleteCaptcha onValidationChange={onCaptchaValidationChange} />

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{
                                display: 'block',
                                marginBottom: '8px',
                                fontWeight: '600',
                                fontSize: '14px',
                                color: '#374151'
                            }}>
                                {t('meters.typeToConfirm') || 'Type the meter name to confirm:'}
                            </label>
                            <div style={{
                                padding: '8px 12px',
                                backgroundColor: '#f3f4f6',
                                borderRadius: '6px',
                                marginBottom: '8px',
                                fontFamily: 'monospace',
                                fontSize: '14px',
                                fontWeight: '600',
                                color: '#1f2937'
                            }}>
                                {deletionImpact.meter_name}
                            </div>
                            <input
                                type="text"
                                value={deleteConfirmationText}
                                onChange={(e) => onConfirmationTextChange(e.target.value)}
                                placeholder={t('meters.typeMeterName') || 'Type meter name here...'}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    border: '2px solid #e5e7eb',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    fontFamily: 'inherit'
                                }}
                            />
                        </div>

                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px',
                            backgroundColor: '#f9fafb',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            marginBottom: '16px'
                        }}>
                            <input
                                type="checkbox"
                                checked={deleteUnderstandChecked}
                                onChange={(e) => onUnderstandCheckChange(e.target.checked)}
                                style={{
                                    width: '20px',
                                    height: '20px',
                                    cursor: 'pointer'
                                }}
                            />
                            <span style={{
                                fontSize: '14px',
                                fontWeight: '500',
                                color: '#374151'
                            }}>
                                {t('meters.understandDataLoss') || 'I understand that this will permanently delete all data and cannot be undone'}
                            </span>
                        </label>
                    </div>
                )}

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            flex: 1,
                            padding: '12px',
                            backgroundColor: '#f3f4f6',
                            color: '#374151',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer'
                        }}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={
                            !deleteUnderstandChecked ||
                            deleteConfirmationText !== deletionImpact?.meter_name ||
                            !captchaValid
                        }
                        style={{
                            flex: 1,
                            padding: '12px',
                            backgroundColor: (
                                !deleteUnderstandChecked ||
                                deleteConfirmationText !== deletionImpact?.meter_name ||
                                !captchaValid
                            ) ? '#fca5a5' : '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: (
                                !deleteUnderstandChecked ||
                                deleteConfirmationText !== deletionImpact?.meter_name ||
                                !captchaValid
                            ) ? 'not-allowed' : 'pointer',
                            opacity: (
                                !deleteUnderstandChecked ||
                                deleteConfirmationText !== deletionImpact?.meter_name ||
                                !captchaValid
                            ) ? 0.6 : 1
                        }}
                    >
                        {t('meters.deletePermanently') || 'Delete Permanently'}
                    </button>
                </div>
            </div>
        </div>
    );
});

DeleteConfirmationModal.displayName = 'DeleteConfirmationModal';

export default DeleteConfirmationModal;