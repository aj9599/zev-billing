import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { Charger, Building as BuildingType } from '../types';
import { useTranslation } from '../i18n';
import ExportModal from '../components/ExportModal';
import ChargersHeader from './chargers/ChargersHeader';
import BuildingFilter from './chargers/BuildingFilter';
import ChargerCard from './chargers/ChargerCard';
import InstructionsModal from './chargers/InstructionsModal';
import DeleteConfirmationModal from './chargers/DeleteConfirmationModal';
import ChargerFormModal from './chargers/ChargerFormModal';
import { useChargerStatus } from './chargers/hooks/useChargerStatus';
import { useChargerDeletion } from './chargers/hooks/useChargerDeletion';
import { useChargerForm } from './chargers/hooks/useChargerForm';
import { groupChargersByBuilding } from './chargers/utils/chargerUtils';

export default function Chargers() {
  const { t } = useTranslation();
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Custom hooks
  const { liveData, loxoneStatus, zaptecStatus, fetchStatusData } = useChargerStatus();
  
  const {
    showDeleteConfirmation,
    deletionImpact,
    deleteConfirmationText,
    deleteUnderstandChecked,
    captchaValid,
    setDeleteConfirmationText,
    setDeleteUnderstandChecked,
    setCaptchaValid,
    handleDeleteClick,
    handleDeleteConfirm,
    handleDeleteCancel
  } = useChargerDeletion(() => {
    loadData();
    fetchStatusData();
  });

  const {
    showModal,
    editingCharger,
    formData,
    connectionConfig,
    setFormData,
    setConnectionConfig,
    handleSubmit,
    handleEdit,
    handleAddCharger,
    handleCloseModal,
    handlePresetChange
  } = useChargerForm(() => {
    loadData();
    setTimeout(fetchStatusData, 2000);
  });

  useEffect(() => {
    loadData();
    fetchStatusData();

    // Poll for live data every 5 seconds for real-time updates
    const interval = setInterval(() => {
      fetchStatusData();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    const [chargersData, buildingsData] = await Promise.all([
      api.getChargers(),
      api.getBuildings()
    ]);
    setChargers(chargersData);
    setBuildings(buildingsData.filter(b => !b.is_group));
  };

  const handleExport = async (startDate: string, endDate: string, chargerId?: number) => {
    try {
      const params = new URLSearchParams({
        type: 'chargers',
        start_date: startDate,
        end_date: endDate
      });

      if (chargerId) {
        params.append('charger_id', chargerId.toString());
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

      const chargerName = chargerId ? chargers.find(c => c.id === chargerId)?.name.replace(/\s+/g, '-') : 'all';
      a.download = `chargers-${chargerName}-${startDate}-to-${endDate}.csv`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch (error) {
      console.error('Export error:', error);
      alert(t('chargers.exportFailed') || 'Export failed. Please try again.');
    }
  };

  const filteredBuildings = buildings.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredChargers = selectedBuildingId
    ? chargers.filter(c => c.building_id === selectedBuildingId)
    : chargers;

  const groupedChargers = groupChargersByBuilding(filteredChargers);

  const exportItems = chargers.map(c => {
    const building = buildings.find(b => b.id === c.building_id);
    return {
      id: c.id,
      name: c.name,
      building_id: c.building_id,
      building_name: building?.name || 'Unknown Building'
    };
  });

  return (
    <div className="chargers-container">
      <ChargersHeader
        onAddCharger={handleAddCharger}
        onShowInstructions={() => setShowInstructions(true)}
        onShowExport={() => setShowExportModal(true)}
        t={t}
      />

      <BuildingFilter
        buildings={filteredBuildings}
        chargers={chargers}
        selectedBuildingId={selectedBuildingId}
        searchQuery={searchQuery}
        onBuildingSelect={setSelectedBuildingId}
        onSearchChange={setSearchQuery}
        t={t}
      />

      {Object.entries(groupedChargers).map(([buildingId, buildingChargers]) => {
        const building = buildings.find(b => b.id === parseInt(buildingId));
        return (
          <div key={buildingId} style={{ marginBottom: '30px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '16px', color: '#1f2937' }}>
              {building?.name || t('common.unknownBuilding')}
            </h2>
            <div className="chargers-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
              gap: '20px'
            }}>
              {buildingChargers.map(charger => (
                <ChargerCard
                  key={charger.id}
                  charger={charger}
                  liveData={liveData[charger.id]}
                  loxoneStatus={loxoneStatus[charger.id]}
                  zaptecStatus={zaptecStatus[charger.id]}
                  onEdit={() => handleEdit(charger)}
                  onDelete={() => handleDeleteClick(charger)}
                  t={t}
                />
              ))}
            </div>
          </div>
        );
      })}

      {filteredChargers.length === 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '60px 20px',
          textAlign: 'center',
          color: '#999',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          {t('chargers.noChargers')}
        </div>
      )}

      {showInstructions && (
        <InstructionsModal
          onClose={() => setShowInstructions(false)}
          t={t}
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

      {showExportModal && (
        <ExportModal
          type="chargers"
          items={exportItems}
          buildings={buildings.map(b => ({ id: b.id, name: b.name }))}
          onClose={() => setShowExportModal(false)}
          onExport={handleExport}
        />
      )}

      {showModal && (
        <ChargerFormModal
          editingCharger={editingCharger}
          formData={formData}
          connectionConfig={connectionConfig}
          buildings={buildings}
          onSubmit={handleSubmit}
          onClose={handleCloseModal}
          onFormDataChange={setFormData}
          onConnectionConfigChange={setConnectionConfig}
          onPresetChange={handlePresetChange}
          onShowInstructions={() => setShowInstructions(true)}
          t={t}
        />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        .live-indicator {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @media (max-width: 768px) {
          .chargers-container .chargers-header h1 {
            font-size: 24px !important;
          }

          .chargers-container .chargers-header h1 svg {
            width: 24px !important;
            height: 24px !important;
          }

          .chargers-container .chargers-header p {
            font-size: 14px !important;
          }

          .button-group-header {
            width: 100%;
            justify-content: stretch !important;
          }

          .button-group-header button {
            flex: 1;
            justify-content: center;
          }

          .building-cards-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }

          .chargers-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }

          .charger-card {
            padding: 20px !important;
          }

          .charger-card h3 {
            font-size: 18px !important;
          }

          .modal-content h2 {
            font-size: 20px !important;
          }

          .instructions-modal {
            padding: 20px !important;
          }

          .instructions-modal h2 {
            font-size: 20px !important;
          }

          .instructions-modal h3 {
            font-size: 16px !important;
          }

          .form-row {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 480px) {
          .chargers-container .chargers-header h1 {
            font-size: 20px !important;
            gap: 8px !important;
          }

          .chargers-container .chargers-header h1 svg {
            width: 20px !important;
            height: 20px !important;
          }

          .button-group-header {
            flex-direction: column;
          }

          .button-group-header button {
            width: 100%;
          }

          .building-cards-grid > div {
            padding: 16px !important;
          }

          .building-cards-grid h3 {
            font-size: 16px !important;
          }

          .charger-card {
            padding: 16px !important;
          }

          .charger-card h3 {
            font-size: 16px !important;
          }

          .modal-content {
            padding: 20px !important;
          }

          .instructions-modal {
            padding: 16px !important;
          }

          .instructions-modal h2 {
            font-size: 18px !important;
          }

          .instructions-modal h3 {
            font-size: 15px !important;
          }

          .instructions-modal div {
            font-size: 13px !important;
          }
        }
      `}</style>
    </div>
  );
}