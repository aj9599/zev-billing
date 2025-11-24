import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import AutoBillingStepper from './AutoBillingStepper';
import AutoBillingStep1Selection from './steps/AutoBillingStep1Selection';
import AutoBillingStep2Schedule from './steps/AutoBillingStep2Schedule';
import AutoBillingStep3SharedMeters from './steps/AutoBillingStep3SharedMeters';
import AutoBillingStep4CustomItems from './steps/AutoBillingStep4CustomItems';
import AutoBillingStep5Sender from './steps/AutoBillingStep5Sender';
import AutoBillingStep6Banking from './steps/AutoBillingStep6Banking';
import AutoBillingStep7Review from './steps/AutoBillingStep7Review';
import type { Building, ApartmentWithUser, SharedMeterConfig, CustomLineItem } from '../../../types';
import type { AutoBillingFormData, AutoBillingConfig } from '../hooks/useAutoBillingConfig';

interface AutoBillingConfigModalProps {
  isOpen: boolean;
  editingConfig: AutoBillingConfig | null;
  step: number;
  formData: AutoBillingFormData;
  buildings: Building[];
  sharedMeters: SharedMeterConfig[];
  customItems: CustomLineItem[];
  selectedApartments: Set<string>;
  selectedSharedMeters: number[];
  selectedCustomItems: number[];
  apartmentsWithUsers: Map<number, ApartmentWithUser[]>;
  isVZEVMode: boolean;
  canProceed: boolean;
  onClose: () => void;
  onStepChange: (step: number) => void;
  onFormDataChange: (updates: Partial<AutoBillingFormData>) => void;
  onBuildingToggle: (buildingId: number) => boolean;
  onApartmentToggle: (buildingId: number, apartmentUnit: string) => void;
  onSelectAllActive: () => void;
  onSharedMeterToggle: (meterId: number) => void;
  onSelectAllSharedMeters: () => void;
  onDeselectAllSharedMeters: () => void;
  onCustomItemToggle: (itemId: number) => void;
  onSelectAllCustomItems: () => void;
  onDeselectAllCustomItems: () => void;
  onSubmit: () => Promise<void>;
  getActiveUsersCount: () => number;
}

