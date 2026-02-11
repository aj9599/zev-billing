import { X, ChevronLeft, ChevronRight, Check, Calendar } from 'lucide-react';
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
      backgroundColor: 'rgba(0,0,0,0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
      animation: 'ab-modalFadeIn 0.2s ease-out'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '20px',
        maxWidth: '900px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
        animation: 'ab-modalSlideUp 0.3s ease-out',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #f3f4f6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              backgroundColor: '#667eea15',
              color: '#667eea',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Calendar size={18} />
            </div>
            <div>
              <h2 style={{
                fontSize: '18px',
                fontWeight: '700',
                margin: 0,
                color: '#1f2937'
              }}>
                {editingConfig ? t('autoBilling.editConfig') : t('autoBilling.addConfig')}
              </h2>
              <p style={{ fontSize: '13px', color: '#9ca3af', margin: '2px 0 0 0' }}>
                Step {step} / {TOTAL_STEPS}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px', height: '32px', borderRadius: '8px',
              border: 'none', backgroundColor: '#f3f4f6', color: '#6b7280',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Stepper */}
        <AutoBillingStepper currentStep={step} />

        {/* Content */}
        <div style={{
          padding: '30px',
          flex: 1,
          overflowY: 'auto',
          backgroundColor: '#f9fafb'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            padding: '24px'
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
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #f3f4f6',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '12px',
          backgroundColor: 'white',
          flexShrink: 0
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: 'white',
              color: '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
          >
            {t('common.cancel')}
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            {step > 1 && (
              <button
                onClick={() => onStepChange(step - 1)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#667eea',
                  border: '1px solid #667eea',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                <ChevronLeft size={16} />
                {t('billConfig.navigation.previous')}
              </button>
            )}

            {step < TOTAL_STEPS ? (
              <button
                onClick={() => onStepChange(step + 1)}
                disabled={!canProceed}
                style={{
                  padding: '10px 20px',
                  background: canProceed ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: canProceed ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s',
                  boxShadow: canProceed ? '0 2px 8px rgba(102, 126, 234, 0.35)' : 'none'
                }}
              >
                {t('billConfig.navigation.next')}
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canProceed}
                style={{
                  padding: '10px 20px',
                  background: canProceed ? 'linear-gradient(135deg, #059669, #10b981)' : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: canProceed ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s',
                  boxShadow: canProceed ? '0 2px 8px rgba(5, 150, 105, 0.35)' : 'none'
                }}
              >
                <Check size={16} />
                {editingConfig ? t('common.update') : t('common.create')}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ab-modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes ab-modalSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
