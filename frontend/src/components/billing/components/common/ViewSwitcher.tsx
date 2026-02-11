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
      backgroundColor: '#f3f4f6',
      borderRadius: '10px',
      padding: '3px'
    }}>
      {views.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => onViewChange(id)}
          style={{
            padding: '8px 16px',
            background: currentView === id ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent',
            color: currentView === id ? 'white' : '#6b7280',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: currentView === id ? '600' : '500',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: currentView === id ? '0 2px 6px rgba(102, 126, 234, 0.3)' : 'none'
          }}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  );
}
