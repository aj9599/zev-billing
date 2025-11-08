export const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const getMeterTypeLabel = (meterType: string, t: (key: string) => string): string => {
    const typeMap: Record<string, string> = {
        'total_meter': t('meters.totalMeter'),
        'solar_meter': t('meters.solarMeter'),
        'apartment_meter': t('meters.apartmentMeter'),
        'heating_meter': t('meters.heatingMeter'),
        'other': t('meters.other')
    };
    return typeMap[meterType] || meterType;
};

export const isDataKeyUsed = (meters: any[], dataKey: string): boolean => {
    return meters.some(meter => {
        if (meter.connection_type !== 'udp' && meter.connection_type !== 'http') return false;
        try {
            const config = JSON.parse(meter.connection_config);
            return config.data_key === dataKey || config.power_field === dataKey;
        } catch (e) {
            return false;
        }
    });
};

export const generateUniqueDataKey = (meters: any[]): string => {
    let uuid = generateUUID() + '_power_kwh';
    let attempts = 0;
    const maxAttempts = 100;

    while (isDataKeyUsed(meters, uuid) && attempts < maxAttempts) {
        uuid = generateUUID() + '_power_kwh';
        attempts++;
    }

    return uuid;
};

export const isMqttTopicUsed = (meters: any[], topic: string): boolean => {
    return meters.some(meter => {
        if (meter.connection_type !== 'mqtt') return false;
        try {
            const config = JSON.parse(meter.connection_config);
            return config.mqtt_topic === topic;
        } catch (e) {
            return false;
        }
    });
};

export const generateUniqueMqttTopic = (
    meters: any[], 
    meterName: string, 
    buildingName?: string, 
    apartmentUnit?: string
): string => {
    const safeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    let topic: string;
    
    if (buildingName && apartmentUnit) {
        // For apartment meters: meters/BuildingName/ApartmentUnit/MeterName
        topic = `meters/${safeName(buildingName)}/${safeName(apartmentUnit)}/${safeName(meterName)}`;
    } else if (buildingName) {
        // For building-level meters: meters/BuildingName/MeterName
        topic = `meters/${safeName(buildingName)}/${safeName(meterName)}`;
    } else {
        // Fallback if building name not provided
        topic = `meters/${safeName(meterName)}`;
    }
    
    let counter = 1;
    let finalTopic = topic;

    while (isMqttTopicUsed(meters, finalTopic)) {
        finalTopic = `${topic}_${counter}`;
        counter++;
    }

    return finalTopic;
};