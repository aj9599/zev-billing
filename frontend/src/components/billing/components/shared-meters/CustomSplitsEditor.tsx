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
      marginBottom: '20px',
      padding: '16px',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px',
      border: '2px solid #e5e7eb'
    }}>
      <h4 style={{
        fontSize: '15px',
        fontWeight: '600',
        marginBottom: '12px',
        color: '#1f2937'
      }}>
        {t('sharedMeters.percentagePerApartment')}
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {users.map(user => (
          <div
            key={user.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px',
              backgroundColor: 'white',
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}
          >
            <label style={{
              flex: 1,
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151'
            }}>
              {user.first_name} {user.last_name}
              {user.apartment_unit && (
                <span style={{ color: '#6b7280', marginLeft: '6px' }}>
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
                  width: '80px',
                  padding: '6px 10px',
                  border: '2px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  textAlign: 'right'
                }}
              />
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280' }}>
                %
              </span>
            </div>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: '12px',
        padding: '10px',
        backgroundColor: isValid ? '#ecfdf5' : '#fef2f2',
        borderRadius: '6px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        border: `2px solid ${isValid ? '#10b981' : '#ef4444'}`
      }}>
        <span style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>
          {t('common.total')}:
        </span>
        <span style={{
          fontSize: '16px',
          fontWeight: '700',
          color: isValid ? '#10b981' : '#ef4444'
        }}>
          {total.toFixed(2)}%
        </span>
      </div>
      {!isValid && (
        <p style={{
          fontSize: '12px',
          color: '#ef4444',
          marginTop: '8px',
          fontWeight: '500'
        }}>
          {t('sharedMeters.totalMustBe100')}
        </p>
      )}
    </div>
  );
}