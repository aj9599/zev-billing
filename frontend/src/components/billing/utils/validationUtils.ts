export interface ValidationErrors {
    [key: string]: string;
  }
  
  export const validateCustomItemForm = (
    formData: {
      building_id: number;
      description: string;
      amount: number;
    },
    t: (key: string) => string
  ): ValidationErrors => {
    const errors: ValidationErrors = {};
  
    if (!formData.description.trim()) {
      errors.description = t('customItems.validation.descriptionRequired');
    } else if (formData.description.length > 200) {
      errors.description = t('customItems.validation.descriptionTooLong');
    }
  
    if (formData.amount <= 0) {
      errors.amount = t('customItems.validation.amountPositive');
    } else if (formData.amount > 999999) {
      errors.amount = t('customItems.validation.amountTooLarge');
    }
  
    if (!formData.building_id) {
      errors.building_id = t('customItems.validation.selectBuilding');
    }
  
    return errors;
  };
  
  export const validateSharedMeterForm = (
    formData: {
      building_id: number;
      meter_id: number;
      unit_price: number;
      split_type: string;
      custom_splits?: Record<number, number>;
    },
    buildingUserCount: number,
    t: (key: string) => string
  ): ValidationErrors => {
    const errors: ValidationErrors = {};
  
    if (!formData.building_id) {
      errors.building_id = t('sharedMeters.validation.selectBuilding');
    }
  
    if (!formData.meter_id) {
      errors.meter_id = t('sharedMeters.validation.selectMeter');
    }
  
    if (formData.unit_price <= 0) {
      errors.unit_price = t('sharedMeters.validation.pricePositive');
    }
  
    // Validate custom splits if split_type is custom
    if (formData.split_type === 'custom' && formData.custom_splits) {
      const totalPercentage = Object.values(formData.custom_splits).reduce(
        (sum, val) => sum + val,
        0
      );
  
      if (buildingUserCount > 0 && Math.abs(totalPercentage - 100) > 0.01) {
        errors.custom_splits = t('sharedMeters.totalMustBe100');
      }
    }
  
    return errors;
  };
  
  export const validateBillConfigStep1 = (
    buildingIds: number[],
    userIds: number[]
  ): boolean => {
    return buildingIds.length > 0 && userIds.length > 0;
  };
  
  export const validateBillConfigStep2 = (
    startDate: string,
    endDate: string
  ): boolean => {
    return !!startDate && !!endDate;
  };
  
  export const validateBillConfigStep5 = (
    senderName: string,
    bankIban: string
  ): boolean => {
    return !!senderName && !!bankIban;
  };