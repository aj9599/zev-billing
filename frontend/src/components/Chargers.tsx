import { useState, useEffect } from 'react';
import { Search, Car, Wifi, Zap } from 'lucide-react';
import { api } from '../api/client';
import type { Charger, Building as BuildingType } from '../types';
import { useTranslation } from '../i18n';
import ExportModal from './ExportModal';
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
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

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
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadData();
    fetchStatusData();

    const interval = setInterval(() => {
      fetchStatusData();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [chargersData, buildingsData] = await Promise.all([
        api.getChargers(),
        api.getBuildings()
      ]);
      setChargers(chargersData);
      setBuildings(buildingsData.filter(b => !b.is_group));
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (startDate: string, endDate: string, chargerId?: number, chargerIds?: number[]) => {
    try {
      const params = new URLSearchParams({
        type: 'chargers',
        start_date: startDate,
        end_date: endDate
      });

      if (chargerIds && chargerIds.length > 0) {
        params.append('charger_ids', chargerIds.join(','));
      } else if (chargerId) {
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

      const chargerName = chargerIds && chargerIds.length > 0
        ? `${chargerIds.length}-selected`
        : chargerId ? chargers.find(c => c.id === chargerId)?.name.replace(/\s+/g, '-') : 'all';
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

  // Stats
  const totalChargers = chargers.length;
  const onlineChargers = chargers.filter(c => {
    if (c.connection_type === 'zaptec_api') return zaptecStatus[c.id]?.is_connected;
    return loxoneStatus[c.id]?.is_connected;
  }).length;
  const chargingNow = chargers.filter(c => {
    const live = liveData[c.id];
    if (!live) return false;
    if (c.connection_type === 'zaptec_api') {
      const zs = zaptecStatus[c.id];
      return zs?.state_description === 'Charging';
    }
    return live.state_description === 'Charging' || live.state === '3' || live.state === '67';
  }).length;

  const statsCards = [
    {
      label: t('chargers.totalChargers') || 'Total Chargers',
      value: totalChargers,
      color: '#3b82f6',
      icon: <Car size={20} />
    },
    {
      label: t('chargers.online') || 'Online',
      value: onlineChargers,
      color: '#10b981',
      icon: <Wifi size={20} />
    },
    {
      label: t('chargers.chargingNow') || 'Charging Now',
      value: chargingNow,
      color: '#f59e0b',
      icon: <Zap size={20} />
    }
  ];

  // Loading skeleton
  if (loading) {
    return (
      <div className="chargers-container">
        <ChargersHeader
          onAddCharger={handleAddCharger}
          onShowInstructions={() => setShowInstructions(true)}
          onShowExport={() => setShowExportModal(true)}
          isMobile={isMobile}
          t={t}
        />
        {/* Stats skeleton */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: '16px',
          marginBottom: '24px'
        }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              animation: 'ch-shimmer 1.5s ease-in-out infinite',
              animationDelay: `${i * 0.15}s`
            }}>
              <div style={{ width: '60%', height: '14px', backgroundColor: '#f3f4f6', borderRadius: '6px', marginBottom: '10px' }} />
              <div style={{ width: '40%', height: '28px', backgroundColor: '#f3f4f6', borderRadius: '6px' }} />
            </div>
          ))}
        </div>
        {/* Cards skeleton */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(380px, 1fr))',
          gap: '20px'
        }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              backgroundColor: 'white',
              borderRadius: '20px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              animation: 'ch-shimmer 1.5s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`
            }}>
              <div style={{ width: '50%', height: '18px', backgroundColor: '#f3f4f6', borderRadius: '6px', marginBottom: '8px' }} />
              <div style={{ width: '30%', height: '12px', backgroundColor: '#f3f4f6', borderRadius: '6px', marginBottom: '16px' }} />
              <div style={{ height: '100px', backgroundColor: '#f9fafb', borderRadius: '14px' }} />
            </div>
          ))}
        </div>
        <style>{`
          @keyframes ch-shimmer {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="chargers-container">
      <ChargersHeader
        onAddCharger={handleAddCharger}
        onShowInstructions={() => setShowInstructions(true)}
        onShowExport={() => setShowExportModal(true)}
        isMobile={isMobile}
        t={t}
      />

      {/* Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {statsCards.map((stat, idx) => (
          <div key={idx} style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '16px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            borderLeft: `4px solid ${stat.color}`,
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            animation: 'ch-fadeSlideIn 0.4s ease-out both',
            animationDelay: `${idx * 0.1}s`
          }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              backgroundColor: stat.color + '15',
              color: stat.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              {stat.icon}
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                {stat.label}
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#1f2937' }}>
                {stat.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      {buildings.length > 1 && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <div style={{
              position: 'relative',
              maxWidth: '400px',
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
            }}>
              <Search
                size={18}
                style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#9ca3af'
                }}
              />
              <input
                type="text"
                placeholder={t('dashboard.searchBuildings')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 42px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#667eea';
                  e.target.style.boxShadow = '0 0 0 3px rgba(102,126,234,0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e5e7eb';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
          </div>

          <BuildingFilter
            buildings={filteredBuildings}
            chargers={chargers}
            selectedBuildingId={selectedBuildingId}
            onBuildingSelect={setSelectedBuildingId}
            isMobile={isMobile}
            t={t}
          />
        </>
      )}

      {/* Charger Groups */}
      {Object.entries(groupedChargers).map(([buildingId, buildingChargers], groupIdx, arr) => {
        const building = buildings.find(b => b.id === parseInt(buildingId));
        return (
          <div key={buildingId} style={{
            marginBottom: '30px',
            position: 'relative',
            zIndex: arr.length - groupIdx,
            animation: 'ch-fadeSlideIn 0.4s ease-out both',
            animationDelay: `${0.2 + groupIdx * 0.1}s`
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '14px'
            }}>
              <h2 style={{
                fontSize: '15px',
                fontWeight: '700',
                color: '#6b7280',
                margin: 0,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                {building?.name || t('common.unknownBuilding')}
              </h2>
              <span style={{
                backgroundColor: '#f3f4f6',
                color: '#9ca3af',
                fontSize: '12px',
                fontWeight: '600',
                padding: '2px 10px',
                borderRadius: '10px'
              }}>
                {buildingChargers.length}
              </span>
            </div>
            <div className="chargers-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
              gap: '20px'
            }}>
              {buildingChargers.map((charger, cardIdx) => (
                <div key={charger.id} style={{
                  animation: 'ch-fadeSlideIn 0.4s ease-out both',
                  animationDelay: `${0.3 + cardIdx * 0.05}s`
                }}>
                  <ChargerCard
                    charger={charger}
                    liveData={liveData[charger.id]}
                    loxoneStatus={loxoneStatus[charger.id]}
                    zaptecStatus={zaptecStatus[charger.id]}
                    onEdit={() => handleEdit(charger)}
                    onDelete={() => handleDeleteClick(charger)}
                    t={t}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {filteredChargers.length === 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '60px 20px',
          textAlign: 'center',
          color: '#9ca3af',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          animation: 'ch-fadeSlideIn 0.4s ease-out'
        }}>
          <Car size={48} style={{ color: '#e5e7eb', marginBottom: '12px' }} />
          <p style={{ fontSize: '16px', fontWeight: '500' }}>
            {t('chargers.noChargers')}
          </p>
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
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .live-indicator {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @keyframes ch-fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes ch-shimmer {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @media (max-width: 768px) {
          .chargers-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }

          .charger-card {
            padding: 16px !important;
          }

          .button-group-header {
            width: 100%;
            justify-content: stretch !important;
          }

          .button-group-header button {
            flex: 1;
            justify-content: center;
          }

          .form-row {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 480px) {
          .button-group-header {
            flex-direction: column;
          }

          .button-group-header button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
