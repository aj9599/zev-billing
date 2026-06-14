import { useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from '../i18n';
import { api } from '../api/client';
import type { SmartMeDevice } from '../types';

interface SmartMeDiscoveryProps {
    authType: 'basic' | 'apikey' | 'oauth';
    apiKey?: string;
    username?: string;
    password?: string;
    clientId?: string;
    clientSecret?: string;
    /** Called with the discovered devices so the parent can render a picker. */
    onDevices: (devices: SmartMeDevice[]) => void;
    isMobile?: boolean;
}

// SmartMeDiscovery asks the Smart-me cloud for every device the entered
// credentials can read, so the user can pick their meter by name instead of
// typing a UUID. Mirrors LoxoneDiscovery — config-only, never billing data.
export default function SmartMeDiscovery({
    authType, apiKey, username, password, clientId, clientSecret, onDevices, isMobile
}: SmartMeDiscoveryProps) {
    const { t } = useTranslation();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [count, setCount] = useState<number | null>(null);

    const hasCredentials = () => {
        if (authType === 'apikey') return !!apiKey?.trim();
        if (authType === 'basic') return !!username?.trim() && !!password;
        if (authType === 'oauth') return !!clientId?.trim() && !!clientSecret?.trim();
        return false;
    };

    async function discover() {
        if (!hasCredentials()) {
            setError(t('meters.smartmeDiscoverNeedCreds'));
            return;
        }
        setBusy(true);
        setError('');
        setCount(null);
        onDevices([]);
        try {
            const config: any = { auth_type: authType };
            if (authType === 'apikey') config.api_key = apiKey;
            else if (authType === 'basic') { config.username = username; config.password = password; }
            else if (authType === 'oauth') { config.client_id = clientId; config.client_secret = clientSecret; }

            const list = await api.discoverSmartMeDevices(config);
            onDevices(list);
            setCount(list.length);
            if (list.length === 0) setError(t('meters.smartmeDiscoverEmpty'));
        } catch (e: any) {
            setError(e?.message || t('meters.smartmeDiscoverError'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div style={{
            backgroundColor: '#eff6ff',
            padding: '14px',
            borderRadius: '10px',
            marginBottom: '14px',
            border: '1px solid #bfdbfe'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Search size={16} color="#3b82f6" />
                <strong style={{ fontSize: '14px', color: '#1e40af' }}>{t('meters.smartmeDiscoverTitle')}</strong>
            </div>
            <p style={{ fontSize: '12px', color: '#1e40af', margin: '0 0 10px 0' }}>
                {t('meters.smartmeDiscoverHint')}
            </p>
            <button
                type="button"
                onClick={discover}
                disabled={busy}
                style={{
                    padding: '10px 16px',
                    backgroundColor: busy ? '#9ca3af' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: busy ? 'default' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                    width: isMobile ? '100%' : 'auto',
                    justifyContent: 'center'
                }}
            >
                <Search size={14} /> {busy ? t('meters.smartmeDiscovering') : t('meters.smartmeDiscover')}
            </button>
            {error && <p style={{ fontSize: '12px', color: '#dc2626', margin: '8px 0 0 0' }}>{error}</p>}
            {!error && count !== null && count > 0 && (
                <p style={{ fontSize: '12px', color: '#1e40af', margin: '8px 0 0 0' }}>
                    {t('meters.smartmeDiscoverFound').replace('{count}', String(count))}
                </p>
            )}
        </div>
    );
}
