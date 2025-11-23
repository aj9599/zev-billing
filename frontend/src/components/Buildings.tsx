import { useState, useEffect } from 'react';
import { Folder, Home } from 'lucide-react';
import { useTranslation } from '../i18n';
import { useBuildingData } from './buildings/hooks/useBuildingData';
import { useBuildingForm } from './buildings/hooks/useBuildingForm';
import { useExpandedComplexes } from './buildings/hooks/useExpandedComplexes';
import BuildingsHeader from './buildings/components/BuildingsHeader';
import SearchBar from './buildings/components/SearchBar';
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

  // Custom hooks
  const { buildings, meters, chargers, consumptionData, loadData } = useBuildingData();
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

  return (
    <div className="buildings-container">
      <BuildingsHeader
        isMobile={isMobile}
        onAddBuilding={handleOpenModal}
        onShowInstructions={() => setShowInstructions(true)}
      />

      <SearchBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isMobile={isMobile}
      />

      {filteredComplexes.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{
            fontSize: isMobile ? '18px' : '20px',
            fontWeight: '600',
            marginBottom: '16px',
            color: '#1f2937',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Folder size={20} color="#667eea" />
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

      {filteredStandalone.length > 0 && (
        <div>
          <h2 style={{
            fontSize: isMobile ? '18px' : '20px',
            fontWeight: '600',
            marginBottom: '16px',
            color: '#1f2937',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Home size={20} color="#667eea" />
            {t('buildings.standaloneBuildings')}
          </h2>
          <div>
            {filteredStandalone.map(building => (
              <EnergyFlowCard
                key={building.id}
                building={building}
                buildings={buildings}
                meters={meters}
                chargers={chargers}
                consumptionData={consumptionData}
                onEdit={handleEditBuilding}
                onDelete={loadData}
                isMobile={isMobile}
              />
            ))}
          </div>
        </div>
      )}

      {filteredComplexes.length === 0 && filteredStandalone.length === 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: isMobile ? '40px 20px' : '60px 20px',
          textAlign: 'center',
          color: '#999',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          {searchQuery ? t('buildings.noResults') : t('buildings.noBuildings')}
        </div>
      )}

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
    </div>
  );
}