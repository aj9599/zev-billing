import { useState, useEffect } from 'react';
import { Folder, Home, Building, Zap, Activity, ChevronDown, ChevronRight, Search, Plus, HelpCircle } from 'lucide-react';
import { useTranslation } from '../i18n';
import { useBuildingData } from './buildings/hooks/useBuildingData';
import { useBuildingForm } from './buildings/hooks/useBuildingForm';
import { useExpandedComplexes } from './buildings/hooks/useExpandedComplexes';
import { getBuildingMeters, getBuildingChargers, getTotalApartments } from './buildings/utils/buildingUtils';
import BuildingFormModal from './buildings/components/BuildingFormModal';
import InstructionsModal from './buildings/components/InstructionsModal';
import EnergyFlowCard from './buildings/components/EnergyFlowCard';
import ComplexCard from './buildings/components/ComplexCard';
import type { Building as BuildingType } from '../types';

export default function Buildings() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [expandedBuildings, setExpandedBuildings] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('expandedBuildings');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Custom hooks
  const { buildings, meters, chargers, consumptionData, loading, loadData } = useBuildingData();
  const { expandedComplexes, toggleComplex } = useExpandedComplexes();
  const {
    editingBuilding,
    formData,
    setFormData,
    handleSubmit,
    handleEdit,
    resetForm,
    setEditingBuilding
  } = useBuildingForm(loadData);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Filter buildings
  const complexes = buildings.filter(b => b.is_group);
  const standaloneBuildings = buildings.filter(
    b => !b.is_group && !complexes.some(c => c.group_buildings?.includes(b.id))
  );

  const filteredComplexes = complexes.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.address_street?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.address_city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredStandalone = standaloneBuildings.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.address_street?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.address_city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Compute stats
  const allNonGroupBuildings = buildings.filter(b => !b.is_group);
  const totalMeters = meters.length;
  const totalChargers = chargers.length;
  const totalApartments = allNonGroupBuildings.reduce((sum, b) => sum + getTotalApartments(b), 0);
  const solarBuildings = allNonGroupBuildings.filter(b =>
    getBuildingMeters(b.id, meters).some(m => m.meter_type === 'solar_meter')
  ).length;

  const handleOpenModal = () => {
    resetForm();
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingBuilding(null);
  };

  const handleEditBuilding = (building: BuildingType) => {
    handleEdit(building);
    setShowModal(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    const success = await handleSubmit(e);
    if (success) {
      handleCloseModal();
    }
  };

  const toggleBuilding = (buildingId: number) => {
    const newExpanded = new Set(expandedBuildings);
    if (newExpanded.has(buildingId)) {
      newExpanded.delete(buildingId);
    } else {
      newExpanded.add(buildingId);
    }
    setExpandedBuildings(newExpanded);
    try {
      localStorage.setItem('expandedBuildings', JSON.stringify(Array.from(newExpanded)));
    } catch {}
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="buildings-container">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="b-shimmer" style={{ height: '60px', borderRadius: '12px', background: '#f0f0f0' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="b-shimmer" style={{ height: '100px', borderRadius: '12px', background: '#f0f0f0' }} />
            ))}
          </div>
          <div className="b-shimmer" style={{ height: '80px', borderRadius: '12px', background: '#f0f0f0' }} />
          {[1,2].map(i => (
            <div key={i} className="b-shimmer" style={{ height: '60px', borderRadius: '12px', background: '#f0f0f0' }} />
          ))}
        </div>
        <style>{shimmerCSS}</style>
      </div>
    );
  }

  return (
    <div className="buildings-container">

      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="b-fade-in" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: isMobile ? '20px' : '28px',
        gap: '15px',
        flexWrap: 'wrap'
      }}>
        <div>
          <h1 style={{
            fontSize: isMobile ? '24px' : '32px',
            fontWeight: '800',
            marginBottom: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '8px' : '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            <Building size={isMobile ? 24 : 32} style={{ color: '#667eea' }} />
            {t('buildings.title')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: isMobile ? '13px' : '15px', margin: 0 }}>
            {t('buildings.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowInstructions(true)}
            className="b-btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: isMobile ? '8px 14px' : '8px 16px',
              backgroundColor: 'white',
              color: '#667eea',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <HelpCircle size={16} />
            {!isMobile && t('buildings.setupInstructions')}
          </button>
          <button
            onClick={handleOpenModal}
            className="b-btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: isMobile ? '8px 14px' : '8px 16px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
            }}
          >
            <Plus size={16} />
            {isMobile ? t('common.add') : t('buildings.addBuilding')}
          </button>
        </div>
      </div>

      {/* ─── Stats Row ──────────────────────────────────────────── */}
      <div className="b-fade-in b-stats-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
        marginBottom: '20px',
        animationDelay: '0.05s'
      }}>
        <StatsCard
          icon={Building}
          label={t('buildings.title')}
          value={allNonGroupBuildings.length}
          color="#3b82f6"
          sublabel={complexes.length > 0 ? `${complexes.length} ${t('buildings.complexes')}` : undefined}
        />
        <StatsCard
          icon={Zap}
          label={t('buildings.metersCount')}
          value={totalMeters}
          color="#f59e0b"
        />
        <StatsCard
          icon={Activity}
          label={t('buildings.chargersCount')}
          value={totalChargers}
          color="#8b5cf6"
        />
        {totalApartments > 0 && (
          <StatsCard
            icon={Home}
            label={t('buildings.apartmentsCount')}
            value={totalApartments}
            color="#10b981"
            sublabel={`${solarBuildings} ${t('buildings.withSolar')}`}
          />
        )}
      </div>

      {/* ─── Search + Filter Bar ────────────────────────────────── */}
      <div className="b-fade-in" style={{
        backgroundColor: 'white',
        padding: isMobile ? '12px' : '12px 16px',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        animationDelay: '0.1s'
      }}>
        <Search size={18} color="#9ca3af" style={{ flexShrink: 0 }} />
        <input
          type="text"
          placeholder={t('buildings.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="b-search-input"
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
          <span style={{ fontSize: '12px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
            {filteredComplexes.length + filteredStandalone.length} {t('buildings.results')}
          </span>
        )}
      </div>

      {/* ─── Complexes Section ──────────────────────────────────── */}
      {filteredComplexes.length > 0 && (
        <div className="b-fade-in" style={{ marginBottom: '24px', animationDelay: '0.15s' }}>
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
            <Folder size={16} color="#667eea" />
            {t('buildings.complexes')}
          </h2>
          {filteredComplexes.map(complex => (
            <ComplexCard
              key={complex.id}
              complex={complex}
              buildings={buildings}
              meters={meters}
              chargers={chargers}
              consumptionData={consumptionData}
              isExpanded={expandedComplexes.has(complex.id)}
              onToggleExpand={toggleComplex}
              onEdit={handleEditBuilding}
              onDelete={loadData}
              isMobile={isMobile}
            />
          ))}
        </div>
      )}

      {/* ─── Standalone Buildings Section ───────────────────────── */}
      {filteredStandalone.length > 0 && (
        <div className="b-fade-in" style={{ animationDelay: '0.2s' }}>
          {filteredComplexes.length > 0 && (
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
              <Home size={16} color="#667eea" />
              {t('buildings.standaloneBuildings')}
            </h2>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredStandalone.map(building => {
              const isExpanded = expandedBuildings.has(building.id);
              const buildingMeters = getBuildingMeters(building.id, meters);
              const buildingChargers = getBuildingChargers(building.id, chargers);
              const hasSolar = buildingMeters.some(m => m.meter_type === 'solar_meter');
              const aptCount = getTotalApartments(building);

              return (
                <div
                  key={building.id}
                  className="b-building-card"
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    overflow: 'hidden',
                    transition: 'box-shadow 0.2s ease'
                  }}
                >
                  {/* Collapsible header */}
                  <div
                    onClick={() => toggleBuilding(building.id)}
                    style={{
                      padding: isMobile ? '14px 16px' : '16px 24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      userSelect: 'none',
                      borderBottom: isExpanded ? '1px solid #f3f4f6' : 'none',
                      transition: 'background-color 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fafafa'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                      {isExpanded ? (
                        <ChevronDown size={18} color="#667eea" />
                      ) : (
                        <ChevronRight size={18} color="#667eea" />
                      )}
                      <Home size={18} color="#667eea" style={{ flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h3 style={{
                          fontSize: isMobile ? '15px' : '16px',
                          fontWeight: '600',
                          margin: 0,
                          color: '#1f2937',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {building.name}
                        </h3>
                        {(building.address_street || building.address_city) && (
                          <p style={{
                            fontSize: '12px',
                            color: '#9ca3af',
                            margin: '2px 0 0 0',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {building.address_street && <>{building.address_street}, </>}
                            {building.address_zip && building.address_city && `${building.address_zip} ${building.address_city}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px', flexShrink: 0 }}>
                      {hasSolar && (
                        <span style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          backgroundColor: '#fef3c7',
                          color: '#d97706',
                          borderRadius: '6px',
                          fontWeight: '600'
                        }}>
                          Solar
                        </span>
                      )}
                      {building.has_apartments && (
                        <span style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          backgroundColor: '#dbeafe',
                          color: '#1e40af',
                          borderRadius: '6px',
                          fontWeight: '600'
                        }}>
                          {aptCount} Apt
                        </span>
                      )}
                      <span style={{
                        fontSize: '12px',
                        color: '#9ca3af',
                        display: isMobile ? 'none' : 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <Zap size={12} /> {buildingMeters.length}
                      </span>
                      {buildingChargers.length > 0 && (
                        <span style={{
                          fontSize: '12px',
                          color: '#9ca3af',
                          display: isMobile ? 'none' : 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Activity size={12} /> {buildingChargers.length}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div style={{ padding: 0 }}>
                      <EnergyFlowCard
                        building={building}
                        meters={meters}
                        chargers={chargers}
                        consumptionData={consumptionData}
                        onEdit={handleEditBuilding}
                        onDelete={loadData}
                        isMobile={isMobile}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Empty State ────────────────────────────────────────── */}
      {filteredComplexes.length === 0 && filteredStandalone.length === 0 && (
        <div className="b-fade-in" style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: isMobile ? '40px 20px' : '60px 20px',
          textAlign: 'center',
          color: '#9ca3af',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
        }}>
          <Building size={40} color="#d1d5db" style={{ marginBottom: '12px' }} />
          <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
            {searchQuery ? t('buildings.noResults') : t('buildings.noBuildings')}
          </p>
        </div>
      )}

      {/* ─── Modals ─────────────────────────────────────────────── */}
      {showInstructions && (
        <InstructionsModal
          onClose={() => setShowInstructions(false)}
          isMobile={isMobile}
        />
      )}

      {showModal && (
        <BuildingFormModal
          editingBuilding={editingBuilding}
          formData={formData}
          setFormData={setFormData}
          buildings={buildings}
          onSubmit={onSubmit}
          onClose={handleCloseModal}
          isMobile={isMobile}
        />
      )}

      {/* ─── Styles ─────────────────────────────────────────────── */}
      <style>{`
        @keyframes b-fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes b-shimmerAnim {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .b-fade-in {
          animation: b-fadeSlideIn 0.4s ease-out both;
        }

        .b-shimmer {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%) !important;
          background-size: 200% 100% !important;
          animation: b-shimmerAnim 1.5s infinite;
        }

        .b-building-card:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
        }

        .b-stats-card {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .b-stats-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
        }

        .b-btn-primary:hover {
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4) !important;
          transform: translateY(-1px);
        }

        .b-btn-secondary:hover {
          background-color: #f9fafb !important;
          border-color: #667eea !important;
        }

        .b-search-input::placeholder {
          color: #9ca3af;
        }

        @media (max-width: 768px) {
          .b-stats-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
          }
        }

        @media (max-width: 480px) {
          .b-stats-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

// ─── Stats Card component ──────────────────────────────────────────

function StatsCard({ icon: Icon, label, value, color, sublabel }: {
  icon: any;
  label: string;
  value: number;
  color: string;
  sublabel?: string;
}) {
  return (
    <div className="b-stats-card" style={{
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
          {sublabel && (
            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
              {sublabel}
            </div>
          )}
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
  @keyframes b-shimmerAnim {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  .b-shimmer {
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%) !important;
    background-size: 200% 100% !important;
    animation: b-shimmerAnim 1.5s infinite;
  }
`;
