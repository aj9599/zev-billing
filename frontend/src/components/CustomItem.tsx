import { useState, useEffect } from 'react';
import { DollarSign } from 'lucide-react';
import { useCustomItems } from './billing/hooks/useCustomItems';
import CustomItemBuildingGroup from './billing/components/custom-items/CustomItemBuildingGroup';
import CustomItemFormModal from './billing/components/custom-items/CustomItemFormModal';
import Toast from './billing/components/common/Toast';
import type { CustomLineItem } from '../types';
import { useTranslation } from '../i18n';

interface CustomItemsProps {
  onSave: () => void;
  selectedBuildingId: number | null;
}

export default function CustomItems({ onSave, selectedBuildingId }: CustomItemsProps) {
  const { t } = useTranslation();
  const {
    items,
    buildings,
    loading,
    saving,
    createItem,
    updateItem,
    deleteItem
  } = useCustomItems();

  const [editingItem, setEditingItem] = useState<CustomLineItem | null>(null);
  const [showModal, setShowModal] = useState(false);
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

  const handleEdit = (item: CustomLineItem) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('customItems.deleteConfirm'))) return;

    try {
      await deleteItem(id);
      showToast(t('customItems.deleteSuccess'), 'success');
      onSave();
    } catch (err) {
      console.error('Failed to delete custom item:', err);
      showToast(t('customItems.deleteFailed') + `: ${(err as Error).message}`, 'error');
    }
  };

  const handleSave = async (formData: any) => {
    try {
      if (editingItem) {
        await updateItem(editingItem.id, formData);
        showToast(t('customItems.updateSuccess'), 'success');
      } else {
        await createItem(formData);
        showToast(t('customItems.createSuccess'), 'success');
      }
      setShowModal(false);
      setEditingItem(null);
      onSave();
    } catch (err) {
      console.error('Failed to save custom item:', err);
      showToast(t('customItems.saveFailed') + `: ${(err as Error).message}`, 'error');
      throw err;
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingItem(null);
  };

  // Filter items based on selected building
  const filteredItems = selectedBuildingId
    ? items.filter(item => item.building_id === selectedBuildingId)
    : items;

  // Organize items by building
  const organizedItems = buildings.map(building => {
    const buildingItems = filteredItems.filter(item => item.building_id === building.id);
    return {
      building,
      items: buildingItems,
      totalCount: buildingItems.length
    };
  }).filter(group => group.totalCount > 0);

  if (loading) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '40px',
        color: '#666'
      }}>
        <p style={{ marginTop: '10px', fontSize: '14px' }}>{t('customItems.loading')}</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Toast Notification */}
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Items List */}
      {organizedItems.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          color: '#6b7280',
          backgroundColor: '#f8f9fa',
          borderRadius: '12px',
          border: '2px dashed #d1d5db'
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
            <DollarSign size={40} color="white" />
          </div>
          <p style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
            {t('customItems.noItems')}
          </p>
          <p style={{ fontSize: '14px', marginTop: '5px', marginBottom: '20px' }}>
            {t('customItems.noItemsDescription')}
          </p>
          <button
            onClick={() => setShowModal(true)}
            style={{
              padding: '12px 24px',
              backgroundColor: '#667EEA',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s',
              boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <DollarSign size={18} />
            {t('customItems.addNew')}
          </button>
        </div>
      ) : (
        organizedItems.map(({ building, items: buildingItems }) => (
          <CustomItemBuildingGroup
            key={building.id}
            building={building}
            items={buildingItems}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAdd={() => setShowModal(true)}
          />
        ))
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <CustomItemFormModal
          buildings={buildings}
          editingItem={editingItem}
          onSave={handleSave}
          onClose={handleCloseModal}
          saving={saving}
        />
      )}
    </div>
  );
}