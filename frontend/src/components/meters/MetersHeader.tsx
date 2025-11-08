import { Plus, HelpCircle, Download, Zap, Archive } from 'lucide-react';
import { useTranslation } from '../../i18n';

interface MetersHeaderProps {
    onAddMeter: () => void;
    onShowInstructions: () => void;
    onShowExport: () => void;
    showArchived: boolean;
    onToggleArchived: (show: boolean) => void;
}

export default function MetersHeader({
    onAddMeter,
    onShowInstructions,
    onShowExport,
    showArchived,
    onToggleArchived
}: MetersHeaderProps) {
    const { t } = useTranslation();

    return (
        <div className="meters-header" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '30px',
            gap: '15px',
            flexWrap: 'wrap'
        }}>
            <div>
                <h1 style={{
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
                    <Zap size={36} style={{ color: '#667eea' }} />
                    {t('meters.title')}
                </h1>
                <p style={{ color: '#6b7280', fontSize: '16px' }}>
                    {t('meters.subtitle')}
                </p>
            </div>
            
            <div className="header-actions" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    backgroundColor: 'white',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: '1px solid #e5e7eb'
                }}>
                    <input
                        type="checkbox"
                        checked={showArchived}
                        onChange={(e) => onToggleArchived(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                    />
                    <Archive size={16} />
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>
                        {t('meters.showArchived') || 'Show Archived'}
                    </span>
                </label>

                <button
                    onClick={onShowExport}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    <Download size={18} />
                    <span className="button-text">{t('meters.exportData')}</span>
                </button>

                <button
                    onClick={onShowInstructions}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        backgroundColor: '#17a2b8',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    <HelpCircle size={18} />
                    <span className="button-text">{t('meters.setupInstructions')}</span>
                </button>

                <button
                    onClick={onAddMeter}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    <Plus size={18} />
                    <span className="button-text">{t('meters.addMeter')}</span>
                </button>
            </div>
        </div>
    );
}