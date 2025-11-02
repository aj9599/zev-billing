import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Building, Search, MapPin, Zap, ChevronRight, ChevronDown, Folder, Home, HelpCircle, Activity, Sun, Grid, ArrowRight, ArrowLeft, Layers, PlusCircle, MinusCircle } from 'lucide-react';
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

  // Floor/Apartment management functions
  const addFloor = () => {
    const floors = formData.floors_config || [];
    const newFloorNumber = floors.length + 1;
    setFormData({
      ...formData,
      floors_config: [
        ...floors,
        {
          floor_number: newFloorNumber,
          floor_name: `${t('buildings.floor')} ${newFloorNumber}`,
          apartments: []
        }
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

  const addApartment = (floorIndex: number, apartmentName: string) => {
    if (!apartmentName.trim()) return;
    const floors = [...(formData.floors_config || [])];
    const floor = floors[floorIndex];
    if (!floor.apartments.includes(apartmentName.trim())) {
      floor.apartments = [...floor.apartments, apartmentName.trim()];
      floors[floorIndex] = floor;
      setFormData({ ...formData, floors_config: floors });
    }
  };

  const removeApartment = (floorIndex: number, apartmentIndex: number) => {
    const floors = [...(formData.floors_config || [])];
    const floor = floors[floorIndex];
    floor.apartments = floor.apartments.filter((_, i) => i !== apartmentIndex);
    floors[floorIndex] = floor;
    setFormData({ ...formData, floors_config: floors });
  };

  const getBuildingMeters = (buildingId: number) => meters.filter(m => m.building_id === buildingId);
  const getBuildingChargers = (buildingId: number) => chargers.filter(c => c.building_id === buildingId);
  
  const getBuildingConsumption = (buildingId: number) => {
    const data = consumptionData.find(d => d.building_id === buildingId);
    if (!data) return { total: 0, solar: 0, charging: 0 };
    
    const buildingMeters = data.meters || [];
    let total = 0, solar = 0, charging = 0;
    
    buildingMeters.forEach(meter => {
      const latestData = meter.data?.[meter.data.length - 1];
      if (!latestData) return;
      
      if (meter.meter_type === 'total_meter' || meter.meter_type === 'apartment_meter') {
        total += latestData.power / 1000;
      } else if (meter.meter_type === 'solar_meter') {
        solar += latestData.power / 1000;
      } else if (meter.meter_type === 'charger') {
        charging += latestData.power / 1000;
      }
    });
    
    return { total, solar, charging };
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

  // Energy Flow Card Component
  const EnergyFlowCard = ({ building }: { building: BuildingType }) => {
    const consumption = getBuildingConsumption(building.id);
    const gridPower = consumption.total - consumption.solar;
    const solarCoverage = consumption.total > 0 ? (consumption.solar / consumption.total * 100) : 0;

    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '32px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        border: '2px solid #f0f0f0',
        marginBottom: '16px'
      }}>
        {/* Header with building name */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
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

        {/* Energy Flow Diagram */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr auto 1fr auto 1fr',
          gap: '24px',
          alignItems: 'center',
          marginBottom: '32px',
          minHeight: '200px'
        }}>
          {/* Solar Production */}
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
            <span style={{ fontSize: '24px', fontWeight: '800', color: consumption.solar < 0 ? '#22c55e' : '#f59e0b' }}>
              {Math.abs(consumption.solar).toFixed(3)} kW
            </span>
            {consumption.solar < 0 && (
              <span style={{ fontSize: '12px', color: '#22c55e', fontWeight: '600' }}>
                {t('buildings.energyFlow.production')}
              </span>
            )}
          </div>

          {/* Arrow from Solar to Building */}
          <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'column', gap: '4px' }}>
            <ArrowRight size={32} color={consumption.solar > 0 ? '#22c55e' : '#e5e7eb'} strokeWidth={3} />
            {consumption.solar > 0 && (
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#22c55e' }}>
                {consumption.solar.toFixed(2)} kW
              </span>
            )}
          </div>

          {/* Building Consumption */}
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
              {consumption.total.toFixed(3)} kW
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

          {/* Arrow from Building to Grid */}
          <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'column', gap: '4px' }}>
            {gridPower < 0 ? (
              <>
                <ArrowLeft size={32} color="#22c55e" strokeWidth={3} />
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#22c55e' }}>
                  {Math.abs(gridPower).toFixed(2)} kW
                </span>
                <span style={{ fontSize: '10px', color: '#22c55e' }}>
                  {t('buildings.energyFlow.feedIn')}
                </span>
              </>
            ) : (
              <>
                <ArrowRight size={32} color={gridPower > 0 ? '#ef4444' : '#e5e7eb'} strokeWidth={3} />
                {gridPower > 0 && (
                  <>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: '#ef4444' }}>
                      {gridPower.toFixed(2)} kW
                    </span>
                    <span style={{ fontSize: '10px', color: '#ef4444' }}>
                      {t('buildings.energyFlow.gridPower')}
                    </span>
                  </>
                )}
              </>
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
              backgroundColor: gridPower < 0 ? '#ecfdf5' : '#fee2e2',
              border: `4px solid ${gridPower < 0 ? '#22c55e' : '#ef4444'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px'
            }}>
              <Grid size={40} color={gridPower < 0 ? '#22c55e' : '#ef4444'} />
            </div>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
              {t('buildings.energyFlow.grid')}
            </span>
            <span style={{ fontSize: '24px', fontWeight: '800', color: gridPower < 0 ? '#22c55e' : '#ef4444' }}>
              {Math.abs(gridPower).toFixed(3)} kW
            </span>
            <span style={{ fontSize: '12px', color: gridPower < 0 ? '#22c55e' : '#ef4444', fontWeight: '600' }}>
              {gridPower < 0 ? t('buildings.energyFlow.selling') : t('buildings.energyFlow.buying')}
            </span>
          </div>
        </div>

        {/* Stats Row */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
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

        {/* Action Buttons */}
        <div style={{ 
          display: 'flex', 
          gap: '12px', 
          marginTop: '24px',
          justifyContent: 'center'
        }}>
          <button 
            onClick={() => handleEdit(building)} 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#3b82f6',
              color: 'white',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            <Edit2 size={16} />
            {t('common.edit')}
          </button>
          <button 
            onClick={() => handleDelete(building.id)} 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#ef4444',
              color: 'white',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
          >
            <Trash2 size={16} />
            {t('common.delete')}
          </button>
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

  // Visual LEGO-Style Apartment Configuration Component
  const VisualApartmentConfig = () => {
    const [selectedFloorIndex, setSelectedFloorIndex] = useState<number | null>(null);
    const [newApartmentName, setNewApartmentName] = useState('');

    return (
      <div style={{ 
        marginTop: '16px', 
        padding: '24px', 
        backgroundColor: '#f0f9ff', 
        borderRadius: '12px', 
        border: '2px solid #bae6fd' 
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0369a1', margin: 0, marginBottom: '4px' }}>
              {t('buildings.apartmentConfig.title')}
            </h3>
            <p style={{ fontSize: '13px', color: '#0369a1', margin: 0 }}>
              {t('buildings.apartmentConfig.description')}
            </p>
          </div>
          <button
            type="button"
            onClick={addFloor}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            <PlusCircle size={18} />
            {t('buildings.apartmentConfig.addFloor')}
          </button>
        </div>

        {/* Visual Building Representation */}
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '12px', 
          padding: '32px',
          minHeight: '400px',
          border: '2px solid #bae6fd',
          position: 'relative'
        }}>
          {(formData.floors_config || []).length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '350px',
              gap: '16px'
            }}>
              <Layers size={64} color="#94a3b8" />
              <p style={{ fontSize: '16px', color: '#64748b', textAlign: 'center' }}>
                {t('buildings.apartmentConfig.noFloors')}
              </p>
              <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center' }}>
                {t('buildings.apartmentConfig.clickAddFloor')}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: '16px' }}>
              {(formData.floors_config || []).map((floor, floorIndex) => (
                <div 
                  key={floorIndex}
                  style={{
                    padding: '20px',
                    backgroundColor: selectedFloorIndex === floorIndex ? '#dbeafe' : '#f9fafb',
                    borderRadius: '12px',
                    border: `2px solid ${selectedFloorIndex === floorIndex ? '#3b82f6' : '#e5e7eb'}`,
                    transition: 'all 0.2s',
                    cursor: 'pointer'
                  }}
                  onClick={() => setSelectedFloorIndex(floorIndex)}
                >
                  {/* Floor Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ flex: 1, marginRight: '16px' }}>
                      <input
                        type="text"
                        value={floor.floor_name}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateFloorName(floorIndex, e.target.value);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={t('buildings.apartmentConfig.floorNamePlaceholder')}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          border: '2px solid #cbd5e1',
                          borderRadius: '8px',
                          fontSize: '15px',
                          fontWeight: '600',
                          color: '#1f2937'
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFloor(floorIndex);
                        if (selectedFloorIndex === floorIndex) {
                          setSelectedFloorIndex(null);
                        }
                      }}
                      style={{
                        padding: '10px',
                        border: 'none',
                        background: 'rgba(239, 68, 68, 0.1)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      title={t('buildings.apartmentConfig.removeFloor')}
                    >
                      <MinusCircle size={20} color="#ef4444" />
                    </button>
                  </div>

                  {/* Apartments in this floor */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#64748b' }}>
                        {t('buildings.apartmentConfig.apartments')} ({floor.apartments.length})
                      </span>
                    </div>
                    
                    {/* Add apartment input (visible when floor is selected) */}
                    {selectedFloorIndex === floorIndex && (
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        <input
                          type="text"
                          placeholder={t('buildings.apartmentConfig.apartmentNamePlaceholder')}
                          value={selectedFloorIndex === floorIndex ? newApartmentName : ''}
                          onChange={(e) => {
                            e.stopPropagation();
                            setNewApartmentName(e.target.value);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addApartment(floorIndex, newApartmentName);
                              setNewApartmentName('');
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            border: '2px solid #cbd5e1',
                            borderRadius: '6px',
                            fontSize: '13px'
                          }}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (newApartmentName.trim()) {
                              addApartment(floorIndex, newApartmentName);
                              setNewApartmentName('');
                            }
                          }}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#22c55e',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                        >
                          {t('buildings.apartmentConfig.add')}
                        </button>
                      </div>
                    )}

                    {/* Apartment blocks (LEGO style) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' }}>
                      {floor.apartments.map((apt, aptIndex) => (
                        <div
                          key={aptIndex}
                          style={{
                            padding: '12px',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                            <Home size={16} />
                            <span style={{ fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {apt}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeApartment(floorIndex, aptIndex);
                            }}
                            style={{
                              padding: '4px',
                              border: 'none',
                              background: 'rgba(255, 255, 255, 0.2)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      {floor.apartments.length === 0 && (
                        <div style={{
                          padding: '12px',
                          backgroundColor: '#f1f5f9',
                          borderRadius: '8px',
                          textAlign: 'center',
                          gridColumn: '1 / -1'
                        }}>
                          <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                            {t('buildings.apartmentConfig.noApartments')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Help Text */}
        <div style={{ 
          marginTop: '16px', 
          padding: '12px 16px', 
          backgroundColor: '#fff7ed', 
          borderRadius: '8px',
          border: '1px solid #fed7aa'
        }}>
          <p style={{ fontSize: '12px', color: '#c2410c', margin: 0 }}>
            💡 {t('buildings.apartmentConfig.helpText')}
          </p>
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
            width: '90%', maxWidth: '900px', maxHeight: '90vh', overflow: 'auto'
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

                  {/* Visual LEGO-Style Apartment Configuration */}
                  {formData.has_apartments && <VisualApartmentConfig />}
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