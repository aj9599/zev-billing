import { useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from '../i18n';
import { api } from '../api/client';
import type { LoxoneControl } from '../types';

interface LoxoneDiscoveryProps {
    /** Default IP to discover (usually the form's loxone_host). */
    host: string;
    username: string;
    password: string;
    /** "meter" | "charger" — returns every control with an action UUID. */
    category: 'meter' | 'charger';
    /** Called with the discovered controls so the parent can render pickers. */
    onControls: (controls: LoxoneControl[]) => void;
    isMobile?: boolean;
}

// LoxoneDiscovery fetches the Miniserver structure file and hands the parent the
// list of controls, so the user can pick their meter/charger block by name
// instead of hunting for a UUID by hand. It is a pure config helper — it never
// touches the billing data path.
export default function LoxoneDiscovery({ host, username, password, category, onControls, isMobile }: LoxoneDiscoveryProps) {
    const { t } = useTranslation();
    const [ip, setIp] = useState(host || '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [count, setCount] = useState<number | null>(null);

    async function discover() {
        const target = (ip || host).trim();
        if (!target) {
            setError(t('loxone.discoverNeedHost'));
            return;
        }
        setBusy(true);
        setError('');
        setCount(null);
        onControls([]);
        try {
            const list = await api.discoverLoxoneControls({ host: target, username, password, category });
            onControls(list);
            setCount(list.length);
            if (list.length === 0) setError(t('loxone.discoverEmpty'));
        } catch (e: any) {
            setError(e?.message || t('loxone.discoverError'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div style={{
            backgroundColor: '#f0fdf4',
            padding: '14px',
            borderRadius: '10px',
            marginBottom: '14px',
            border: '1px solid #bbf7d0'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Search size={16} color="#10b981" />
                <strong style={{ fontSize: '14px', color: '#065f46' }}>{t('loxone.discoverTitle')}</strong>
            </div>
            <p style={{ fontSize: '12px', color: '#065f46', margin: '0 0 10px 0' }}>
                {t('loxone.discoverHint')}
            </p>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '8px', alignItems: isMobile ? 'stretch' : 'flex-end' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#065f46', marginBottom: '4px' }}>
                        {t('loxone.discoverHost')}
                    </label>
                    <input
                        type="text"
                        value={ip}
                        onChange={(e) => setIp(e.target.value)}
                        placeholder="192.168.1.100"
                        style={{
                            width: '100%',
                            padding: '9px 11px',
                            border: '1px solid #bbf7d0',
                            borderRadius: '8px',
                            fontSize: '14px',
                            boxSizing: 'border-box'
                        }}
                    />
                </div>
                <button
                    type="button"
                    onClick={discover}
                    disabled={busy}
                    style={{
                        padding: '10px 16px',
                        backgroundColor: busy ? '#9ca3af' : '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: busy ? 'default' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        whiteSpace: 'nowrap'
                    }}
                >
                    <Search size={14} /> {busy ? t('loxone.discovering') : t('loxone.discover')}
                </button>
            </div>
            {error && <p style={{ fontSize: '12px', color: '#dc2626', margin: '8px 0 0 0' }}>{error}</p>}
            {!error && count !== null && count > 0 && (
                <p style={{ fontSize: '12px', color: '#065f46', margin: '8px 0 0 0' }}>
                    {t('loxone.discoverFound').replace('{count}', String(count))}
                </p>
            )}
        </div>
    );
}
