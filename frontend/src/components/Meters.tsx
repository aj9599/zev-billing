import { useState, useEffect } from 'react';
import { Search, Zap, Wifi, Activity } from 'lucide-react';
import { api } from '../api/client';
import type { Meter, Building as BuildingType, User } from '../types';
import { useTranslation } from '../i18n';
import ExportModal from './ExportModal';
import MeterReplacementModal from './MeterReplacementModal';
import MeterCard from './meters/MeterCard';
import MeterFormModal from './meters/MeterFormModal';
import InstructionsModal from './meters/InstructionsModal';
import BuildingFilter from './meters/BuildingFilter';
import MetersHeader from './meters/MetersHeader';
import DeleteConfirmationModal from './meters/DeleteConfirmationModal';
import { useMeterStatus } from './meters/hooks/useMeterStatus';
import { useMeterForm } from './meters/hooks/useMeterForm';
import { useMeterDeletion } from './meters/hooks/useMeterDeletion';

export default function Meters() {
    const { t } = useTranslation();
    const [meters, setMeters] = useState<Meter[]>([]);
    const [buildings, setBuildings] = useState<BuildingType[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showInstructions, setShowInstructions] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    // Meter replacement state
    const [showReplacementModal, setShowReplacementModal] = useState(false);
    const [meterToReplace, setMeterToReplace] = useState<Meter | null>(null);

    // Custom hooks for form and status management
    const { loxoneStatus, mqttStatus, fetchConnectionStatus } = useMeterStatus();
    const {
        showModal,
        editingMeter,
        formData,
        connectionConfig,
        isTestingConnection,
        handleAddMeter,
        handleEdit,
        handleSubmit,
        handleCancel,
        handleConnectionTypeChange,
        handleNameChange,
        handleTestConnection,
        setFormData,
        setConnectionConfig
    } = useMeterForm(loadData, fetchConnectionStatus, meters);

    const {
        showDeleteConfirmation,
        deletionImpact,
        deleteConfirmationText,
        deleteUnderstandChecked,
        captchaValid,
        handleDeleteClick,
        handleDeleteConfirm,
        handleDeleteCancel,
        setDeleteConfirmationText,
        setDeleteUnderstandChecked,
        setCaptchaValid
    } = useMeterDeletion(loadData, fetchConnectionStatus);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        loadData();
        fetchConnectionStatus();

        const dataInterval = setInterval(loadData, 10000);
        const statusInterval = setInterval(fetchConnectionStatus, 30000);
        return () => {
            clearInterval(dataInterval);
            clearInterval(statusInterval);
        };
    }, [showArchived]);

    async function loadData() {
        try {
            const [metersData, buildingsData, usersData] = await Promise.all([
                api.getMeters(undefined, showArchived),
                api.getBuildings(),
                api.getUsers()
            ]);
            setMeters(metersData);
            setBuildings(buildingsData.filter(b => !b.is_group));
            setUsers(usersData);
        } finally {
            setLoading(false);
        }
    }

    const handleReplaceClick = (meter: Meter) => {
        if (meter.is_archived) {
            alert(t('meters.cannotReplaceArchived') || 'Cannot replace an archived meter');
            return;
        }
        setMeterToReplace(meter);
        setShowReplacementModal(true);
    };

    const handleReplacementSuccess = () => {
        setShowReplacementModal(false);
        setMeterToReplace(null);
        loadData();
        fetchConnectionStatus();
    };

    const handleExport = async (startDate: string, endDate: string, meterId?: number, meterIds?: number[]) => {
        try {
            const params = new URLSearchParams({
                type: 'meters',
                start_date: startDate,
                end_date: endDate
            });

            if (meterIds && meterIds.length > 0) {
                params.append('meter_ids', meterIds.join(','));
            } else if (meterId) {
                params.append('meter_id', meterId.toString());
            }

            const response = await fetch(`/api/export/data?${params}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Export failed: ${response.status} - ${errorText}`);
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            let fileLabel = 'all';
            if (meterIds && meterIds.length > 0) {
                if (meterIds.length === 1) {
                    fileLabel = meters.find(m => m.id === meterIds[0])?.name.replace(/\s+/g, '-') || 'selected';
                } else {
                    fileLabel = `${meterIds.length}-meters`;
                }
            } else if (meterId) {
                fileLabel = meters.find(m => m.id === meterId)?.name.replace(/\s+/g, '-') || 'selected';
            }
            a.download = `meters-${fileLabel}-${startDate}-to-${endDate}.csv`;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            setShowExportModal(false);
        } catch (error) {
            console.error('Export error:', error);
            alert(t('meters.exportFailed') || 'Export failed. Please try again.');
        }
    };

    const filteredBuildings = buildings.filter(b =>
        b.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredMeters = selectedBuildingId
        ? meters.filter(m => m.building_id === selectedBuildingId)
        : meters;

    const groupedMeters = filteredMeters.reduce((acc, meter) => {
        if (!acc[meter.building_id]) {
            acc[meter.building_id] = [];
        }
        acc[meter.building_id].push(meter);
        return acc;
    }, {} as Record<number, Meter[]>);

    const exportItems = meters.map(m => {
        const building = buildings.find(b => b.id === m.building_id);
        return {
            id: m.id,
            name: m.name,
            building_id: m.building_id,
            building_name: building?.name || 'Unknown Building'
        };
    });

    // Stats
    const activeMeters = meters.filter(m => m.is_active && !m.is_archived);
    const totalCount = activeMeters.length;
    const connectedCount = activeMeters.filter(m => m.connection_type === 'loxone_api' || m.connection_type === 'mqtt').length;
    const archivedCount = meters.filter(m => m.is_archived).length;

    // Loading skeleton
    if (loading) {
        return (
            <div className="meters-container" style={{ width: '100%', maxWidth: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="m-shimmer" style={{ height: '60px', borderRadius: '12px' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                        {[1,2,3].map(i => (
                            <div key={i} className="m-shimmer" style={{ height: '80px', borderRadius: '12px' }} />
                        ))}
                    </div>
                    <div className="m-shimmer" style={{ height: '48px', borderRadius: '12px' }} />
                    <div className="m-shimmer" style={{ height: '200px', borderRadius: '12px' }} />
                </div>
                <style>{shimmerCSS}</style>
            </div>
        );
    }

    return (
        <div className="meters-container" style={{ width: '100%', maxWidth: '100%' }}>

            {/* Header */}
            <div className="m-fade-in">
                <MetersHeader
                    onAddMeter={handleAddMeter}
                    onShowInstructions={() => setShowInstructions(true)}
                    onShowExport={() => setShowExportModal(true)}
                    showArchived={showArchived}
                    onToggleArchived={setShowArchived}
                    isMobile={isMobile}
                />
            </div>

            {/* Stats row */}
            <div className="m-fade-in m-stats-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '12px',
                marginBottom: '20px',
                animationDelay: '0.05s'
            }}>
                <StatsCard icon={Zap} label={t('meters.totalMeters') || 'Total Meters'} value={totalCount} color="#3b82f6" />
                <StatsCard icon={Wifi} label={t('meters.connected') || 'Connected'} value={connectedCount} color="#10b981" />
                <StatsCard icon={Activity} label={t('users.archived')} value={archivedCount} color="#6b7280" />
            </div>

            {/* Search bar */}
            <div className="m-fade-in" style={{ animationDelay: '0.1s', marginBottom: '16px' }}>
                <div style={{
                    backgroundColor: 'white',
                    padding: isMobile ? '12px' : '12px 16px',
                    borderRadius: '12px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    maxWidth: '400px'
                }}>
                    <Search size={18} color="#9ca3af" style={{ flexShrink: 0 }} />
                    <input
                        type="text"
                        placeholder={t('dashboard.searchBuildings')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            flex: 1,
                            padding: '8px 0',
                            border: 'none',
                            fontSize: '14px',
                            outline: 'none',
                            backgroundColor: 'transparent',
                            color: '#1f2937'
                        }}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            style={{
                                background: 'none', border: 'none', color: '#9ca3af',
                                cursor: 'pointer', fontSize: '18px', padding: '0 4px', lineHeight: 1
                            }}
                        >
                            &times;
                        </button>
                    )}
                </div>
            </div>

            {/* Building filter pills */}
            <div className="m-fade-in" style={{ animationDelay: '0.15s' }}>
                <BuildingFilter
                    buildings={filteredBuildings}
                    meters={meters}
                    selectedBuildingId={selectedBuildingId}
                    onSelectBuilding={setSelectedBuildingId}
                    isMobile={isMobile}
                />
            </div>

            {/* Meters grouped by building */}
            {Object.entries(groupedMeters).map(([buildingId, buildingMeters], idx) => {
                const building = buildings.find(b => b.id === parseInt(buildingId));
                return (
                    <div key={buildingId} className="m-fade-in" style={{
                        marginBottom: '24px',
                        animationDelay: `${0.2 + idx * 0.05}s`
                    }}>
                        <h2 style={{
                            fontSize: isMobile ? '14px' : '15px',
                            fontWeight: '700',
                            marginBottom: '12px',
                            color: '#374151',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            {building?.name || t('common.unknownBuilding')}
                            <span style={{
                                fontSize: '11px',
                                fontWeight: '600',
                                padding: '2px 8px',
                                backgroundColor: '#f3f4f6',
                                borderRadius: '10px',
                                color: '#6b7280',
                                textTransform: 'none',
                                letterSpacing: '0'
                            }}>
                                {buildingMeters.length}
                            </span>
                        </h2>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                            gap: '16px'
                        }}>
                            {buildingMeters.map(meter => (
                                <MeterCard
                                    key={meter.id}
                                    meter={meter}
                                    users={users}
                                    loxoneStatus={loxoneStatus}
                                    mqttStatus={mqttStatus}
                                    onEdit={handleEdit}
                                    onReplace={handleReplaceClick}
                                    onDelete={handleDeleteClick}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}

            {filteredMeters.length === 0 && (
                <div className="m-fade-in" style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    padding: '60px 20px',
                    textAlign: 'center',
                    color: '#9ca3af',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
                }}>
                    <Zap size={32} color="#d1d5db" style={{ marginBottom: '12px' }} />
                    <p style={{ margin: 0 }}>{t('meters.noMeters')}</p>
                </div>
            )}

            {showInstructions && (
                <InstructionsModal onClose={() => setShowInstructions(false)} />
            )}

            {showModal && (
                <MeterFormModal
                    editingMeter={editingMeter}
                    formData={formData}
                    connectionConfig={connectionConfig}
                    buildings={buildings}
                    users={users}
                    isTestingConnection={isTestingConnection}
                    onSubmit={handleSubmit}
                    onCancel={handleCancel}
                    onFormDataChange={setFormData}
                    onConnectionConfigChange={setConnectionConfig}
                    onConnectionTypeChange={handleConnectionTypeChange}
                    onNameChange={handleNameChange}
                    onShowInstructions={() => setShowInstructions(true)}
                    onTestConnection={handleTestConnection}
                />
            )}

            {showDeleteConfirmation && deletionImpact && (
                <DeleteConfirmationModal
                    deletionImpact={deletionImpact}
                    deleteConfirmationText={deleteConfirmationText}
                    deleteUnderstandChecked={deleteUnderstandChecked}
                    captchaValid={captchaValid}
                    onConfirmationTextChange={setDeleteConfirmationText}
                    onUnderstandCheckChange={setDeleteUnderstandChecked}
                    onCaptchaValidationChange={setCaptchaValid}
                    onCancel={handleDeleteCancel}
                    onConfirm={handleDeleteConfirm}
                    t={t}
                />
            )}

            {showReplacementModal && meterToReplace && (
                <MeterReplacementModal
                    meter={meterToReplace}
                    onClose={() => {
                        setShowReplacementModal(false);
                        setMeterToReplace(null);
                    }}
                    onSuccess={handleReplacementSuccess}
                />
            )}

            {showExportModal && (
                <ExportModal
                    type="meters"
                    items={exportItems}
                    buildings={buildings.map(b => ({ id: b.id, name: b.name }))}
                    onClose={() => setShowExportModal(false)}
                    onExport={handleExport}
                />
            )}

            {/* Styles */}
            <style>{`
                @keyframes m-fadeSlideIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .m-fade-in {
                    animation: m-fadeSlideIn 0.4s ease-out both;
                }

                .m-stats-card {
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }
                .m-stats-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
                }

                .m-btn-primary:hover {
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4) !important;
                    transform: translateY(-1px);
                }

                .m-btn-secondary:hover {
                    background-color: #f9fafb !important;
                    border-color: #667eea !important;
                }

                @media (max-width: 768px) {
                    .m-stats-grid {
                        grid-template-columns: repeat(3, 1fr) !important;
                        gap: 8px !important;
                    }
                }

                @media (max-width: 480px) {
                    .m-stats-grid {
                        grid-template-columns: 1fr !important;
                    }
                }

                ${shimmerCSS}
            `}</style>
        </div>
    );
}

// ─── Stats Card ────────────────────────────────────────────────────

function StatsCard({ icon: Icon, label, value, color }: {
    icon: any;
    label: string;
    value: number;
    color: string;
}) {
    return (
        <div className="m-stats-card" style={{
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            borderLeft: `4px solid ${color}`
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '4px' }}>
                        {label}
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: '#1f2937', lineHeight: 1.1 }}>
                        {value}
                    </div>
                </div>
                <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    backgroundColor: color + '15',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                }}>
                    <Icon size={20} color={color} />
                </div>
            </div>
        </div>
    );
}

const shimmerCSS = `
    @keyframes m-shimmerAnim {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
    }
    .m-shimmer {
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200% 100%;
        animation: m-shimmerAnim 1.5s infinite;
    }
`;
