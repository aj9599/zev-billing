import { useState, useEffect } from 'react';
import { Plus, FileText, Search, Building, HelpCircle, X, Settings, DollarSign } from 'lucide-react';
import { api } from '../api/client';
import type { Building as BuildingType, User } from '../types';
import { useTranslation } from '../i18n';
import BillConfiguration from './BillConfiguration';
import SharedMeterConfig from './SharedMeterConfig';
import CustomItems from './CustomItemModal';
import Bills from './Bills';

export default function Billing() {
  const { t } = useTranslation();
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [currentView, setCurrentView] = useState<'invoices' | 'shared-meters' | 'custom-items'>('invoices');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [buildingsData, usersData] = await Promise.all([
        api.getBuildings(),
        api.getUsers(undefined, true)
      ]);
      setBuildings(buildingsData.filter(b => !b.is_group));
      setUsers(usersData);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  const filteredBuildings = buildings.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const InstructionsModal = () => (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', 
      justifyContent: 'center', zIndex: 2000, padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '30px',
        maxWidth: '700px', maxHeight: '90vh', overflow: 'auto', width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>{t('billing.instructions.title')}</h2>
          <button onClick={() => setShowInstructions(false)} 
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ lineHeight: '1.8', color: '#374151' }}>
          <div style={{ backgroundColor: '#dbeafe', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #3b82f6' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={20} color="#3b82f6" />
              {t('billing.instructions.whatIsBilling')}
            </h3>
            <p>{t('billing.instructions.billingDescription')}</p>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            {t('billing.instructions.howBillingWorks')}
          </h3>
          <ul style={{ marginLeft: '20px' }}>
            <li>{t('billing.instructions.work1')}</li>
            <li>{t('billing.instructions.work2')}</li>
            <li>{t('billing.instructions.work3')}</li>
            <li>{t('billing.instructions.work4')}</li>
          </ul>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            {t('billing.instructions.howToUse')}
          </h3>
          <ul style={{ marginLeft: '20px' }}>
            <li>{t('billing.instructions.step1')}</li>
            <li>{t('billing.instructions.step2')}</li>
            <li>{t('billing.instructions.step3')}</li>
            <li>{t('billing.instructions.step4')}</li>
            <li>{t('billing.instructions.step5')}</li>
            <li>{t('billing.instructions.step6')}</li>
          </ul>

          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '1px solid #f59e0b' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('billing.instructions.important')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('billing.instructions.important1')}</li>
              <li>{t('billing.instructions.important2')}</li>
              <li>{t('billing.instructions.important3')}</li>
              <li>{t('billing.instructions.important4')}</li>
              <li><strong>{t('billing.instructions.important5')}</strong></li>
              <li><strong>{t('billing.instructions.important6')}</strong></li>
            </ul>
          </div>

          <div style={{ backgroundColor: '#f0fdf4', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '1px solid #10b981' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('billing.instructions.invoiceContents')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('billing.instructions.invoice1')}</li>
              <li>{t('billing.instructions.invoice2')}</li>
              <li>{t('billing.instructions.invoice3')}</li>
              <li>{t('billing.instructions.invoice4')}</li>
              <li>{t('billing.instructions.invoice5')}</li>
            </ul>
          </div>

          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '1px solid #f59e0b' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('billing.instructions.tips')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('billing.instructions.tip1')}</li>
              <li>{t('billing.instructions.tip2')}</li>
              <li>{t('billing.instructions.tip3')}</li>
              <li>{t('billing.instructions.tip4')}</li>
              <li>{t('billing.instructions.tip5')}</li>
            </ul>
          </div>
        </div>

        <button onClick={() => setShowInstructions(false)} style={{
          width: '100%', marginTop: '24px', padding: '12px',
          backgroundColor: '#667EEA', color: 'white', border: 'none',
          borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
        }}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="billing-container" style={{ width: '100%', maxWidth: '100%' }}>
      {/* Header with Title and View Switcher */}
      <div className="billing-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', gap: '15px', flexWrap: 'wrap' }}>
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
            <FileText size={36} style={{ color: '#667EEA' }} />
            {t('billing.title')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            {t('billing.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* View Switcher */}
          <div style={{ 
            display: 'flex', 
            backgroundColor: '#f0f0f0', 
            borderRadius: '6px', 
            padding: '4px' 
          }}>
            <button
              onClick={() => setCurrentView('invoices')}
              style={{
                padding: '8px 16px',
                backgroundColor: currentView === 'invoices' ? '#667EEA' : 'transparent',
                color: currentView === 'invoices' ? 'white' : '#666',
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
              <FileText size={14} />
              {t('billing.tabs.invoices')}
            </button>
            <button
              onClick={() => setCurrentView('shared-meters')}
              style={{
                padding: '8px 16px',
                backgroundColor: currentView === 'shared-meters' ? '#667EEA' : 'transparent',
                color: currentView === 'shared-meters' ? 'white' : '#666',
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
              <Settings size={14} />
              {t('billing.tabs.sharedMeters')}
            </button>
            <button
              onClick={() => setCurrentView('custom-items')}
              style={{
                padding: '8px 16px',
                backgroundColor: currentView === 'custom-items' ? '#667EEA' : 'transparent',
                color: currentView === 'custom-items' ? 'white' : '#666',
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
              <DollarSign size={14} />
              {t('billing.tabs.customItems')}
            </button>
          </div>

          {/* Action Buttons */}
          <button
            onClick={() => setShowInstructions(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <HelpCircle size={18} />
            {t('billing.setupInstructions')}
          </button>
          <button
            onClick={() => setShowAdvancedConfig(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <Plus size={18} />
            <span className="button-text">{t('billing.createBill')}</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
          <input
            type="text"
            placeholder={t('billing.searchBuildings')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', 
        gap: '16px', 
        marginBottom: '30px' 
      }}>
        <div
          onClick={() => setSelectedBuildingId(null)}
          style={{
            padding: '20px',
            backgroundColor: selectedBuildingId === null ? '#667EEA' : 'white',
            color: selectedBuildingId === null ? 'white' : '#1f2937',
            borderRadius: '12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: selectedBuildingId === null ? '2px solid #667EEA' : '2px solid transparent'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Building size={24} />
            <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
              {t('billing.allBuildings')}
            </h3>
          </div>
          <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>
            {t('billing.allBuildingsDesc')}
          </p>
        </div>

        {filteredBuildings.map(building => (
          <div
            key={building.id}
            onClick={() => setSelectedBuildingId(building.id)}
            style={{
              padding: '20px',
              backgroundColor: selectedBuildingId === building.id ? '#667EEA' : 'white',
              color: selectedBuildingId === building.id ? 'white' : '#1f2937',
              borderRadius: '12px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              border: selectedBuildingId === building.id ? '2px solid #667EEA' : '2px solid transparent'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <Building size={24} />
              <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
                {building.name}
              </h3>
            </div>
            <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>
              {building.address_street || ''}
            </p>
          </div>
        ))}
      </div>

      {/* Content Area - Renders different views based on currentView */}
      {currentView === 'invoices' && (
        <Bills 
          selectedBuildingId={selectedBuildingId}
          buildings={buildings}
          users={users}
          onRefresh={loadData}
        />
      )}

      {currentView === 'shared-meters' && (
        <SharedMeterConfig 
          selectedBuildingId={selectedBuildingId}
        />
      )}

      {currentView === 'custom-items' && (
        <CustomItems 
          onSave={loadData}
          selectedBuildingId={selectedBuildingId}
        />
      )}

      {/* Instructions Modal */}
      {showInstructions && <InstructionsModal />}

      {/* Advanced Bill Configuration Modal */}
      <BillConfiguration
        isOpen={showAdvancedConfig}
        onClose={() => setShowAdvancedConfig(false)}
        onGenerate={() => {
          loadData();
          setShowAdvancedConfig(false);
        }}
      />

      <style>{`
        @media (max-width: 768px) {
          .billing-container h1 {
            font-size: 24px !important;
          }

          .billing-container h1 svg {
            width: 24px !important;
            height: 24px !important;
          }

          .billing-container p {
            font-size: 14px !important;
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

        @media (max-width: 480px) {
          .billing-container h1 {
            font-size: 20px !important;
          }

          .billing-container h1 svg {
            width: 20px !important;
            height: 20px !important;
          }

          .button-text {
            display: inline !important;
          }
        }
      `}</style>
    </div>
  );
}