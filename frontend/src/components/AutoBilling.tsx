import { useTranslation } from '../i18n';
import { useAutoBillingConfig } from './autobilling/hooks/useAutoBillingConfig';
import AutoBillingHeader from './autobilling/components/AutoBillingHeader';
import AutoBillingConfigCard from './autobilling/components/AutoBillingConfigCard';
import AutoBillingConfigModal from './autobilling/components/AutoBillingConfigModal';
import AutoBillingInstructionsModal from './autobilling/components/AutoBillingInstructionsModal';
import AutoBillingEmptyState from './autobilling/components/AutoBillingEmptyState';

export default function AutoBilling() {
  const { t } = useTranslation();

  const {
    // Data
    configs,
    buildings,
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

    // Actions
    handleBuildingToggle,
    handleApartmentToggle,
    handleSelectAllActive,
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

  return (
    <div className="ab-container" style={{ width: '100%', maxWidth: '100%' }}>
      <AutoBillingHeader
        onShowInstructions={() => setShowInstructions(true)}
        onAddConfig={openCreateModal}
      />

      {configs.length === 0 ? (
        <AutoBillingEmptyState />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
          gap: '20px'
        }}>
          {configs.map((config, i) => (
            <AutoBillingConfigCard
              key={config.id}
              config={config}
              buildings={buildings}
              onEdit={openEditModal}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
              index={i}
            />
          ))}
        </div>
      )}

      <AutoBillingInstructionsModal
        isOpen={showInstructions}
        onClose={() => setShowInstructions(false)}
      />

      <AutoBillingConfigModal
        isOpen={showModal}
        editingConfig={editingConfig}
        step={step}
        formData={formData}
        buildings={buildings}
        sharedMeters={sharedMeters}
        customItems={customItems}
        selectedApartments={selectedApartments}
        selectedSharedMeters={selectedSharedMeters}
        selectedCustomItems={selectedCustomItems}
        apartmentsWithUsers={apartmentsWithUsers}
        isVZEVMode={isVZEVMode}
        canProceed={canProceed()}
        onClose={closeModal}
        onStepChange={setStep}
        onFormDataChange={updateFormData}
        onBuildingToggle={handleBuildingToggle}
        onApartmentToggle={handleApartmentToggle}
        onSelectAllActive={handleSelectAllActive}
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
