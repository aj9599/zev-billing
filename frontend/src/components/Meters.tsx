import { useState, useEffect } from 'react';
import { Plus, HelpCircle, Download, Search, Archive } from 'lucide-react';
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
        handleAddMeter,
        handleEdit,
        handleSubmit,
        handleCancel,
        handleConnectionTypeChange,
        handleNameChange,
        setFormData,
        setConnectionConfig
    } = useMeterForm(loadData, fetchConnectionStatus, meters); // Pass meters array here
    
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
        loadData();
        fetchConnectionStatus();

        const interval = setInterval(fetchConnectionStatus, 30000);
        return () => clearInterval(interval);
    }, [showArchived]);

    async function loadData() {
        const [metersData, buildingsData, usersData] = await Promise.all([
            api.getMeters(undefined, showArchived),
            api.getBuildings(),
            api.getUsers()
        ]);
        setMeters(metersData);
        setBuildings(buildingsData.filter(b => !b.is_group));
        setUsers(usersData);
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

    const handleExport = async (startDate: string, endDate: string, meterId?: number) => {
        try {
            const params = new URLSearchParams({
                type: 'meters',
                start_date: startDate,
                end_date: endDate
            });

            if (meterId) {
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

            const meterName = meterId ? meters.find(m => m.id === meterId)?.name.replace(/\s+/g, '-') : 'all';
            a.download = `meters-${meterName}-${startDate}-to-${endDate}.csv`;

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

    return (
        <div className="meters-container">
            <MetersHeader
                onAddMeter={handleAddMeter}
                onShowInstructions={() => setShowInstructions(true)}
                onShowExport={() => setShowExportModal(true)}
                showArchived={showArchived}
                onToggleArchived={setShowArchived}
            />

            <div style={{ marginBottom: '20px' }}>
                <div style={{ position: 'relative', maxWidth: '400px' }}>
                    <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                    <input
                        type="text"
                        placeholder={t('dashboard.searchBuildings')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 10px 10px 40px',
                            border: '1px solid #ddd',
                            borderRadius: '8px',
                            fontSize: '14px'
                        }}
                    />
                </div>
            </div>

            <BuildingFilter
                buildings={filteredBuildings}
                meters={meters}
                selectedBuildingId={selectedBuildingId}
                onSelectBuilding={setSelectedBuildingId}
            />

            {Object.entries(groupedMeters).map(([buildingId, buildingMeters]) => {
                const building = buildings.find(b => b.id === parseInt(buildingId));
                return (
                    <div key={buildingId} style={{ marginBottom: '30px' }}>
                        <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '16px', color: '#1f2937' }}>
                            {building?.name || t('common.unknownBuilding')}
                        </h2>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                            gap: '20px'
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
                <div style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    padding: '60px 20px',
                    textAlign: 'center',
                    color: '#999',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                    {t('meters.noMeters')}
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
                    onSubmit={handleSubmit}
                    onCancel={handleCancel}
                    onFormDataChange={setFormData}
                    onConnectionConfigChange={setConnectionConfig}
                    onConnectionTypeChange={handleConnectionTypeChange}
                    onNameChange={handleNameChange}
                    onShowInstructions={() => setShowInstructions(true)}
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

            <style>{`
                @media (max-width: 768px) {
                    .meters-container h1 {
                        font-size: 24px !important;
                    }
                    .meters-container h1 svg {
                        width: 24px !important;
                        height: 24px !important;
                    }
                    .meters-header {
                        flex-direction: column !important;
                        align-items: stretch !important;
                    }
                    .header-actions {
                        width: 100%;
                        flex-direction: column !important;
                    }
                    .header-actions button {
                        width: 100% !important;
                        justify-content: center !important;
                    }
                }
                @media (max-width: 480px) {
                    .meters-container h1 {
                        font-size: 20px !important;
                    }
                }
            `}</style>
        </div>
    );
}