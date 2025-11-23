import { useState } from 'react';
import { Plus, FileText, Search, HelpCircle } from 'lucide-react';
import { useTranslation } from '../i18n';
import { useBillingData } from './billing/hooks/useBillingData';
import BuildingSelector from './billing/components/common/BuildingSelector';
import ViewSwitcher from './billing/components/common/ViewSwitcher';
import InstructionsModal from './billing/components/common/InstructionsModal';
import BillConfiguration from './BillConfiguration';
import SharedMeterConfig from './SharedMeterConfig';
import CustomItems from './CustomItem';
import Bills from './Bills';
import ErrorBoundary from './billing/components/common/ErrorBoundary';

/**
 * Main Billing module component
 * Manages invoices, shared meters, and custom items
 * Wrapped with ErrorBoundary for graceful error handling
 */
export default function Billing() {
  const { t } = useTranslation();
  const { buildings, users, loading, refresh } = useBillingData();
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [currentView, setCurrentView] = useState<'invoices' | 'shared-meters' | 'custom-items'>('invoices');

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <ErrorBoundary fallbackMessage="An error occurred in the billing module. Please refresh the page.">
      <div className="billing-container" style={{ width: '100%', maxWidth: '100%' }}>
        {/* Header */}
        <div className="billing-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px',
          gap: '15px',
          flexWrap: 'wrap'
        }}>
          <div style={{ flex: 1 }}>
            <h1 style={{
              fontSize: '36px',
              fontWeight: '800',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              color: '#1f2937'
            }}>
              <FileText size={36} style={{ color: '#667EEA' }} aria-hidden="true" />
              {t('billing.title')}
            </h1>
            <p style={{ color: '#6b7280', fontSize: '16px' }}>
              {t('billing.subtitle')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <ViewSwitcher currentView={currentView} onViewChange={setCurrentView} />

            <button
              onClick={() => setShowInstructions(true)}
              aria-label="Open setup instructions"
              title="Open setup instructions"
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
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#138496'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#17a2b8'}
            >
              <HelpCircle size={18} aria-hidden="true" />
              {t('billing.setupInstructions')}
            </button>

            <button
              onClick={() => setShowAdvancedConfig(true)}
              aria-label="Create new bill"
              title="Create new bill"
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
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#218838'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#28a745'}
            >
              <Plus size={18} aria-hidden="true" />
              <span className="button-text">{t('billing.createBill')}</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ position: 'relative', maxWidth: '400px' }}>
            <label htmlFor="building-search" style={{ position: 'absolute', left: '-9999px' }}>
              {t('billing.searchBuildings')}
            </label>
            <Search
              size={20}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#6b7280'
              }}
              aria-hidden="true"
            />
            <input
              id="building-search"
              type="text"
              placeholder={t('billing.searchBuildings')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={t('billing.searchBuildings')}
              style={{
                width: '100%',
                padding: '10px 10px 10px 40px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            />
          </div>
        </div>

        {/* Building Selection */}
        <BuildingSelector
          buildings={buildings}
          selectedBuildingId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
          searchQuery={searchQuery}
          currentView={currentView}
        />

        {/* Content Area */}
        {currentView === 'invoices' && (
          <Bills
            selectedBuildingId={selectedBuildingId}
            buildings={buildings}
            users={users}
            onRefresh={refresh}
          />
        )}

        {currentView === 'shared-meters' && (
          <SharedMeterConfig selectedBuildingId={selectedBuildingId} />
        )}

        {currentView === 'custom-items' && (
          <CustomItems onSave={refresh} selectedBuildingId={selectedBuildingId} />
        )}

        {/* Modals */}
        {showInstructions && (
          <InstructionsModal onClose={() => setShowInstructions(false)} />
        )}

        <BillConfiguration
          isOpen={showAdvancedConfig}
          onClose={() => setShowAdvancedConfig(false)}
          onGenerate={() => {
            refresh();
            setShowAdvancedConfig(false);
          }}
        />

        {/* Responsive Styles */}
        <style>{`
          @media (max-width: 768px) {
            .billing-container h1 {
              font-size: 24px !important;
            }
            .billing-container h1 svg {
              width: 24px !important;
              height: 24px !important;
            }
            .billing-header {
              flex-direction: column !important;
              align-items: stretch !important;
            }
            .billing-header > div:last-child {
              width: 100%;
              flex-direction: column;
            }
            .billing-header button {
              width: 100% !important;
              justify-content: center !important;
            }
          }
        `}</style>
      </div>
    </ErrorBoundary>
  );
}