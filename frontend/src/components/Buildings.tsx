import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Building, Search, MapPin, Zap, ChevronRight, ChevronDown, Folder, Home, HelpCircle, Activity, Sun, Grid, ArrowRight, ArrowLeft, Layers, Check } from 'lucide-react';
import { api } from '../api/client';
import type { Building as BuildingType, Meter, Charger, BuildingConsumption } from '../types';
import { useTranslation } from '../i18n';

export default function Buildings() {
  const { t } = useTranslation();
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [consumptionData, setConsumptionData] = useState<BuildingConsumption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<BuildingType | null>(null);
  const [expandedComplexes, setExpandedComplexes] = useState<Set<number>>(new Set());
  const [formData, setFormData] = useState<Partial<BuildingType>>({
    name: '',
    address_street: '',
    address_city: '',
    address_zip: '',
    address_country: 'Switzerland',
    notes: '',
    is_group: false,
    group_buildings: [],
    has_apartments: false,
    floors_config: []
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [buildingsData, metersData, chargersData, consumptionData] = await Promise.all([
        api.getBuildings(),
        api.getMeters(),
        api.getChargers(),
        api.getConsumptionByBuilding('24h')
      ]);
      setBuildings(buildingsData);
      setMeters(metersData);
      setChargers(chargersData);
      setConsumptionData(consumptionData);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBuilding) {
        await api.updateBuilding(editingBuilding.id, formData);
      } else {
        await api.createBuilding(formData);
      }
      setShowModal(false);
      setEditingBuilding(null);
      resetForm();
      loadData();
    } catch (err) {
      alert(t('buildings.saveFailed'));
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm(t('buildings.deleteConfirm'))) {
      try {
        await api.deleteBuilding(id);
        loadData();
      } catch (err) {
        alert(t('buildings.deleteFailed'));
      }
    }
  };

  const handleEdit = (building: BuildingType) => {
    setEditingBuilding(building);
    setFormData({
      ...building,
      floors_config: building.floors_config || []
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      address_street: '',
      address_city: '',
      address_zip: '',
      address_country: 'Switzerland',
      notes: '',
      is_group: false,
      group_buildings: [],
      has_apartments: false,
      floors_config: []
    });
  };

  const toggleComplex = (complexId: number) => {
    const newExpanded = new Set(expandedComplexes);
    if (newExpanded.has(complexId)) {
      newExpanded.delete(complexId);
    } else {
      newExpanded.add(complexId);
    }
    setExpandedComplexes(newExpanded);
  };

  const toggleGroupBuilding = (buildingId: number) => {
    const current = formData.group_buildings || [];
    if (current.includes(buildingId)) {
      setFormData({ ...formData, group_buildings: current.filter(id => id !== buildingId) });
    } else {
      setFormData({ ...formData, group_buildings: [...current, buildingId] });
    }
  };

  const getBuildingMeters = (buildingId: number) => meters.filter(m => m.building_id === buildingId);
  const getBuildingChargers = (buildingId: number) => chargers.filter(c => c.building_id === buildingId);
  
  const getBuildingConsumption = (buildingId: number) => {
    const data = consumptionData.find(d => d.building_id === buildingId);
    if (!data) return { total: 0, solar: 0, charging: 0, actualHouseConsumption: 0, gridPower: 0, solarProduction: 0, solarToGrid: 0 };
    
    const buildingMeters = data.meters || [];
    let mainMeterPower = 0; // positive = importing, negative = exporting
    let solarPower = 0; // production (should be negative or we take absolute)
    let charging = 0;
    
    buildingMeters.forEach(meter => {
      const latestData = meter.data?.[meter.data.length - 1];
      if (!latestData) return;
      
      // Only consider main meter (total_meter) for grid import/export
      if (meter.meter_type === 'total_meter') {
        mainMeterPower += latestData.power / 1000;
      } 
      // Only solar meter for production
      else if (meter.meter_type === 'solar_meter') {
        solarPower += latestData.power / 1000;
      } 
      // Track charging separately for display only
      else if (meter.meter_type === 'charger') {
        charging += latestData.power / 1000;
      }
    });
    
    // Solar production is always positive (absolute value)
    const solarProduction = Math.abs(solarPower);
    
    // Grid power from main meter (positive = importing, negative = exporting)
    const gridPower = mainMeterPower;
    
    // Actual house consumption = solar production + main meter power
    // If main meter is positive (importing), house uses solar + grid
    // If main meter is negative (exporting), house uses solar - export amount
    const actualHouseConsumption = solarProduction + mainMeterPower;
    
    // Solar directly to grid (only when exporting)
    const solarToGrid = gridPower < 0 ? Math.abs(gridPower) : 0;
    
    return { 
      total: mainMeterPower, 
      solar: solarPower, 
      charging,
      actualHouseConsumption,
      gridPower,
      solarProduction,
      solarToGrid
    };
  };

  const complexes = buildings.filter(b => b.is_group);
  const standaloneBuildings = buildings.filter(b => !b.is_group && !complexes.some(c => c.group_buildings?.includes(b.id)));
  const availableBuildings = buildings.filter(b => !b.is_group && b.id !== editingBuilding?.id);

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

  // Energy Flow Card Component with FIXED logic
  const EnergyFlowCard = ({ building }: { building: BuildingType }) => {
    const consumption = getBuildingConsumption(building.id);
    const { actualHouseConsumption, gridPower, solarProduction, solarToGrid } = consumption;
    const solarCoverage = actualHouseConsumption > 0 ? (solarProduction / actualHouseConsumption * 100) : 0;
    const isExporting = gridPower < 0;
    const isImporting = gridPower > 0;
    const solarToHouse = solarProduction - solarToGrid;

    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '32px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        border: '2px solid #f0f0f0',
        marginBottom: '16px',
        position: 'relative'
      }}>
        {/* Edit/Delete buttons in top right corner */}
        <div style={{ 
          position: 'absolute', 
          top: '16px', 
          right: '16px', 
          display: 'flex', 
          gap: '8px',
          zIndex: 10
        }}>
          <button 
            onClick={() => handleEdit(building)}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title={t('common.edit')}
          >
            <Edit2 size={16} />
          </button>
          <button 
            onClick={() => handleDelete(building.id)}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title={t('common.delete')}
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* Header with building name */}
        <div style={{ marginBottom: '32px', textAlign: 'center', paddingRight: '100px' }}>
          <h3 style={{ 
            fontSize: '24px', 
            fontWeight: '700', 
            margin: 0,
            color: '#1f2937',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px'
          }}>
            <Home size={28} color="#667eea" />
            {building.name}
            {building.has_apartments && (
              <span style={{
                fontSize: '11px',
                padding: '4px 10px',
                backgroundColor: '#dbeafe',
                color: '#1e40af',
                borderRadius: '6px',
                fontWeight: '600',
                marginLeft: '8px'
              }}>
                {t('buildings.apartmentBuilding')}
              </span>
            )}
          </h3>
          {(building.address_street || building.address_city) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '8px' }}>
              <MapPin size={14} color="#9ca3af" />
              <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
                {building.address_street && <>{building.address_street}, </>}
                {building.address_zip && building.address_city && `${building.address_zip} ${building.address_city}`}
              </p>
            </div>
          )}
        </div>

        {/* Energy Flow Diagram - FIXED LOGIC */}
        <div style={{ 
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '24px',
          marginBottom: '32px',
          minHeight: '200px',
          position: 'relative'
        }}>
          {/* Solar Production (only show if exists) */}
          {solarProduction > 0 && (
            <>
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{
                  width: '100px',
                  height: '100px',
                  borderRadius: '50%',
                  backgroundColor: '#fef3c7',
                  border: '4px solid #f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px'
                }}>
                  <Sun size={40} color="#f59e0b" />
                </div>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
                  {t('buildings.energyFlow.solar')}
                </span>
                <span style={{ fontSize: '24px', fontWeight: '800', color: '#f59e0b' }}>
                  {solarProduction.toFixed(3)} kW
                </span>
                <span style={{ fontSize: '12px', color: '#22c55e', fontWeight: '600' }}>
                  {t('buildings.energyFlow.production')}
                </span>
              </div>

              {/* Arrow from Solar to Building */}
              <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'column', gap: '4px' }}>
                <ArrowRight size={32} color="#22c55e" strokeWidth={3} />
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#22c55e' }}>
                  {solarToHouse.toFixed(2)} kW
                </span>
              </div>
            </>
          )}

          {/* Building Consumption - CENTERED */}
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}>
            <div style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              backgroundColor: '#dbeafe',
              border: '4px solid #3b82f6',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px'
            }}>
              <Building size={48} color="#3b82f6" />
            </div>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
              {t('buildings.energyFlow.consumption')}
            </span>
            <span style={{ fontSize: '28px', fontWeight: '800', color: '#3b82f6' }}>
              {actualHouseConsumption.toFixed(3)} kW
            </span>
            {solarCoverage > 0 && (
              <div style={{
                marginTop: '8px',
                padding: '4px 12px',
                backgroundColor: '#ecfdf5',
                borderRadius: '12px',
                border: '1px solid #22c55e'
              }}>
                <span style={{ fontSize: '12px', color: '#22c55e', fontWeight: '700' }}>
                  {t('buildings.energyFlow.solarCoverage')}: {solarCoverage.toFixed(1)}%
                </span>
              </div>
            )}
          </div>

          {/* Arrow between Building and Grid */}
          <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'column', gap: '4px' }}>
            {isExporting ? (
              <>
                <ArrowRight size={32} color="#22c55e" strokeWidth={3} />
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#22c55e' }}>
                  {Math.abs(gridPower).toFixed(2)} kW
                </span>
                <span style={{ fontSize: '10px', color: '#22c55e' }}>
                  {t('buildings.energyFlow.feedIn')}
                </span>
              </>
            ) : isImporting ? (
              <>
                <ArrowLeft size={32} color="#ef4444" strokeWidth={3} />
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#ef4444' }}>
                  {gridPower.toFixed(2)} kW
                </span>
                <span style={{ fontSize: '10px', color: '#ef4444' }}>
                  {t('buildings.energyFlow.gridPower')}
                </span>
              </>
            ) : (
              <ArrowLeft size={32} color="#e5e7eb" strokeWidth={3} />
            )}
          </div>

          {/* Grid */}
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              backgroundColor: isExporting ? '#ecfdf5' : '#fee2e2',
              border: `4px solid ${isExporting ? '#22c55e' : '#ef4444'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px'
            }}>
              <Grid size={40} color={isExporting ? '#22c55e' : '#ef4444'} />
            </div>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
              {t('buildings.energyFlow.grid')}
            </span>
            <span style={{ fontSize: '24px', fontWeight: '800', color: isExporting ? '#22c55e' : '#ef4444' }}>
              {Math.abs(gridPower).toFixed(3)} kW
            </span>
            <span style={{ fontSize: '12px', color: isExporting ? '#22c55e' : '#ef4444', fontWeight: '600' }}>
              {isExporting ? t('buildings.energyFlow.selling') : t('buildings.energyFlow.buying')}
            </span>
          </div>

          {/* Solar to Grid Arrow (only when exporting and solar exists) */}
          {isExporting && solarProduction > 0 && (
            <>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                flexDirection: 'column', 
                gap: '4px',
                position: 'absolute',
                top: '0',
                left: '50%',
                transform: 'translateX(-50%)'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  borderRadius: '20px',
                  border: '2px dashed #22c55e'
                }}>
                  <Sun size={16} color="#f59e0b" />
                  <ArrowRight size={20} color="#22c55e" strokeWidth={3} />
                  <Grid size={16} color="#22c55e" />
                  <span style={{ fontSize: '11px', fontWeight: '600', color: '#22c55e', marginLeft: '4px' }}>
                    {solarToGrid.toFixed(2)} kW
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Stats Row */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: building.has_apartments ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', 
          gap: '16px',
          paddingTop: '24px',
          borderTop: '2px solid #f3f4f6'
        }}>
          <div style={{ textAlign: 'center', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
              <Zap size={18} color="#f59e0b" />
              <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '600' }}>
                {t('buildings.metersCount')}
              </span>
            </div>
            <span style={{ fontSize: '24px', fontWeight: '800', color: '#1f2937' }}>
              {getBuildingMeters(building.id).length}
            </span>
          </div>
          
          <div style={{ textAlign: 'center', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
              <Activity size={18} color="#3b82f6" />
              <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '600' }}>
                {t('buildings.chargersCount')}
              </span>
            </div>
            <span style={{ fontSize: '24px', fontWeight: '800', color: '#1f2937' }}>
              {getBuildingChargers(building.id).length}
            </span>
          </div>

          {building.has_apartments && (
            <div style={{ textAlign: 'center', padding: '16px', backgroundColor: '#dbeafe', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                <Home size={18} color="#1e40af" />
                <span style={{ fontSize: '13px', color: '#1e40af', fontWeight: '600' }}>
                  {t('buildings.apartmentsCount')}
                </span>
              </div>
              <span style={{ fontSize: '24px', fontWeight: '800', color: '#1e40af' }}>
                {building.floors_config?.reduce((sum, floor) => sum + floor.apartments.length, 0) || 0}
              </span>
            </div>
          )}

          {consumption.charging > 0 && (
            <div style={{ textAlign: 'center', padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                <Zap size={18} color="#22c55e" />
                <span style={{ fontSize: '13px', color: '#22c55e', fontWeight: '600' }}>
                  {t('buildings.charging')}
                </span>
              </div>
              <span style={{ fontSize: '24px', fontWeight: '800', color: '#22c55e' }}>
                {consumption.charging.toFixed(2)} kW
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const ComplexCard = ({ complex }: { complex: BuildingType }) => {
    const isExpanded = expandedComplexes.has(complex.id);
    const buildingsInComplex = buildings.filter(b => complex.group_buildings?.includes(b.id));
    
    return (
      <div style={{ marginBottom: '20px' }}>
        <div 
          onClick={() => toggleComplex(complex.id)}
          style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.07)',
            border: '2px solid #667eea',
            position: 'relative',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 8px 12px rgba(0,0,0,0.12)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.07)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div style={{ 
            position: 'absolute', 
            top: '16px', 
            right: '16px', 
            display: 'flex', 
            gap: '8px' 
          }}>
            <button 
              onClick={(e) => { e.stopPropagation(); handleEdit(complex); }}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: 'none',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              title={t('common.edit')}
            >
              <Edit2 size={16} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); handleDelete(complex.id); }}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: 'none',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              title={t('common.delete')}
            >
              <Trash2 size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingRight: '72px' }}>
            {isExpanded ? <ChevronDown size={24} color="#667eea" /> : <ChevronRight size={24} color="#667eea" />}
            <Folder size={24} color="#667eea" />
            <div style={{ flex: 1 }}>
              <h3 style={{ 
                fontSize: '22px', 
                fontWeight: '700', 
                margin: 0,
                color: '#667eea',
                lineHeight: '1.3'
              }}>
                {complex.name}
              </h3>
              <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>
                {buildingsInComplex.length} {t('buildings.buildingsInComplex')}
              </p>
            </div>
          </div>
        </div>

        {isExpanded && (
          <div style={{ marginTop: '16px' }}>
            {buildingsInComplex.map(building => (
              <EnergyFlowCard key={building.id} building={building} />
            ))}
          </div>
        )}
      </div>
    );
  };

  // LEGO-Style Apartment Configuration Component
  const LegoApartmentBuilder = () => {
    const [dragType, setDragType] = useState<string | null>(null);
    const [dragData, setDragData] = useState<any>(null);
    const [editingFloor, setEditingFloor] = useState<number | null>(null);
    const [editingApt, setEditingApt] = useState<{floorIdx: number, aptIdx: number} | null>(null);
    const [editValue, setEditValue] = useState('');

    const DRAG_TYPES = {
      PALETTE_FLOOR: 'palette/floor',
      PALETTE_APT: 'palette/apartment',
      EXISTING_APT: 'existing/apartment',
    };

    const addFloor = () => {
      const floors = formData.floors_config || [];
      const newFloorNumber = floors.length + 1;
      setFormData({
        ...formData,
        floors_config: [
          {
            floor_number: newFloorNumber,
            floor_name: `${t('buildings.floor')} ${newFloorNumber}`,
            apartments: []
          },
          ...floors
        ]
      });
    };

    const removeFloor = (index: number) => {
      const floors = formData.floors_config || [];
      setFormData({
        ...formData,
        floors_config: floors.filter((_, i) => i !== index)
      });
    };

    const updateFloorName = (index: number, name: string) => {
      const floors = [...(formData.floors_config || [])];
      floors[index] = { ...floors[index], floor_name: name };
      setFormData({ ...formData, floors_config: floors });
    };

    const addApartmentToFloor = (floorIndex: number) => {
      const floors = [...(formData.floors_config || [])];
      const newAptName = `Apt ${Math.floor(Math.random() * 90) + 10}`;
      floors[floorIndex].apartments = [...floors[floorIndex].apartments, newAptName];
      setFormData({ ...formData, floors_config: floors });
    };

    const removeApartment = (floorIndex: number, apartmentIndex: number) => {
      const floors = [...(formData.floors_config || [])];
      floors[floorIndex].apartments = floors[floorIndex].apartments.filter((_, i) => i !== apartmentIndex);
      setFormData({ ...formData, floors_config: floors });
    };

    const moveApartment = (fromFloorIdx: number, aptIdx: number, toFloorIdx: number) => {
      const floors = [...(formData.floors_config || [])];
      const apt = floors[fromFloorIdx].apartments[aptIdx];
      floors[fromFloorIdx].apartments = floors[fromFloorIdx].apartments.filter((_, i) => i !== aptIdx);
      floors[toFloorIdx].apartments = [...floors[toFloorIdx].apartments, apt];
      setFormData({ ...formData, floors_config: floors });
    };

    const updateApartmentName = (floorIndex: number, aptIndex: number, name: string) => {
      const floors = [...(formData.floors_config || [])];
      floors[floorIndex].apartments[aptIndex] = name;
      setFormData({ ...formData, floors_config: floors });
    };

    const onPaletteDragStart = (e: React.DragEvent, type: string) => {
      e.dataTransfer.effectAllowed = 'copy';
      setDragType(type);
    };

    const onApartmentDragStart = (e: React.DragEvent, floorIdx: number, aptIdx: number) => {
      e.dataTransfer.effectAllowed = 'move';
      setDragType(DRAG_TYPES.EXISTING_APT);
      setDragData({ floorIdx, aptIdx });
    };

    const onDragEndGlobal = () => {
      setDragType(null);
      setDragData(null);
    };

    const onBuildingDrop = (e: React.DragEvent) => {
      e.preventDefault();
      if (dragType === DRAG_TYPES.PALETTE_FLOOR) {
        addFloor();
      }
      onDragEndGlobal();
    };

    const onFloorDrop = (floorIdx: number, e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (dragType === DRAG_TYPES.PALETTE_APT) {
        addApartmentToFloor(floorIdx);
      } else if (dragType === DRAG_TYPES.EXISTING_APT && dragData) {
        if (dragData.floorIdx !== floorIdx) {
          moveApartment(dragData.floorIdx, dragData.aptIdx, floorIdx);
        }
      }
      onDragEndGlobal();
    };

    const allowDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };

    const StudRow = () => (
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '4px' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)'
            }}
          />
        ))}
      </div>
    );

    return (
      <div style={{ 
        marginTop: '24px', 
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        gap: '24px',
        minHeight: '500px'
      }}>
        {/* Palette Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Floor Palette */}
          <div
            draggable
            onDragStart={(e) => onPaletteDragStart(e, DRAG_TYPES.PALETTE_FLOOR)}
            onDragEnd={onDragEndGlobal}
            style={{
              cursor: 'grab',
              padding: '20px',
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '2px solid #e5e7eb',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              transition: 'all 0.2s',
              userSelect: 'none'
            }}
            onMouseDown={(e) => e.currentTarget.style.cursor = 'grabbing'}
            onMouseUp={(e) => e.currentTarget.style.cursor = 'grab'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                backgroundColor: '#dbeafe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Layers size={24} color="#3b82f6" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '700', fontSize: '16px', color: '#1f2937' }}>Floor</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>Drag to building</div>
              </div>
            </div>
            <div style={{
              padding: '6px 12px',
              backgroundColor: '#f3f4f6',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#6b7280',
              textAlign: 'center',
              fontWeight: '600'
            }}>
              ðŸ—ï¸ Add New Level
            </div>
          </div>

          {/* Apartment Palette */}
          <div
            draggable
            onDragStart={(e) => onPaletteDragStart(e, DRAG_TYPES.PALETTE_APT)}
            onDragEnd={onDragEndGlobal}
            style={{
              cursor: 'grab',
              padding: '20px',
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '2px solid #e5e7eb',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              transition: 'all 0.2s',
              userSelect: 'none'
            }}
            onMouseDown={(e) => e.currentTarget.style.cursor = 'grabbing'}
            onMouseUp={(e) => e.currentTarget.style.cursor = 'grab'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                backgroundColor: '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Home size={24} color="#f59e0b" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '700', fontSize: '16px', color: '#1f2937' }}>Apartment</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>Drag to floor</div>
              </div>
            </div>
            <div style={{
              padding: '6px 12px',
              backgroundColor: '#f3f4f6',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#6b7280',
              textAlign: 'center',
              fontWeight: '600'
            }}>
              ðŸ  Add Unit
            </div>
          </div>

          {/* Stats */}
          <div style={{
            padding: '16px',
            backgroundColor: 'white',
            borderRadius: '12px',
            border: '2px dashed #e5e7eb'
          }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280', marginBottom: '12px' }}>
              Building Stats
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Floors:</span>
                <span style={{ fontSize: '16px', fontWeight: '700', color: '#3b82f6' }}>
                  {(formData.floors_config || []).length}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Apartments:</span>
                <span style={{ fontSize: '16px', fontWeight: '700', color: '#f59e0b' }}>
                  {(formData.floors_config || []).reduce((sum, f) => sum + f.apartments.length, 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div style={{
            padding: '16px',
            backgroundColor: '#fffbeb',
            borderRadius: '12px',
            border: '1px solid #fef3c7'
          }}>
            <div style={{ fontSize: '11px', color: '#92400e', lineHeight: '1.6' }}>
              <strong>ðŸ’¡ Tips:</strong><br/>
              â€¢ Drag floors to stack levels<br/>
              â€¢ Drag apartments onto floors<br/>
              â€¢ Move apartments between floors<br/>
              â€¢ Click pencil to rename<br/>
              â€¢ Click X to delete
            </div>
          </div>
        </div>

        {/* Building Area */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          border: `3px dashed ${dragType === DRAG_TYPES.PALETTE_FLOOR ? '#22c55e' : '#e5e7eb'}`,
          padding: '24px',
          minHeight: '500px',
          position: 'relative',
          transition: 'all 0.3s'
        }}
        onDragOver={allowDrop}
        onDrop={onBuildingDrop}
        >
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px', 
            marginBottom: '24px',
            paddingBottom: '16px',
            borderBottom: '2px solid #f3f4f6'
          }}>
            <Building size={24} color="#667eea" />
            <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937', margin: 0 }}>
              Building Layout
            </h3>
          </div>

          {(formData.floors_config || []).length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '400px',
              gap: '16px'
            }}>
              <Building size={64} color="#cbd5e1" />
              <p style={{ fontSize: '16px', color: '#64748b', textAlign: 'center' }}>
                {t('buildings.apartmentConfig.noFloors')}
              </p>
              <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center' }}>
                Drag a <strong>Floor</strong> from the palette to start building
              </p>
            </div>
          ) : (
            <div style={{ 
              maxHeight: '600px', 
              overflowY: 'auto',
              paddingRight: '8px'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: '20px' }}>
                {(formData.floors_config || []).map((floor, floorIdx) => (
                  <div key={floorIdx} style={{ position: 'relative' }}>
                    {/* LEGO Studs on top */}
                    <StudRow />

                    {/* Floor Card */}
                    <div
                      onDragOver={allowDrop}
                      onDrop={(e) => onFloorDrop(floorIdx, e)}
                      style={{
                        padding: '20px',
                        backgroundColor: dragType ? '#f0f9ff' : '#f8fafc',
                        borderRadius: '16px',
                        border: `2px solid ${dragType === DRAG_TYPES.PALETTE_APT ? '#3b82f6' : '#e2e8f0'}`,
                        boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                        transition: 'all 0.2s'
                      }}
                    >
                      {/* Floor Header */}
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        marginBottom: '16px',
                        paddingBottom: '12px',
                        borderBottom: '2px solid #e2e8f0'
                      }}>
                        {editingFloor === floorIdx ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                            <input
                              autoFocus
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  updateFloorName(floorIdx, editValue.trim() || floor.floor_name);
                                  setEditingFloor(null);
                                } else if (e.key === 'Escape') {
                                  setEditingFloor(null);
                                }
                              }}
                              style={{
                                flex: 1,
                                padding: '8px 12px',
                                border: '2px solid #3b82f6',
                                borderRadius: '8px',
                                fontSize: '15px',
                                fontWeight: '600'
                              }}
                            />
                            <button
                              onClick={() => {
                                updateFloorName(floorIdx, editValue.trim() || floor.floor_name);
                                setEditingFloor(null);
                              }}
                              style={{
                                padding: '8px',
                                border: 'none',
                                background: '#22c55e',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                            >
                              <Check size={16} color="white" />
                            </button>
                            <button
                              onClick={() => setEditingFloor(null)}
                              style={{
                                padding: '8px',
                                border: 'none',
                                background: '#ef4444',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                            >
                              <X size={16} color="white" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                              <Layers size={20} color="#3b82f6" />
                              <span style={{ fontSize: '16px', fontWeight: '700', color: '#1f2937' }}>
                                {floor.floor_name}
                              </span>
                              <button
                                onClick={() => {
                                  setEditingFloor(floorIdx);
                                  setEditValue(floor.floor_name);
                                }}
                                style={{
                                  padding: '6px',
                                  border: 'none',
                                  background: 'rgba(59, 130, 246, 0.1)',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                              >
                                <Edit2 size={14} color="#3b82f6" />
                              </button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{
                                padding: '4px 12px',
                                backgroundColor: '#f3f4f6',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: '600',
                                color: '#6b7280'
                              }}>
                                {floor.apartments.length} units
                              </div>
                              <button
                                onClick={() => removeFloor(floorIdx)}
                                style={{
                                  padding: '8px',
                                  border: 'none',
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                              >
                                <Trash2 size={16} color="#ef4444" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Apartments Grid */}
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                        gap: '12px'
                      }}>
                        {floor.apartments.map((apt, aptIdx) => (
                          <div
                            key={aptIdx}
                            draggable
                            onDragStart={(e) => onApartmentDragStart(e, floorIdx, aptIdx)}
                            onDragEnd={onDragEndGlobal}
                            style={{
                              padding: '14px',
                              backgroundColor: '#fef3c7',
                              borderRadius: '12px',
                              border: '2px solid #fbbf24',
                              cursor: 'grab',
                              transition: 'all 0.2s',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                              userSelect: 'none'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'translateY(-2px)';
                              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                            }}
                          >
                            {editingApt?.floorIdx === floorIdx && editingApt?.aptIdx === aptIdx ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input
                                  autoFocus
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      updateApartmentName(floorIdx, aptIdx, editValue.trim() || apt);
                                      setEditingApt(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingApt(null);
                                    }
                                  }}
                                  style={{
                                    flex: 1,
                                    padding: '4px 8px',
                                    border: '2px solid #f59e0b',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    fontWeight: '600'
                                  }}
                                />
                                <button
                                  onClick={() => {
                                    updateApartmentName(floorIdx, aptIdx, editValue.trim() || apt);
                                    setEditingApt(null);
                                  }}
                                  style={{
                                    padding: '4px',
                                    border: 'none',
                                    background: 'white',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    display: 'flex'
                                  }}
                                >
                                  <Check size={12} color="#22c55e" />
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                                  <Home size={14} color="#f59e0b" />
                                  <span style={{ 
                                    fontSize: '13px', 
                                    fontWeight: '700', 
                                    color: '#92400e',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {apt}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingApt({ floorIdx, aptIdx });
                                      setEditValue(apt);
                                    }}
                                    style={{
                                      padding: '4px',
                                      border: 'none',
                                      background: 'rgba(255, 255, 255, 0.6)',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      display: 'flex'
                                    }}
                                  >
                                    <Edit2 size={11} color="#f59e0b" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeApartment(floorIdx, aptIdx);
                                    }}
                                    style={{
                                      padding: '4px',
                                      border: 'none',
                                      background: 'rgba(239, 68, 68, 0.2)',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      display: 'flex'
                                    }}
                                  >
                                    <X size={11} color="#ef4444" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        {floor.apartments.length === 0 && (
                          <div style={{
                            gridColumn: '1 / -1',
                            padding: '20px',
                            textAlign: 'center',
                            color: '#94a3b8',
                            fontSize: '13px',
                            fontStyle: 'italic',
                            backgroundColor: '#f8fafc',
                            borderRadius: '8px',
                            border: '2px dashed #e2e8f0'
                          }}>
                            Drag an <strong>Apartment</strong> here
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Floor Number Badge */}
                    <div style={{
                      position: 'absolute',
                      left: '-16px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      padding: '6px 10px',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '700',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      zIndex: 10,
                      maxWidth: '120px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {floor.floor_name}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Drop Hint Overlay */}
          {dragType === DRAG_TYPES.PALETTE_FLOOR && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              padding: '16px 32px',
              backgroundColor: 'rgba(34, 197, 94, 0.9)',
              color: 'white',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '700',
              boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
              pointerEvents: 'none',
              zIndex: 100
            }}>
              ðŸ—ï¸ Release to add a new Floor
            </div>
          )}
        </div>
      </div>
    );
  };

  const InstructionsModal = () => (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', 
      justifyContent: 'center', zIndex: 2000, padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '30px',
        maxWidth: '700px', maxHeight: '90vh', overflow: 'auto', width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>{t('buildings.instructions.title')}</h2>
          <button onClick={() => setShowInstructions(false)} 
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ lineHeight: '1.8', color: '#374151' }}>
          <div style={{ backgroundColor: '#dbeafe', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #3b82f6' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Home size={20} color="#3b82f6" />
              {t('buildings.instructions.whatIsBuilding')}
            </h3>
            <p>{t('buildings.instructions.buildingDescription')}</p>
          </div>

          <div style={{ backgroundColor: '#f3e5f5', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #7b1fa2' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Folder size={20} color="#7b1fa2" />
              {t('buildings.instructions.whatIsComplex')}
            </h3>
            <p>{t('buildings.instructions.complexDescription')}</p>
          </div>

          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #f59e0b' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Building size={20} color="#f59e0b" />
              {t('buildings.instructions.apartmentTitle')}
            </h3>
            <p>{t('buildings.instructions.apartmentDescription')}</p>
          </div>

          <div style={{ backgroundColor: '#ecfdf5', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #22c55e' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sun size={20} color="#22c55e" />
              {t('buildings.instructions.energyFlowTitle')}
            </h3>
            <p>{t('buildings.instructions.energyFlowDescription')}</p>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            {t('buildings.instructions.howToUse')}
          </h3>
          <ul style={{ marginLeft: '20px' }}>
            <li>{t('buildings.instructions.step1')}</li>
            <li>{t('buildings.instructions.step2')}</li>
            <li>{t('buildings.instructions.step3')}</li>
            <li>{t('buildings.instructions.step4')}</li>
            <li>{t('buildings.instructions.step5')}</li>
            <li>{t('buildings.instructions.step6')}</li>
          </ul>

          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '1px solid #f59e0b' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('buildings.instructions.tips')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('buildings.instructions.tip1')}</li>
              <li>{t('buildings.instructions.tip2')}</li>
              <li>{t('buildings.instructions.tip3')}</li>
              <li>{t('buildings.instructions.tip4')}</li>
            </ul>
          </div>
        </div>

        <button onClick={() => setShowInstructions(false)} style={{
          width: '100%', marginTop: '24px', padding: '12px',
          backgroundColor: '#007bff', color: 'white', border: 'none',
          borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
        }}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="buildings-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', gap: '15px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ 
            fontSize: '36px', 
            fontWeight: '800', 
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            <Building size={36} style={{ color: '#667eea' }} />
            {t('buildings.title')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            {t('buildings.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowInstructions(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <HelpCircle size={18} />
            {t('buildings.setupInstructions')}
          </button>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <Plus size={18} />
            {t('buildings.addBuilding')}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
          <input
            type="text"
            placeholder={t('buildings.searchPlaceholder')}
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

      {filteredComplexes.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Folder size={20} color="#667eea" />
            {t('buildings.complexes')}
          </h2>
          {filteredComplexes.map(complex => (
            <ComplexCard key={complex.id} complex={complex} />
          ))}
        </div>
      )}

      {filteredStandalone.length > 0 && (
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Home size={20} color="#667eea" />
            {t('buildings.standaloneBuildings')}
          </h2>
          <div>
            {filteredStandalone.map(building => (
              <EnergyFlowCard key={building.id} building={building} />
            ))}
          </div>
        </div>
      )}

      {filteredComplexes.length === 0 && filteredStandalone.length === 0 && (
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '12px', 
          padding: '60px 20px', 
          textAlign: 'center', 
          color: '#999',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          {searchQuery ? t('buildings.noResults') : t('buildings.noBuildings')}
        </div>
      )}

      {showInstructions && <InstructionsModal />}

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          padding: '15px'
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white', borderRadius: '12px', padding: '30px',
            width: '95%', maxWidth: '1200px', maxHeight: '90vh', overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {editingBuilding ? t('buildings.editBuilding') : t('buildings.addBuilding')}
              </h2>
              <button onClick={() => { setShowModal(false); setEditingBuilding(null); }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('common.name')} *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.is_group} onChange={(e) => setFormData({ ...formData, is_group: e.target.checked })} />
                  <span style={{ fontWeight: '500', fontSize: '14px' }}>{t('buildings.isComplex')}</span>
                </label>
              </div>

              {formData.is_group && (
                <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '6px' }}>
                  <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500', fontSize: '14px' }}>
                    {t('buildings.selectBuildings')}
                  </label>
                  {availableBuildings.length === 0 ? (
                    <p style={{ color: '#999', fontSize: '14px' }}>{t('buildings.noAvailableBuildings')}</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                      {availableBuildings.map(b => (
                        <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={(formData.group_buildings || []).includes(b.id)}
                            onChange={() => toggleGroupBuilding(b.id)}
                          />
                          <span style={{ fontSize: '14px' }}>{b.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!formData.is_group && (
                <>
                  <div style={{ marginTop: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('common.address')}</label>
                    <input type="text" value={formData.address_street} onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                      placeholder={t('users.street')} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '8px' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px' }}>
                      <input type="text" value={formData.address_zip} onChange={(e) => setFormData({ ...formData, address_zip: e.target.value })}
                        placeholder={t('users.zip')} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                      <input type="text" value={formData.address_city} onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                        placeholder={t('users.city')} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                    </div>
                  </div>

                  {/* Apartment Management Toggle */}
                  <div style={{ marginTop: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={formData.has_apartments} 
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          has_apartments: e.target.checked, 
                          floors_config: e.target.checked ? formData.floors_config : [] 
                        })} 
                      />
                      <span style={{ fontWeight: '600', fontSize: '14px', color: '#0369a1' }}>
                        {t('buildings.apartmentConfig.enable')}
                      </span>
                    </label>
                    <p style={{ fontSize: '12px', color: '#0369a1', marginTop: '4px', marginLeft: '28px' }}>
                      {t('buildings.apartmentConfig.enableDescription')}
                    </p>
                  </div>

                  {/* LEGO-Style Apartment Builder */}
                  {formData.has_apartments && <LegoApartmentBuilder />}
                </>
              )}

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('common.notes')}</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'inherit' }} />
              </div>

              <div className="button-group" style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="submit" style={{
                  flex: 1, padding: '12px', backgroundColor: '#007bff', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                }}>
                  {editingBuilding ? t('common.update') : t('common.create')}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setEditingBuilding(null); }} style={{
                  flex: 1, padding: '12px', backgroundColor: '#6c757d', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                }}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .buildings-container h1 {
            font-size: 24px !important;
          }

          .buildings-container h1 svg {
            width: 24px !important;
            height: 24px !important;
          }

          .buildings-container p {
            font-size: 14px !important;
          }

          .modal-content h2 {
            font-size: 20px !important;
          }
        }

        @media (max-width: 480px) {
          .buildings-container h1 {
            font-size: 20px !important;
          }

          .buildings-container h1 svg {
            width: 20px !important;
            height: 20px !important;
          }
        }
      `}</style>
    </div>
  );
}