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
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '400px' 
      }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid #e5e7eb',
            borderTopColor: '#667EEA',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p>{t('common.loading')}...</p>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="auto-billing-container" style={{ width: '100%', maxWidth: '100%' }}>
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
          {configs.map(config => (
            <AutoBillingConfigCard
              key={config.id}
              config={config}
              buildings={buildings}
              onEdit={openEditModal}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
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
          .auto-billing-container h1 {
            font-size: 24px !important;
          }

          .auto-billing-container h1 svg {
            width: 24px !important;
            height: 24px !important;
          }

          .auto-billing-header {
            flex-direction: column !important;
            align-items: stretch !important;
          }

          .auto-billing-header > div:last-child {
            width: 100%;
          }

          .auto-billing-header button {
            width: 100% !important;
            justify-content: center !important;
          }
        }
      `}</style>
    </div>
  );
}