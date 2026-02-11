import type { User } from '../../../../types';
import { useTranslation } from '../../../../i18n';

interface CustomSplitsEditorProps {
  users: User[];
  customSplits: Record<number, number>;
  onChange: (userId: number, value: string) => void;
}

export default function CustomSplitsEditor({
  users,
  customSplits,
  onChange
}: CustomSplitsEditorProps) {
  const { t } = useTranslation();

  const getTotalPercentage = () => {
    return Object.values(customSplits).reduce((sum, val) => sum + val, 0);
  };

  const total = getTotalPercentage();
  const isValid = Math.abs(total - 100) < 0.01;

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      border: '1px solid #e5e7eb',
      padding: '16px',
      marginBottom: '16px'
    }}>
      <h4 style={{
        fontSize: '13px',
        fontWeight: '600',
        marginBottom: '10px',
        color: '#374151',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        {t('sharedMeters.percentagePerApartment')}
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {users.map(user => (
          <div
            key={user.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 12px',
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #f3f4f6'
            }}
          >
            <label style={{
              flex: 1,
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151'
            }}>
              {user.first_name} {user.last_name}
              {user.apartment_unit && (
                <span style={{ color: '#9ca3af', marginLeft: '6px', fontSize: '12px' }}>
                  (Apt {user.apartment_unit})
                </span>
              )}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={customSplits[user.id] || ''}
                onChange={(e) => onChange(user.id, e.target.value)}
                style={{
                  width: '75px',
                  padding: '6px 10px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '13px',
                  textAlign: 'right',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#9ca3af' }}>
                %
              </span>
            </div>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: '10px',
        padding: '10px 12px',
        backgroundColor: isValid ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
        borderRadius: '8px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        border: `1px solid ${isValid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
      }}>
        <span style={{ fontSize: '13px', fontWeight: '600', color: '#1f2937' }}>
          {t('common.total')}:
        </span>
        <span style={{
          fontSize: '14px',
          fontWeight: '700',
          color: isValid ? '#059669' : '#ef4444'
        }}>
          {total.toFixed(2)}%
        </span>
      </div>
      {!isValid && (
        <p style={{
          fontSize: '11px',
          color: '#ef4444',
          marginTop: '6px',
          fontWeight: '500'
        }}>
          {t('sharedMeters.totalMustBe100')}
        </p>
      )}
    </div>
  );
}
