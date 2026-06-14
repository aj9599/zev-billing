import { ArrowUpDown, GripVertical } from 'lucide-react';
import { useTranslation } from '../i18n';
import type { CardSortMode } from '../utils/cardSort';

interface CardSortControlProps {
    value: CardSortMode;
    onChange: (mode: CardSortMode) => void;
    /** Label for the "type" sort option — e.g. "Type" for meters, "Brand" for chargers. */
    typeLabel: string;
    isMobile?: boolean;
}

// A small dropdown to choose the card sort order, shared by the Meters and
// Chargers pages. When "Custom" is selected, a hint reminds the user they can
// drag cards to reorder them.
export default function CardSortControl({ value, onChange, typeLabel, isMobile }: CardSortControlProps) {
    const { t } = useTranslation();

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ArrowUpDown size={15} color="#6b7280" />
                <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 600 }}>{t('sort.label')}</span>
            </div>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value as CardSortMode)}
                style={{
                    padding: isMobile ? '8px 10px' : '7px 10px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: isMobile ? '15px' : '13px',
                    fontWeight: 600,
                    color: '#374151',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    outline: 'none'
                }}
            >
                <option value="custom">{t('sort.custom')}</option>
                <option value="name">{t('sort.name')}</option>
                <option value="type">{typeLabel}</option>
                <option value="created">{t('sort.created')}</option>
            </select>
            {value === 'custom' && (
                <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    color: '#9ca3af'
                }}>
                    <GripVertical size={13} /> {t('sort.dragHint')}
                </span>
            )}
        </div>
    );
}
