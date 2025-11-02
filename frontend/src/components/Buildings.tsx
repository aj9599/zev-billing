import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Building, Search, MapPin, Zap, ChevronRight, ChevronDown, Folder, Home, HelpCircle, TrendingUp, TrendingDown, Activity, Minus } from 'lucide-react';
import { api } from '../api/client';
import type { Building as BuildingType, Meter, Charger, BuildingConsumption, FloorConfig } from '../types';
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
          floor_name: `Floor ${newFloorNumber}`,
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

  const BuildingCard = ({ building, isInComplex = false }: { building: BuildingType; isInComplex?: boolean }) => {
    const buildingMeters = getBuildingMeters(building.id);
    const buildingChargers = getBuildingChargers(building.id);
    const consumption = getBuildingConsumption(building.id);

    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.07)',
        border: '1px solid #f0f0f0',
        position: 'relative',
        transition: 'all 0.2s ease',
        marginLeft: isInComplex ? '40px' : '0'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 8px 12px rgba(0,0,0,0.12)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.07)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}>
        <div style={{ 
          position: 'absolute', 
          top: '16px', 
          right: '16px', 
          display: 'flex', 
          gap: '8px' 
        }}>
          <button 
            onClick={() => handleEdit(building)} 
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
            onClick={() => handleDelete(building.id)} 
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

        <div style={{ paddingRight: '72px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Home size={20} color="#667eea" />
            <h3 style={{ 
              fontSize: '20px', 
              fontWeight: '600', 
              margin: 0,
              color: '#1f2937',
              lineHeight: '1.3'
            }}>
              {building.name}
            </h3>
            {building.has_apartments && (
              <span style={{
                fontSize: '11px',
                padding: '2px 6px',
                backgroundColor: '#dbeafe',
                color: '#1e40af',
                borderRadius: '4px',
                fontWeight: '600'
              }}>
                APARTMENTS
              </span>
            )}
          </div>
          
          {(building.address_street || building.address_city) && (
            <div style={{ display: 'flex', alignItems: 'start', gap: '6px', marginTop: '8px' }}>
              <MapPin size={14} color="#9ca3af" style={{ marginTop: '2px', flexShrink: 0 }} />
              <p style={{ 
                fontSize: '13px', 
                color: '#6b7280', 
                margin: 0,
                lineHeight: '1.5'
              }}>
                {building.address_street && <>{building.address_street}<br /></>}
                {building.address_zip && building.address_city && `${building.address_zip} ${building.address_city}`}
              </p>
            </div>
          )}
        </div>

        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f3f4f6' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <Zap size={14} color="#9ca3af" />
                <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '500' }}>
                  {t('buildings.metersCount')}
                </span>
              </div>
              <span style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937' }}>
                {buildingMeters.length}
              </span>
            </div>
            
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <Activity size={14} color="#9ca3af" />
                <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '500' }}>
                  {t('buildings.chargersCount')}
                </span>
              </div>
              <span style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937' }}>
                {buildingChargers.length}
              </span>
            </div>
          </div>

          {(consumption.total > 0 || consumption.solar > 0 || consumption.charging > 0) && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {consumption.total > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <TrendingUp size={14} color="#f59e0b" />
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>{t('buildings.consumption')}</span>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#f59e0b' }}>
                      {consumption.total.toFixed(2)} kW
                    </span>
                  </div>
                )}
                
                {consumption.solar > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <TrendingDown size={14} color="#22c55e" />
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>{t('buildings.solarProduction')}</span>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#22c55e' }}>
                      {consumption.solar.toFixed(2)} kW
                    </span>
                  </div>
                )}
                
                {consumption.charging > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Zap size={14} color="#3b82f6" />
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>{t('buildings.charging')}</span>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#3b82f6' }}>
                      {consumption.charging.toFixed(2)} kW
                    </span>
                  </div>
                )}
              </div>
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
          <div style={{ 
            marginTop: '16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px'
          }}>
            {buildingsInComplex.map(building => (
              <BuildingCard key={building.id} building={building} isInComplex={true} />
            ))}
          </div>
        )}
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
              Apartment Management
            </h3>
            <p>Enable apartment management for buildings with rental units. Configure floors and apartments to track which users live where. Only one active user can be assigned per apartment.</p>
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
            <li>Enable apartments, add floors, and configure apartment names</li>
            <li>Assign users to specific apartments in the Users page</li>
          </ul>

          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '1px solid #f59e0b' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('buildings.instructions.tips')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('buildings.instructions.tip1')}</li>
              <li>{t('buildings.instructions.tip2')}</li>
              <li>{t('buildings.instructions.tip3')}</li>
              <li>Use descriptive apartment names like "Left", "Right", "Apt 1A", etc.</li>
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
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
            gap: '20px' 
          }}>
            {filteredStandalone.map(building => (
              <BuildingCard key={building.id} building={building} />
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
            width: '90%', maxWidth: '700px', maxHeight: '90vh', overflow: 'auto'
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

                  {/* Apartment Management Section */}
                  <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '12px' }}>
                      <input 
                        type="checkbox" 
                        checked={formData.has_apartments} 
                        onChange={(e) => setFormData({ ...formData, has_apartments: e.target.checked, floors_config: e.target.checked ? formData.floors_config : [] })} 
                      />
                      <span style={{ fontWeight: '600', fontSize: '14px', color: '#0369a1' }}>
                        Enable Apartment Management
                      </span>
                    </label>
                    <p style={{ fontSize: '12px', color: '#0369a1', marginTop: '4px', marginBottom: '12px' }}>
                      Configure floors and apartments for better user organization in rental buildings
                    </p>

                    {formData.has_apartments && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <span style={{ fontWeight: '500', fontSize: '14px', color: '#1f2937' }}>
                            Floors & Apartments
                          </span>
                          <button
                            type="button"
                            onClick={addFloor}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px',
                              backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px',
                              fontSize: '12px', cursor: 'pointer'
                            }}
                          >
                            <Plus size={14} />
                            Add Floor
                          </button>
                        </div>

                        <div style={{ maxHeight: '300px', overflowY: 'auto', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #bae6fd' }}>
                          {(formData.floors_config || []).length === 0 ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
                              No floors configured. Click "Add Floor" to start.
                            </div>
                          ) : (
                            <div style={{ padding: '12px' }}>
                              {(formData.floors_config || []).map((floor, floorIndex) => (
                                <div key={floorIndex} style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                                    <div style={{ flex: 1, marginRight: '8px' }}>
                                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#6b7280', marginBottom: '4px' }}>
                                        Floor Name
                                      </label>
                                      <input
                                        type="text"
                                        value={floor.floor_name}
                                        onChange={(e) => updateFloorName(floorIndex, e.target.value)}
                                        placeholder="e.g., Ground Floor, 1st Floor"
                                        style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px' }}
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeFloor(floorIndex)}
                                      style={{
                                        padding: '8px', border: 'none', background: 'rgba(239, 68, 68, 0.1)',
                                        borderRadius: '4px', cursor: 'pointer', marginTop: '20px'
                                      }}
                                      title="Remove floor"
                                    >
                                      <Trash2 size={14} color="#ef4444" />
                                    </button>
                                  </div>

                                  <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#6b7280', marginBottom: '6px' }}>
                                      Apartments
                                    </label>
                                    <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                                      <input
                                        type="text"
                                        placeholder="Apartment name (e.g., Apt 1, Left, Right)"
                                        onKeyPress={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            addApartment(floorIndex, e.currentTarget.value);
                                            e.currentTarget.value = '';
                                          }
                                        }}
                                        style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '12px' }}
                                      />
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                          if (input && input.value.trim()) {
                                            addApartment(floorIndex, input.value);
                                            input.value = '';
                                          }
                                        }}
                                        style={{
                                          padding: '6px 12px', backgroundColor: '#22c55e', color: 'white',
                                          border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer'
                                        }}
                                      >
                                        Add
                                      </button>
                                    </div>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                      {floor.apartments.map((apt, aptIndex) => (
                                        <div key={aptIndex} style={{
                                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                                          padding: '4px 8px', backgroundColor: '#dbeafe', color: '#1e40af',
                                          borderRadius: '4px', fontSize: '12px'
                                        }}>
                                          <Home size={12} />
                                          {apt}
                                          <button
                                            type="button"
                                            onClick={() => removeApartment(floorIndex, aptIndex)}
                                            style={{
                                              marginLeft: '4px', padding: '2px', border: 'none',
                                              background: 'none', cursor: 'pointer', display: 'flex'
                                            }}
                                          >
                                            <X size={12} color="#1e40af" />
                                          </button>
                                        </div>
                                      ))}
                                      {floor.apartments.length === 0 && (
                                        <span style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>
                                          No apartments added yet
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
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