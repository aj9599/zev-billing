import { X, Sun, Zap, Calendar } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import type { Meter } from '../../types';

interface TariffInterval {
    reading_time: string;
    consumption_kwh: number;
    solar_kwh: number;
    grid_kwh: number;
}

interface TariffBreakdownData {
    meter_id: number;
    meter_name: string;
    meter_type: string;
    total_consumption_kwh: number;
    total_solar_kwh: number;
    total_grid_kwh: number;
    solar_percent: number;
    intervals: TariffInterval[];
}

interface TariffBreakdownModalProps {
    meter: Meter;
    onClose: () => void;
}

const SOLAR_COLOR = '#10b981';
const GRID_COLOR = '#6b7280';

function formatTime(raw: string): string {
    // reading_time looks like "2026-05-06 14:30:00+02:00"; show date + HH:MM.
    return raw.length >= 16 ? raw.slice(0, 16).replace('T', ' ') : raw;
}

export default function TariffBreakdownModal({ meter, onClose }: TariffBreakdownModalProps) {
    const { t } = useTranslation();
    const [dateRange, setDateRange] = useState({
        start_date: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0]
    });
    const [data, setData] = useState<TariffBreakdownData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                start_date: dateRange.start_date,
                end_date: dateRange.end_date
            });
            const response = await fetch(`/api/meters/${meter.id}/tariff-breakdown?${params}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (!response.ok) {
                throw new Error(`${response.status}`);
            }
            setData(await response.json());
        } catch (e) {
            console.error('Tariff breakdown error:', e);
            setError(t('tariff.loadFailed') || 'Failed to load tariff breakdown');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const solarPct = data && data.total_consumption_kwh > 0
        ? (data.total_solar_kwh / data.total_consumption_kwh) * 100
        : 0;
    const gridPct = 100 - solarPct;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 2000, padding: '15px', backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                backgroundColor: '#f9fafb', borderRadius: '16px', maxWidth: '760px', width: '100%',
                maxHeight: '90vh', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                display: 'flex', flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '20px 24px', backgroundColor: 'white', borderBottom: '1px solid #f0f0f0'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Sun size={18} color="white" />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1f2937', margin: 0 }}>
                                {t('tariff.title') || 'Tariff Breakdown'}
                            </h2>
                            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>{meter.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                        backgroundColor: '#f3f4f6', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <X size={18} color="#6b7280" />
                    </button>
                </div>

                {/* Body */}
                <div style={{ overflow: 'auto', padding: '20px 24px', flex: 1 }}>
                    {/* Date range */}
                    <div style={{
                        display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '16px',
                        padding: '16px', backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb'
                    }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>
                                <Calendar size={13} color="#f59e0b" /> {t('export.startDate') || 'Start Date'}
                            </label>
                            <input type="date" value={dateRange.start_date}
                                onChange={(e) => setDateRange({ ...dateRange, start_date: e.target.value })}
                                style={inputStyle} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>
                                {t('export.endDate') || 'End Date'}
                            </label>
                            <input type="date" value={dateRange.end_date}
                                onChange={(e) => setDateRange({ ...dateRange, end_date: e.target.value })}
                                style={inputStyle} />
                        </div>
                        <button onClick={load} disabled={loading} style={{
                            padding: '10px 18px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1
                        }}>
                            {loading ? (t('tariff.loading') || 'Loading...') : (t('tariff.apply') || 'Apply')}
                        </button>
                    </div>

                    {error && (
                        <div style={{ padding: '14px', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                            {error}
                        </div>
                    )}

                    {meter.meter_type !== 'apartment_meter' && !loading && !error && (
                        <div style={{ padding: '14px', backgroundColor: '#fffbeb', color: '#92400e', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                            {t('tariff.apartmentOnly') || 'Tariff split is only available for apartment meters.'}
                        </div>
                    )}

                    {data && data.intervals.length > 0 && (
                        <>
                            {/* Summary */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                                <SummaryCard label={t('tariff.totalConsumption') || 'Total Consumption'} value={`${data.total_consumption_kwh.toFixed(2)} kWh`} color="#374151" icon={<Zap size={16} color="#374151" />} />
                                <SummaryCard label={t('tariff.solar') || 'Solar'} value={`${data.total_solar_kwh.toFixed(2)} kWh (${solarPct.toFixed(1)}%)`} color={SOLAR_COLOR} icon={<Sun size={16} color={SOLAR_COLOR} />} />
                                <SummaryCard label={t('tariff.grid') || 'Grid'} value={`${data.total_grid_kwh.toFixed(2)} kWh (${gridPct.toFixed(1)}%)`} color={GRID_COLOR} icon={<Zap size={16} color={GRID_COLOR} />} />
                            </div>

                            {/* Proportion bar */}
                            <div style={{
                                display: 'flex', height: '24px', borderRadius: '8px', overflow: 'hidden',
                                marginBottom: '20px', border: '1px solid #e5e7eb', backgroundColor: '#f3f4f6'
                            }}>
                                {solarPct > 0 && (
                                    <div title={`${t('tariff.solar') || 'Solar'} ${solarPct.toFixed(1)}%`}
                                        style={{ width: `${solarPct}%`, backgroundColor: SOLAR_COLOR }} />
                                )}
                                {gridPct > 0 && (
                                    <div title={`${t('tariff.grid') || 'Grid'} ${gridPct.toFixed(1)}%`}
                                        style={{ width: `${gridPct}%`, backgroundColor: GRID_COLOR }} />
                                )}
                            </div>

                            {/* Per-interval table */}
                            <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', backgroundColor: 'white' }}>
                                <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                        <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f9fafb', zIndex: 1 }}>
                                            <tr>
                                                <th style={thStyle}>{t('tariff.interval') || 'Interval'}</th>
                                                <th style={thStyleRight}>{t('tariff.consumption') || 'Consumption'} (kWh)</th>
                                                <th style={thStyleRight}>{t('tariff.solar') || 'Solar'} (kWh)</th>
                                                <th style={thStyleRight}>{t('tariff.grid') || 'Grid'} (kWh)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.intervals.map((iv, i) => (
                                                <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                                                    <td style={tdStyle}>{formatTime(iv.reading_time)}</td>
                                                    <td style={tdStyleRight}>{iv.consumption_kwh.toFixed(3)}</td>
                                                    <td style={{ ...tdStyleRight, color: SOLAR_COLOR, fontWeight: 600 }}>{iv.solar_kwh.toFixed(3)}</td>
                                                    <td style={{ ...tdStyleRight, color: GRID_COLOR, fontWeight: 600 }}>{iv.grid_kwh.toFixed(3)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {data && data.intervals.length === 0 && !loading && meter.meter_type === 'apartment_meter' && !error && (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                            {t('tariff.noData') || 'No consumption data in this period.'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function SummaryCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: React.ReactNode }) {
    return (
        <div style={{ padding: '14px', backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>
                {icon} {label}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color }}>{value}</div>
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '8px',
    fontSize: '14px', color: '#1f2937', backgroundColor: 'white', outline: 'none'
};

const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '10px 14px', fontSize: '12px', fontWeight: 600,
    color: '#6b7280', borderBottom: '1px solid #e5e7eb'
};
const thStyleRight: React.CSSProperties = { ...thStyle, textAlign: 'right' };
const tdStyle: React.CSSProperties = { padding: '8px 14px', color: '#374151' };
const tdStyleRight: React.CSSProperties = { ...tdStyle, textAlign: 'right' };
