import { useState, useEffect } from 'react';
import { Zap, AlertCircle, Loader } from 'lucide-react';
import { useSharedMeters } from './billing/hooks/useSharedMeters';
import SharedMeterBuildingGroup from './billing/components/shared-meters/SharedMeterBuildingGroup';
import SharedMeterFormModal from './billing/components/shared-meters/SharedMeterFormModal';
import Toast from './billing/components/common/Toast';
import type { SharedMeterConfig as SharedMeterConfigType } from '../types';
import { useTranslation } from '../i18n';

interface SharedMeterConfigProps {
  selectedBuildingId: number | null;
}

export default function SharedMeterConfig({ selectedBuildingId }: SharedMeterConfigProps) {
  const { t } = useTranslation();
  const {
    configs,
    buildings,
    meters,
    users,
    loading,
    saving,
    createConfig,
    updateConfig,
    deleteConfig,
    getBuildingUsers,
    getMetersForBuilding
  } = useSharedMeters();

  const [showModal, setShowModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SharedMeterConfigType | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [expandedBuildings, setExpandedBuildings] = useState<Set<number>>(new Set());

  useEffect(() => {
    // Expand all buildings by default
    const buildingIds = new Set(buildings.map(b => b.id));
    setExpandedBuildings(buildingIds);
  }, [buildings]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const handleCreate = () => {
    setEditingConfig(null);
    setShowModal(true);
  };

  const handleEdit = (config: SharedMeterConfigType) => {
    setEditingConfig(config);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('sharedMeters.deleteConfirm'))) return;

    try {
      await deleteConfig(id);
      showToast(t('sharedMeters.deleteSuccess'), 'success');
    } catch (err) {
      console.error('Failed to delete:', err);
      showToast(t('sharedMeters.deleteFailed') + ': ' + (err as Error).message, 'error');
    }
  };

  const handleSave = async (formData: any) => {
    try {
      if (editingConfig) {
        await updateConfig(editingConfig.id, formData);
        showToast(t('sharedMeters.updateSuccess'), 'success');
      } else {
        await createConfig(formData);
        showToast(t('sharedMeters.createSuccess'), 'success');
      }
      setShowModal(false);
      setEditingConfig(null);
    } catch (err) {
      console.error('Failed to save:', err);
      showToast(t('sharedMeters.saveFailed') + ': ' + (err as Error).message, 'error');
      throw err;
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingConfig(null);
  };

  // Filter configs based on selected building
  const filteredConfigs = selectedBuildingId
    ? configs.filter(c => c.building_id === selectedBuildingId)
    : configs;

  // Organize configs by building
  const organizedConfigs = buildings.map(building => {
    const buildingConfigs = filteredConfigs.filter(c => c.building_id === building.id);
    return {
      building,
      configs: buildingConfigs,
      totalCount: buildingConfigs.length
    };
  }).filter(group => group.totalCount > 0);

  if (loading) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        minHeight: '400px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Loader size={48} style={{ animation: 'spin 1s linear infinite', color: '#667EEA', marginBottom: '16px' }} />
        <p style={{ fontSize: '16px', color: '#6b7280' }}>{t('sharedMeters.loading')}</p>

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Toast Notification */}
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Info Banner */}
      <div style={{
        backgroundColor: '#e7f3ff',
        border: '2px solid #667EEA',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '30px',
        display: 'flex',
        gap: '16px'
      }}>
        <AlertCircle size={24} color="#667EEA" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.7' }}>
          <strong style={{ display: 'block', fontSize: '15px', marginBottom: '6px', color: '#1f2937' }}>
            {t('sharedMeters.infoTitle')}
          </strong>
          {t('sharedMeters.infoDescription')}
          <br />
          <strong style={{ marginTop: '8px', display: 'block' }}>
            {t('sharedMeters.onlyHeatingOther')}
          </strong>
        </div>
      </div>

      {/* Configs List */}
      {organizedConfigs.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '12px',
          border: '2px dashed #dee2e6'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            margin: '0 auto 20px',
            backgroundColor: '#667EEA',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Zap size={40} color="white" />
          </div>
          <p style={{ fontSize: '18px', marginBottom: '8px', fontWeight: '600', color: '#1f2937' }}>
            {t('sharedMeters.noConfigs')}
          </p>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px' }}>
            {t('sharedMeters.noConfigsDescription')}
          </p>
          <button
            onClick={handleCreate}
            style={{
              padding: '12px 24px',
              backgroundColor: '#667EEA',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: '600',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s',
              boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <Zap size={18} />
            {t('sharedMeters.addNew')}
          </button>
        </div>
      ) : (
        organizedConfigs.map(({ building, configs: buildingConfigs }) => (
          <SharedMeterBuildingGroup
            key={building.id}
            building={building}
            configs={buildingConfigs}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAdd={handleCreate}
          />
        ))
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <SharedMeterFormModal
          buildings={buildings}
          meters={meters}
          users={users}
          editingConfig={editingConfig}
          onSave={handleSave}
          onClose={handleCloseModal}
          saving={saving}
          getBuildingUsers={getBuildingUsers}
          getMetersForBuilding={getMetersForBuilding}
        />
      )}
    </div>
  );
}