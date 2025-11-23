import { FileText, Settings, DollarSign } from 'lucide-react';
import { useTranslation } from '../../../../i18n';

interface ViewSwitcherProps {
  currentView: 'invoices' | 'shared-meters' | 'custom-items';
  onViewChange: (view: 'invoices' | 'shared-meters' | 'custom-items') => void;
}

export default function ViewSwitcher({ currentView, onViewChange }: ViewSwitcherProps) {
  const { t } = useTranslation();

  const views = [
    { id: 'invoices' as const, icon: FileText, label: t('billing.tabs.invoices') },
    { id: 'shared-meters' as const, icon: Settings, label: t('billing.tabs.sharedMeters') },
    { id: 'custom-items' as const, icon: DollarSign, label: t('billing.tabs.customItems') }
  ];

  return (
    <div style={{
      display: 'flex',
      backgroundColor: '#f0f0f0',
      borderRadius: '6px',
      padding: '4px'
    }}>
      {views.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => onViewChange(id)}
          style={{
            padding: '8px 16px',
            backgroundColor: currentView === id ? '#667EEA' : 'transparent',
            color: currentView === id ? 'white' : '#666',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  );
}