export default function AutoBillingConfigModal({
  isOpen,
  editingConfig,
  step,
  formData,
  buildings,
  sharedMeters,
  customItems,
  selectedApartments,
  selectedSharedMeters,
  selectedCustomItems,
  apartmentsWithUsers,
  isVZEVMode,
  canProceed,
  onClose,
  onStepChange,
  onFormDataChange,
  onBuildingToggle,
  onApartmentToggle,
  onSelectAllActive,
  onSharedMeterToggle,
  onSelectAllSharedMeters,
  onDeselectAllSharedMeters,
  onCustomItemToggle,
  onSelectAllCustomItems,
  onDeselectAllCustomItems,
  onSubmit,
  getActiveUsersCount
}: AutoBillingConfigModalProps) {
  const { t } = useTranslation();

  const TOTAL_STEPS = 7;

  const handleSubmit = async () => {
    try {
      await onSubmit();
    } catch (err: any) {
      console.error('Submit error:', err);
      alert(t('autoBilling.saveFailed') + '\n' + (err.message || err));
    }
  };

  const handleMixingWarning = () => {
    alert(t('autoBilling.error.cannotMix'));
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        maxWidth: '900px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 30px',
          borderBottom: '1px solid #dee2e6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{
            fontSize: '24px',
            fontWeight: 'bold',
            margin: 0,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            {editingConfig ? t('autoBilling.editConfig') : t('autoBilling.addConfig')}
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: '8px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Stepper */}
        <AutoBillingStepper currentStep={step} />

        {/* Content */}
        <div style={{
          padding: '30px',
          flex: 1,
          overflowY: 'auto'
        }}>
          {step === 1 && (
            <AutoBillingStep1Selection
              buildings={buildings}
              selectedBuildingIds={formData.building_ids}
              selectedApartments={selectedApartments}
              apartmentsWithUsers={apartmentsWithUsers}
              isVZEVMode={isVZEVMode}
              onBuildingToggle={onBuildingToggle}
              onApartmentToggle={onApartmentToggle}
              onSelectAllActive={onSelectAllActive}
              onMixingWarning={handleMixingWarning}
            />
          )}
          {step === 2 && (
            <AutoBillingStep2Schedule
              name={formData.name}
              frequency={formData.frequency}
              generationDay={formData.generation_day}
              firstExecutionDate={formData.first_execution_date}
              onNameChange={(value) => onFormDataChange({ name: value })}
              onFrequencyChange={(value) => onFormDataChange({ frequency: value })}
              onGenerationDayChange={(value) => onFormDataChange({ generation_day: value })}
              onFirstExecutionDateChange={(value) => onFormDataChange({ first_execution_date: value })}
            />
          )}
          {step === 3 && (
            <AutoBillingStep3SharedMeters
              buildings={buildings}
              selectedBuildingIds={formData.building_ids}
              sharedMeters={sharedMeters}
              selectedSharedMeters={selectedSharedMeters}
              onToggle={onSharedMeterToggle}
              onSelectAll={onSelectAllSharedMeters}
              onDeselectAll={onDeselectAllSharedMeters}
            />
          )}
          {step === 4 && (
            <AutoBillingStep4CustomItems
              buildings={buildings}
              selectedBuildingIds={formData.building_ids}
              customItems={customItems}
              selectedCustomItems={selectedCustomItems}
              onToggle={onCustomItemToggle}
              onSelectAll={onSelectAllCustomItems}
              onDeselectAll={onDeselectAllCustomItems}
            />
          )}
          {step === 5 && (
            <AutoBillingStep5Sender
              senderName={formData.sender_name}
              senderAddress={formData.sender_address}
              senderCity={formData.sender_city}
              senderZip={formData.sender_zip}
              senderCountry={formData.sender_country}
              onSenderNameChange={(value) => onFormDataChange({ sender_name: value })}
              onSenderAddressChange={(value) => onFormDataChange({ sender_address: value })}
              onSenderCityChange={(value) => onFormDataChange({ sender_city: value })}
              onSenderZipChange={(value) => onFormDataChange({ sender_zip: value })}
              onSenderCountryChange={(value) => onFormDataChange({ sender_country: value })}
            />
          )}
          {step === 6 && (
            <AutoBillingStep6Banking
              bankName={formData.bank_name}
              bankIban={formData.bank_iban}
              bankAccountHolder={formData.bank_account_holder}
              onBankNameChange={(value) => onFormDataChange({ bank_name: value })}
              onBankIbanChange={(value) => onFormDataChange({ bank_iban: value })}
              onBankAccountHolderChange={(value) => onFormDataChange({ bank_account_holder: value })}
            />
          )}
          {step === 7 && (
            <AutoBillingStep7Review
              name={formData.name}
              isVZEVMode={isVZEVMode}
              frequency={formData.frequency}
              generationDay={formData.generation_day}
              firstExecutionDate={formData.first_execution_date}
              buildingIds={formData.building_ids}
              buildings={buildings}
              apartmentCount={selectedApartments.size}
              userCount={getActiveUsersCount()}
              sharedMeterCount={selectedSharedMeters.length}
              customItemCount={selectedCustomItems.length}
              senderName={formData.sender_name}
              senderAddress={formData.sender_address}
              senderCity={formData.sender_city}
              senderZip={formData.sender_zip}
              bankName={formData.bank_name}
              bankIban={formData.bank_iban}
              bankAccountHolder={formData.bank_account_holder}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '20px 30px',
          borderTop: '1px solid #dee2e6',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '12px',
          backgroundColor: '#f8f9fa'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '12px 24px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: '500'
            }}
          >
            {t('common.cancel')}
          </button>

          <div style={{ display: 'flex', gap: '12px' }}>
            {step > 1 && (
              <button
                onClick={() => onStepChange(step - 1)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'white',
                  color: '#667EEA',
                  border: '1px solid #667EEA',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <ChevronLeft size={18} />
                {t('billConfig.navigation.previous')}
              </button>
            )}

            {step < TOTAL_STEPS ? (
              <button
                onClick={() => onStepChange(step + 1)}
                disabled={!canProceed}
                style={{
                  padding: '12px 24px',
                  backgroundColor: canProceed ? '#667EEA' : '#ced4da',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: canProceed ? 'pointer' : 'not-allowed',
                  fontSize: '15px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {t('billConfig.navigation.next')}
                <ChevronRight size={18} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canProceed}
                style={{
                  padding: '12px 24px',
                  backgroundColor: canProceed ? '#28a745' : '#ced4da',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: canProceed ? 'pointer' : 'not-allowed',
                  fontSize: '15px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Check size={18} />
                {editingConfig ? t('common.update') : t('common.create')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}