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

export const generateUniqueMqttTopic = (meters: any[], meterName: string): string => {
    const safeName = meterName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    let topic = `meters/${safeName}`;
    let counter = 1;

    while (isMqttTopicUsed(meters, topic)) {
        topic = `meters/${safeName}_${counter}`;
        counter++;
    }

    return topic;
};