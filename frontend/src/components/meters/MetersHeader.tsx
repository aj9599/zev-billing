import { Plus, HelpCircle, Download, Zap, Archive } from 'lucide-react';
import { useTranslation } from '../../i18n';

interface MetersHeaderProps {
    onAddMeter: () => void;
    onShowInstructions: () => void;
    onShowExport: () => void;
    showArchived: boolean;
    onToggleArchived: (show: boolean) => void;
    isMobile: boolean;
}

export default function MetersHeader({
    onAddMeter,
    onShowInstructions,
    onShowExport,
    showArchived,
    onToggleArchived,
    isMobile
}: MetersHeaderProps) {
    const { t } = useTranslation();

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: isMobile ? '20px' : '28px',
            gap: '15px',
            flexWrap: 'wrap'
        }}>
            <div>
                <h1 style={{
                    fontSize: isMobile ? '24px' : '32px',
                    fontWeight: '800',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: isMobile ? '8px' : '12px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                }}>
                    <Zap size={isMobile ? 24 : 32} style={{ color: '#667eea' }} />
                    {t('meters.title')}
                </h1>
                <p style={{ color: '#6b7280', fontSize: isMobile ? '13px' : '15px', margin: 0 }}>
                    {showArchived ? (t('meters.archivedSubtitle') || t('meters.subtitle')) : t('meters.subtitle')}
                </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                    onClick={() => onToggleArchived(!showArchived)}
                    className="m-btn-secondary"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: isMobile ? '8px 14px' : '8px 16px',
                        backgroundColor: showArchived ? '#6b7280' : 'white',
                        color: showArchived ? 'white' : '#667eea',
                        border: showArchived ? 'none' : '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    <Archive size={16} />
                    {!isMobile && (showArchived ? (t('meters.showActive') || t('users.showActive')) : (t('meters.showArchived') || t('users.showArchive')))}
                </button>

                <button
                    onClick={onShowExport}
                    className="m-btn-secondary"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: isMobile ? '8px 14px' : '8px 16px',
                        backgroundColor: 'white',
                        color: '#10b981',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    <Download size={16} />
                    {!isMobile && t('meters.exportData')}
                </button>

                <button
                    onClick={onShowInstructions}
                    className="m-btn-secondary"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: isMobile ? '8px 14px' : '8px 16px',
                        backgroundColor: 'white',
                        color: '#667eea',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    <HelpCircle size={16} />
                    {!isMobile && t('meters.setupInstructions')}
                </button>

                <button
                    onClick={onAddMeter}
                    className="m-btn-primary"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: isMobile ? '8px 14px' : '8px 16px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
                    }}
                >
                    <Plus size={16} />
                    {isMobile ? '+' : t('meters.addMeter')}
                </button>
            </div>
        </div>
    );
}
