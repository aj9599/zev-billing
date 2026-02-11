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
  const [refreshKey, setRefreshKey] = useState(0);
  const [isMobile] = useState(() => window.innerWidth <= 768);

  if (loading) {
    return (
      <div style={{ padding: '40px 20px' }}>
        {/* Header skeleton */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ height: '36px', width: '260px', backgroundColor: '#f3f4f6', borderRadius: '8px', marginBottom: '10px', animation: 'bl-shimmer 1.5s ease-in-out infinite' }} />
          <div style={{ height: '16px', width: '200px', backgroundColor: '#f3f4f6', borderRadius: '6px', animation: 'bl-shimmer 1.5s ease-in-out infinite' }} />
        </div>
        {/* Cards skeleton */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px', marginBottom: '24px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ height: '80px', backgroundColor: '#f3f4f6', borderRadius: '12px', animation: 'bl-shimmer 1.5s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
        {/* Table skeleton */}
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: '60px', backgroundColor: '#f3f4f6', borderRadius: '10px', marginBottom: '10px', animation: 'bl-shimmer 1.5s ease-in-out infinite', animationDelay: `${i * 0.12}s` }} />
        ))}
        <style>{`@keyframes bl-shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
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
          alignItems: isMobile ? 'flex-start' : 'center',
          marginBottom: '24px',
          gap: '15px',
          flexWrap: 'wrap'
        }}>
          <div>
            <h1 style={{
              fontSize: isMobile ? '24px' : '36px',
              fontWeight: '800',
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              <FileText size={isMobile ? 24 : 36} style={{ color: '#667eea' }} aria-hidden="true" />
              {t('billing.title')}
            </h1>
            <p style={{ color: '#6b7280', fontSize: isMobile ? '14px' : '16px', margin: 0 }}>
              {t('billing.subtitle')}
            </p>
          </div>

          <div className="button-group-header" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <ViewSwitcher currentView={currentView} onViewChange={setCurrentView} />

            <button
              className="bl-btn-instructions"
              onClick={() => setShowInstructions(true)}
              aria-label="Open setup instructions"
              title="Open setup instructions"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: isMobile ? '8px 14px' : '10px 18px',
                backgroundColor: 'white',
                color: '#667eea',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <HelpCircle size={18} aria-hidden="true" />
              {t('billing.setupInstructions')}
            </button>

            <button
              className="bl-btn-create"
              onClick={() => setShowAdvancedConfig(true)}
              aria-label="Create new bill"
              title="Create new bill"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: isMobile ? '8px 14px' : '10px 18px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(102, 126, 234, 0.35)'
              }}
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
              size={18}
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9ca3af'
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
                padding: '10px 14px 10px 42px',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                fontSize: '14px',
                transition: 'border-color 0.2s, box-shadow 0.2s',
                outline: 'none',
                backgroundColor: 'white'
              }}
              onFocus={(e) => { e.target.style.borderColor = '#667eea'; e.target.style.boxShadow = '0 0 0 3px rgba(102,126,234,0.1)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
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
            key={refreshKey}
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
            setRefreshKey(prev => prev + 1);
            setShowAdvancedConfig(false);
          }}
        />

        {/* Responsive Styles */}
        <style>{`
          @keyframes bl-fadeSlideIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }

          @keyframes bl-shimmer {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }

          .bl-btn-instructions:hover {
            border-color: #667eea !important;
            color: #764ba2 !important;
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15) !important;
          }

          .bl-btn-create:hover {
            box-shadow: 0 4px 14px rgba(102, 126, 234, 0.45) !important;
            transform: translateY(-1px);
          }

          .billing-container {
            width: 100%;
            box-sizing: border-box;
          }

          .desktop-table,
          .mobile-cards {
            width: 100%;
            box-sizing: border-box;
          }

          @media (max-width: 768px) {
            .desktop-table {
              display: none;
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
            .button-group-header {
              width: 100%;
            }
            .button-group-header button {
              flex: 1;
              justify-content: center;
            }
            .mobile-cards {
              width: 100%;
              display: flex;
              flex-direction: column;
            }
          }

          @media (min-width: 769px) {
            .mobile-cards {
              display: none;
            }
          }
        `}</style>
      </div>
    </ErrorBoundary>
  );
}
