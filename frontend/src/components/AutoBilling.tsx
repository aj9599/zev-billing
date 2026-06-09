import { useState } from 'react';
import { Search, Building } from 'lucide-react';
import { useTranslation } from '../i18n';
import { api } from '../api/client';
import { useAutoBillingConfig } from './autobilling/hooks/useAutoBillingConfig';
import AutoBillingHeader from './autobilling/components/AutoBillingHeader';
import AutoBillingConfigCard from './autobilling/components/AutoBillingConfigCard';
import AutoBillingConfigModal from './autobilling/components/AutoBillingConfigModal';
import AutoBillingInstructionsModal from './autobilling/components/AutoBillingInstructionsModal';
import AutoBillingEmptyState from './autobilling/components/AutoBillingEmptyState';
import AutoBillingTestRunModal from './autobilling/components/AutoBillingTestRunModal';
import type { TestRunResult } from './autobilling/components/AutoBillingTestRunModal';
import BillLayoutEditor from './BillLayoutEditor';
import type { AutoBillingConfig } from './autobilling/hooks/useAutoBillingConfig';

export default function AutoBilling() {
  const { t } = useTranslation();
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);
  const [layoutBuildingId, setLayoutBuildingId] = useState<number | undefined>(undefined);
  const [testRunningId, setTestRunningId] = useState<number | null>(null);
  const [testRunModalOpen, setTestRunModalOpen] = useState(false);
  const [testRunResult, setTestRunResult] = useState<TestRunResult | null>(null);
  const [testRunError, setTestRunError] = useState<string>('');
  // building filter (matches Meters/Chargers/Devices)
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile] = useState(() => window.innerWidth <= 768);

  const handleEditLayout = (config: AutoBillingConfig) => {
    // Layouts are per concrete (non-group) building. Pre-select the first
    // regular building of the config so the editor opens on a sensible target.
    setLayoutBuildingId(config.building_ids[0]);
    setLayoutEditorOpen(true);
  };

  const {
    // Data
    configs,
    buildings,
    users,
    chargers,
    sharedMeters,
    customItems,
    loading,

    // Modal state
    showModal,
    showInstructions,
    setShowInstructions,
    editingConfig,
    step,
    setStep,

    // Form state
    formData,
    updateFormData,
    selectedApartments,
    selectedSharedMeters,
    selectedCustomItems,
    apartmentsWithUsers,
    isVZEVMode,
    chargerOnly,

    // Actions
    handleBuildingToggle,
    handleApartmentToggle,
    handleSelectAllActive,
    handleRecipientChange,
    handleChargerChange,
    handleChargerOnlyToggle,
    handleSharedMeterToggle,
    handleSelectAllSharedMeters,
    handleDeselectAllSharedMeters,
    handleCustomItemToggle,
    handleSelectAllCustomItems,
    handleDeselectAllCustomItems,
    openCreateModal,
    openEditModal,
    closeModal,
    submitForm,
    deleteConfig,
    toggleActive,
    canProceed,
    getActiveUsersCount
  } = useAutoBillingConfig();

  const handleDelete = async (id: number) => {
    try {
      await deleteConfig(id);
      alert(t('autoBilling.deleteSuccess'));
    } catch (err) {
      alert(t('autoBilling.deleteFailed') + ' ' + err);
    }
  };

  const handleToggleActive = async (config: any) => {
    try {
      await toggleActive(config);
    } catch (err) {
      alert(t('autoBilling.toggleFailed') + ' ' + err);
    }
  };

  const handleSubmit = async () => {
    await submitForm();
    alert(editingConfig ? t('autoBilling.updateSuccess') : t('autoBilling.createSuccess'));
  };

  const handleTestRun = async (config: AutoBillingConfig) => {
    if (!confirm(t('autoBilling.testRunConfirm'))) return;
    setTestRunningId(config.id);
    setTestRunResult(null);
    setTestRunError('');
    setTestRunModalOpen(true);
    try {
      const response = await api.runAutoBillingConfigNow(config.id);
      if (response.status === 'success' && response.result) {
        setTestRunResult(response.result as TestRunResult);
      } else {
        setTestRunError(response.message || t('autoBilling.testRunFailed'));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setTestRunError(message || t('autoBilling.testRunFailed'));
    } finally {
      setTestRunningId(null);
    }
  };

  const handleCloseTestRun = () => {
    setTestRunModalOpen(false);
    setTestRunResult(null);
    setTestRunError('');
  };

  if (loading) {
    return (
      <div style={{ width: '100%', maxWidth: '100%' }}>
        {/* Shimmer header */}
        <div style={{
          height: '40px', width: '320px', borderRadius: '10px',
          background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
          backgroundSize: '200% 100%',
          animation: 'ab-shimmer 1.5s infinite',
          marginBottom: '8px'
        }} />
        <div style={{
          height: '16px', width: '250px', borderRadius: '6px',
          background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
          backgroundSize: '200% 100%',
          animation: 'ab-shimmer 1.5s infinite',
          marginBottom: '30px'
        }} />
        {/* Shimmer cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              height: '240px', borderRadius: '14px',
              background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
              backgroundSize: '200% 100%',
              animation: 'ab-shimmer 1.5s infinite',
              animationDelay: `${i * 0.15}s`,
              border: '1px solid #e5e7eb'
            }} />
          ))}
        </div>
        <style>{`
          @keyframes ab-shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
        `}</style>
      </div>
    );
  }

  // A config can span multiple buildings, so it matches a building filter when
  // its building_ids include the selected building.
  const filteredBuildings = buildings.filter((b) => b.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredConfigs = selectedBuildingId ? configs.filter((c) => c.building_ids.includes(selectedBuildingId)) : configs;
  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: isMobile ? '8px 14px' : '8px 18px', borderRadius: '20px',
    border: active ? '1.5px solid #667eea' : '1.5px solid #e5e7eb',
    backgroundColor: active ? '#667eea' : 'white', color: active ? 'white' : '#6b7280',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
    display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
    boxShadow: active ? '0 2px 8px rgba(102,126,234,0.3)' : '0 1px 3px rgba(0,0,0,0.04)',
  });
  const countBadge = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '20px', height: '20px',
    padding: '0 6px', borderRadius: '10px', fontSize: '11px', fontWeight: 700,
    backgroundColor: active ? 'rgba(255,255,255,0.25)' : '#f3f4f6', color: active ? 'white' : '#9ca3af',
  });

  return (
    <div className="ab-container" style={{ width: '100%', maxWidth: '100%' }}>
      <div className="app-fade-in">
        <AutoBillingHeader
          onShowInstructions={() => setShowInstructions(true)}
          onAddConfig={openCreateModal}
        />
      </div>

      {configs.length === 0 ? (
        <div className="app-fade-in" style={{ animationDelay: '0.05s' }}>
          <AutoBillingEmptyState />
        </div>
      ) : (
        <>
          {/* Building filter (search + per-building pills), like the other pages */}
          {buildings.length > 0 && (
            <div className="app-fade-in" style={{ marginBottom: '20px', animationDelay: '0.04s' }}>
              <div style={{ position: 'relative', maxWidth: '400px', marginBottom: '14px' }}>
                <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  type="text"
                  placeholder={t('dashboard.searchBuildings')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px 10px 42px', border: '1px solid #e5e7eb', borderRadius: '12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <button onClick={() => setSelectedBuildingId(null)} style={pillStyle(selectedBuildingId === null)}>
                  <Building size={14} />
                  {t('dashboard.allBuildings')}
                  <span style={countBadge(selectedBuildingId === null)}>{configs.length}</span>
                </button>
                {filteredBuildings.map((b) => {
                  const count = configs.filter((c) => c.building_ids.includes(b.id)).length;
                  const active = selectedBuildingId === b.id;
                  return (
                    <button key={b.id} onClick={() => setSelectedBuildingId(b.id)} style={pillStyle(active)}>
                      {b.name}
                      <span style={countBadge(active)}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filteredConfigs.length === 0 ? (
            <div className="app-fade-in" style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
              {t('autoBilling.emptyBuilding')}
            </div>
          ) : (
            <div className="app-fade-in" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
              gap: '20px',
              animationDelay: '0.05s'
            }}>
              {filteredConfigs.map((config, i) => (
                <AutoBillingConfigCard
                  key={config.id}
                  config={config}
                  buildings={buildings}
                  onEdit={openEditModal}
                  onEditLayout={handleEditLayout}
                  onDelete={handleDelete}
                  onToggleActive={handleToggleActive}
                  onTestRun={handleTestRun}
                  testRunInProgress={testRunningId === config.id}
                  index={i}
                />
              ))}
            </div>
          )}
        </>
      )}

      <AutoBillingInstructionsModal
        isOpen={showInstructions}
        onClose={() => setShowInstructions(false)}
      />

      <AutoBillingTestRunModal
        isOpen={testRunModalOpen}
        running={testRunningId !== null}
        result={testRunResult}
        error={testRunError}
        onClose={handleCloseTestRun}
      />

      <BillLayoutEditor
        isOpen={layoutEditorOpen}
        buildings={buildings}
        initialBuildingId={layoutBuildingId}
        onClose={() => setLayoutEditorOpen(false)}
      />

      <AutoBillingConfigModal
        isOpen={showModal}
        editingConfig={editingConfig}
        step={step}
        formData={formData}
        buildings={buildings}
        users={users}
        chargers={chargers}
        sharedMeters={sharedMeters}
        customItems={customItems}
        selectedApartments={selectedApartments}
        selectedSharedMeters={selectedSharedMeters}
        selectedCustomItems={selectedCustomItems}
        apartmentsWithUsers={apartmentsWithUsers}
        isVZEVMode={isVZEVMode}
        chargerOnly={chargerOnly}
        canProceed={canProceed()}
        onClose={closeModal}
        onStepChange={setStep}
        onFormDataChange={updateFormData}
        onBuildingToggle={handleBuildingToggle}
        onApartmentToggle={handleApartmentToggle}
        onSelectAllActive={handleSelectAllActive}
        onRecipientChange={handleRecipientChange}
        onChargerChange={handleChargerChange}
        onChargerOnlyToggle={handleChargerOnlyToggle}
        onSharedMeterToggle={handleSharedMeterToggle}
        onSelectAllSharedMeters={handleSelectAllSharedMeters}
        onDeselectAllSharedMeters={handleDeselectAllSharedMeters}
        onCustomItemToggle={handleCustomItemToggle}
        onSelectAllCustomItems={handleSelectAllCustomItems}
        onDeselectAllCustomItems={handleDeselectAllCustomItems}
        onSubmit={handleSubmit}
        getActiveUsersCount={getActiveUsersCount}
      />

      <style>{`
        @media (max-width: 768px) {
          .ab-container h1 {
            font-size: 24px !important;
          }
          .ab-container h1 svg {
            width: 24px !important;
            height: 24px !important;
          }
          .ab-header {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .ab-header > div:last-child {
            width: 100%;
          }
          .ab-header button {
            width: 100% !important;
            justify-content: center !important;
          }
        }
      `}</style>
    </div>
  );
}
