import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, DollarSign, Search, Building, HelpCircle, Layers, Check, ChevronDown, ChevronRight, Zap, Sun, Car } from 'lucide-react';
import { api } from '../api/client';
import type { BillingSettings, Building as BuildingType } from '../types';
import { useTranslation } from '../i18n';

// Focus/blur handlers for themed inputs
const focusHandler = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
  e.target.style.borderColor = '#667eea';
  e.target.style.boxShadow = '0 0 0 3px rgba(102,126,234,0.1)';
};
const blurHandler = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
  e.target.style.borderColor = '#e5e7eb';
  e.target.style.boxShadow = 'none';
};

const inputStyle = (isMobile: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  fontSize: isMobile ? '16px' : '14px',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  outline: 'none',
  backgroundColor: 'white'
});

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontWeight: '600',
  fontSize: '13px',
  color: '#374151'
};

// Custom Checkbox
function CustomCheckbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
      <div
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        style={{
          width: '20px', height: '20px', borderRadius: '6px',
          border: checked ? '2px solid #667eea' : '2px solid #d1d5db',
          backgroundColor: checked ? '#667eea' : 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s', cursor: 'pointer', flexShrink: 0
        }}
      >
        {checked && <Check size={14} color="white" strokeWidth={3} />}
      </div>
      <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>{label}</span>
    </label>
  );
}

export default function PricingSettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<BillingSettings[]>([]);
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [editingSetting, setEditingSetting] = useState<BillingSettings | null>(null);
  const [expandedBuildings, setExpandedBuildings] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [formData, setFormData] = useState<Partial<BillingSettings>>({
    building_id: 0,
    is_complex: false,
    normal_power_price: 0.25,
    solar_power_price: 0.15,
    car_charging_normal_price: 0.30,
    car_charging_priority_price: 0.40,
    vzev_export_price: 0.18,
    currency: 'CHF',
    valid_from: new Date().toISOString().split('T')[0],
    valid_to: '',
    is_active: true
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [settingsData, buildingsData] = await Promise.all([
        api.getBillingSettings(),
        api.getBuildings()
      ]);
      setSettings(Array.isArray(settingsData) ? settingsData : []);
      setBuildings(buildingsData);

      const buildingIds = new Set(buildingsData.map(b => b.id));
      setExpandedBuildings(buildingIds);
    } catch (err) {
      console.error('Failed to load data:', err);
      setMessage(t('pricing.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const checkDateOverlap = (buildingId: number, validFrom: string, validTo: string, currentId?: number): boolean => {
    const newStart = new Date(validFrom);
    const newEnd = validTo ? new Date(validTo) : new Date('2099-12-31');

    const overlapping = settings.filter(s => {
      if (currentId && s.id === currentId) return false;
      if (s.building_id !== buildingId) return false;
      if (!s.is_active) return false;
      const existingStart = new Date(s.valid_from);
      const existingEnd = s.valid_to ? new Date(s.valid_to) : new Date('2099-12-31');
      return newStart <= existingEnd && newEnd >= existingStart;
    });
    return overlapping.length > 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (!formData.building_id || formData.building_id === 0) {
      setMessage(t('pricing.selectBuilding'));
      return;
    }

    if (formData.valid_from && formData.valid_to) {
      const startDate = new Date(formData.valid_from);
      const endDate = new Date(formData.valid_to);
      if (endDate <= startDate) {
        setMessage(t('pricing.endDateBeforeStart'));
        return;
      }
    }

    if (formData.is_active) {
      const hasOverlap = checkDateOverlap(
        formData.building_id!,
        formData.valid_from!,
        formData.valid_to || '',
        editingSetting?.id
      );
      if (hasOverlap) {
        setMessage(t('pricing.dateOverlapError'));
        return;
      }
    }

    try {
      if (editingSetting) {
        await api.updateBillingSettings({ ...formData, id: editingSetting.id });
      } else {
        await api.createBillingSettings(formData);
      }
      setShowModal(false);
      setEditingSetting(null);
      resetForm();
      loadData();
      setMessage(t('pricing.saveSuccess'));
    } catch (err) {
      setMessage(t('pricing.saveFailed'));
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm(t('pricing.deleteConfirm'))) {
      try {
        await api.deleteBillingSettings(id);
        loadData();
        setMessage(t('pricing.deleteSuccess'));
      } catch (err) {
        setMessage(t('pricing.deleteFailed'));
      }
    }
  };

  const handleEdit = (setting: BillingSettings) => {
    setEditingSetting(setting);
    setFormData(setting);
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      building_id: 0,
      is_complex: false,
      normal_power_price: 0.25,
      solar_power_price: 0.15,
      car_charging_normal_price: 0.30,
      car_charging_priority_price: 0.40,
      vzev_export_price: 0.18,
      currency: 'CHF',
      valid_from: new Date().toISOString().split('T')[0],
      valid_to: '',
      is_active: true
    });
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const toggleBuildingExpand = (id: number) => {
    const newExpanded = new Set(expandedBuildings);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedBuildings(newExpanded);
  };

  const filteredBuildings = buildings.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.address_city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSettings = selectedBuildingId
    ? settings.filter(s => s.building_id === selectedBuildingId)
    : settings;

  const settingsByBuilding = buildings.map(building => ({
    building,
    settings: filteredSettings.filter(s => s.building_id === building.id)
  })).filter(group => group.settings.length > 0);

  const selectedBuilding = buildings.find(b => b.id === formData.building_id);
  const isComplexSelected = selectedBuilding?.is_group || false;

  // Stats
  const totalConfigs = settings.length;
  const activeConfigs = settings.filter(s => s.is_active).length;
  const buildingsWithPricing = new Set(settings.map(s => s.building_id)).size;

  const statsCards = [
    { label: t('pricing.totalConfigs'), value: totalConfigs, color: '#3b82f6', icon: <DollarSign size={20} /> },
    { label: t('pricing.activeConfigs'), value: activeConfigs, color: '#10b981', icon: <Check size={20} /> },
    { label: t('pricing.buildingsConfigured'), value: buildingsWithPricing, color: '#8b5cf6', icon: <Building size={20} /> }
  ];

  // Loading skeleton
  if (loading) {
    return (
      <div className="pricing-container" style={{ width: '100%', maxWidth: '100%' }}>
        {/* Header skeleton */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ width: '250px', height: '32px', backgroundColor: '#f3f4f6', borderRadius: '8px', marginBottom: '8px', animation: 'ps-shimmer 1.5s ease-in-out infinite' }} />
          <div style={{ width: '350px', height: '16px', backgroundColor: '#f3f4f6', borderRadius: '6px', animation: 'ps-shimmer 1.5s ease-in-out infinite', animationDelay: '0.1s' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', animation: 'ps-shimmer 1.5s ease-in-out infinite', animationDelay: `${i * 0.15}s` }}>
              <div style={{ width: '60%', height: '14px', backgroundColor: '#f3f4f6', borderRadius: '6px', marginBottom: '10px' }} />
              <div style={{ width: '40%', height: '28px', backgroundColor: '#f3f4f6', borderRadius: '6px' }} />
            </div>
          ))}
        </div>
        <style>{`@keyframes ps-shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  return (
    <div className="pricing-container" style={{ width: '100%', maxWidth: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: '24px', gap: '15px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{
            fontSize: isMobile ? '24px' : '36px',
            fontWeight: '800',
            marginBottom: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            <DollarSign size={isMobile ? 24 : 36} style={{ color: '#667eea' }} />
            {t('pricing.title')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: isMobile ? '14px' : '16px', margin: 0 }}>
            {t('pricing.subtitle')}
          </p>
        </div>
        <div className="button-group-header" style={{ display: 'flex', gap: '10px' }}>
          <button
            className="ps-btn-instructions"
            onClick={() => setShowInstructions(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: isMobile ? '8px 14px' : '10px 18px',
              backgroundColor: 'white', color: '#667eea',
              border: '1px solid #e5e7eb', borderRadius: '10px',
              fontSize: '14px', fontWeight: '500', cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
            }}
          >
            <HelpCircle size={18} />
            {!isMobile && (t('pricing.instructions.button') || 'Instructions')}
          </button>
          <button
            className="ps-btn-add"
            onClick={() => { resetForm(); setShowModal(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: isMobile ? '8px 14px' : '10px 18px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white', border: 'none', borderRadius: '10px',
              fontSize: '14px', fontWeight: '600', cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.35)'
            }}
          >
            <Plus size={18} />
            {t('pricing.addPricing')}
          </button>
        </div>
      </div>

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
            animation: 'ps-fadeSlideIn 0.4s ease-out both',
            animationDelay: `${idx * 0.1}s`
          }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '10px',
              backgroundColor: stat.color + '15', color: stat.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
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

      {/* Message */}
      {message && (
        <div style={{
          padding: '14px 18px', marginBottom: '20px', borderRadius: '12px',
          backgroundColor: message.includes('success') || message.includes('erfolgreich') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          color: message.includes('success') || message.includes('erfolgreich') ? '#059669' : '#dc2626',
          border: `1px solid ${message.includes('success') || message.includes('erfolgreich') ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
          fontSize: '14px', fontWeight: '500',
          animation: 'ps-fadeSlideIn 0.3s ease-out'
        }}>
          {message}
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          position: 'relative', maxWidth: '400px',
          backgroundColor: 'white', borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
        }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            placeholder={t('pricing.searchBuildings')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px 10px 42px',
              border: '1px solid #e5e7eb', borderRadius: '12px',
              fontSize: '14px', outline: 'none',
              transition: 'border-color 0.2s, box-shadow 0.2s'
            }}
            onFocus={focusHandler}
            onBlur={blurHandler}
          />
        </div>
      </div>

      {/* Building Filter Pills */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '8px',
        marginBottom: '24px',
        animation: 'ps-fadeSlideIn 0.4s ease-out both',
        animationDelay: '0.15s'
      }}>
        <button
          onClick={() => setSelectedBuildingId(null)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', borderRadius: '20px',
            border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
            transition: 'all 0.2s', whiteSpace: 'nowrap',
            ...(selectedBuildingId === null
              ? { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', boxShadow: '0 2px 8px rgba(102,126,234,0.3)' }
              : { backgroundColor: 'white', color: '#6b7280', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e5e7eb' }
            )
          }}
        >
          <Building size={14} />
          {t('pricing.allBuildings')}
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: '20px', height: '20px', padding: '0 6px', borderRadius: '10px',
            fontSize: '11px', fontWeight: '700',
            backgroundColor: selectedBuildingId === null ? 'rgba(255,255,255,0.25)' : '#f3f4f6',
            color: selectedBuildingId === null ? 'white' : '#9ca3af'
          }}>
            {settings.length}
          </span>
        </button>

        {filteredBuildings.map(building => {
          const count = settings.filter(s => s.building_id === building.id).length;
          const isActive = selectedBuildingId === building.id;
          return (
            <button
              key={building.id}
              onClick={() => setSelectedBuildingId(building.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '20px',
                border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                transition: 'all 0.2s', whiteSpace: 'nowrap',
                ...(isActive
                  ? { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', boxShadow: '0 2px 8px rgba(102,126,234,0.3)' }
                  : { backgroundColor: 'white', color: '#6b7280', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e5e7eb' }
                )
              }}
            >
              {building.is_group ? <Layers size={14} /> : <Building size={14} />}
              {building.name}
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: '20px', height: '20px', padding: '0 6px', borderRadius: '10px',
                fontSize: '11px', fontWeight: '700',
                backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : '#f3f4f6',
                color: isActive ? 'white' : '#9ca3af'
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Settings by Building */}
      {settingsByBuilding.length === 0 ? (
        <div style={{
          backgroundColor: 'white', borderRadius: '16px', padding: '60px 20px',
          textAlign: 'center', color: '#9ca3af',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          animation: 'ps-fadeSlideIn 0.4s ease-out'
        }}>
          <DollarSign size={48} style={{ color: '#e5e7eb', marginBottom: '12px' }} />
          <p style={{ fontSize: '16px', fontWeight: '500' }}>{t('pricing.noPricing')}</p>
        </div>
      ) : (
        settingsByBuilding.map(({ building, settings: buildingSettings }, groupIdx) => {
          const isExpanded = expandedBuildings.has(building.id);
          return (
            <div key={building.id} style={{
              marginBottom: '20px',
              animation: 'ps-fadeSlideIn 0.4s ease-out both',
              animationDelay: `${0.2 + groupIdx * 0.08}s`
            }}>
              {/* Building Header */}
              <div
                onClick={() => toggleBuildingExpand(building.id)}
                style={{
                  backgroundColor: 'white',
                  padding: '16px 20px',
                  borderRadius: isExpanded ? '14px 14px 0 0' : '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: '1px solid #e5e7eb',
                  borderBottom: isExpanded ? '1px solid #f3f4f6' : '1px solid #e5e7eb',
                  transition: 'all 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    backgroundColor: building.is_group ? '#8b5cf615' : '#3b82f615',
                    color: building.is_group ? '#8b5cf6' : '#3b82f6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    {building.is_group ? <Layers size={18} /> : <Building size={18} />}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h2 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: '#1f2937' }}>
                        {building.name}
                      </h2>
                      {building.is_group && (
                        <span style={{
                          padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                          backgroundColor: '#8b5cf615', color: '#8b5cf6'
                        }}>
                          {t('pricing.buildingType.vzevComplex')}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '13px', color: '#9ca3af', margin: '2px 0 0 0' }}>
                      {buildingSettings.length} {t('pricing.pricingSettings')}
                    </p>
                  </div>
                </div>
                <div style={{ color: '#9ca3af', transition: 'transform 0.2s' }}>
                  {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>
              </div>

              {/* Expanded Settings */}
              {isExpanded && (
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '0 0 14px 14px',
                  border: '1px solid #e5e7eb',
                  borderTop: 'none',
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                }}>
                  {/* Desktop Table */}
                  <div className="desktop-table">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f9fafb' }}>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('pricing.form.type')}</th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('pricing.normalKwh')}</th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('pricing.solarKwh')}</th>
                          {building.is_group && <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('pricing.vzevExportPrice')}</th>}
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('pricing.chargingNormal')}</th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('pricing.chargingPriority')}</th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('pricing.validPeriod')}</th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('common.status')}</th>
                          <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('common.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {buildingSettings.map((setting, idx) => (
                          <tr key={setting.id} style={{
                            borderTop: idx > 0 ? '1px solid #f3f4f6' : 'none',
                            transition: 'background-color 0.15s'
                          }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; }}
                          >
                            <td style={{ padding: '14px 16px' }}>
                              <span style={{
                                padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700',
                                backgroundColor: setting.is_complex ? '#8b5cf615' : '#f3f4f6',
                                color: setting.is_complex ? '#7c3aed' : '#6b7280',
                                textTransform: 'uppercase', letterSpacing: '0.3px'
                              }}>
                                {setting.is_complex ? t('pricing.buildingType.vzev') : t('pricing.buildingType.zev')}
                              </span>
                            </td>
                            <td style={{ padding: '14px 16px', fontWeight: '600', fontSize: '14px', color: '#1f2937' }}>
                              {setting.currency} {setting.normal_power_price.toFixed(2)}
                            </td>
                            <td style={{ padding: '14px 16px', fontWeight: '600', fontSize: '14px', color: '#f59e0b' }}>
                              {setting.currency} {setting.solar_power_price.toFixed(2)}
                            </td>
                            {building.is_group && (
                              <td style={{ padding: '14px 16px', fontWeight: '600', fontSize: '14px', color: '#8b5cf6' }}>
                                {setting.currency} {(setting.vzev_export_price || 0).toFixed(2)}
                              </td>
                            )}
                            <td style={{ padding: '14px 16px', fontWeight: '600', fontSize: '14px', color: '#1f2937' }}>
                              {setting.currency} {setting.car_charging_normal_price.toFixed(2)}
                            </td>
                            <td style={{ padding: '14px 16px', fontWeight: '600', fontSize: '14px', color: '#1f2937' }}>
                              {setting.currency} {setting.car_charging_priority_price.toFixed(2)}
                            </td>
                            <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6b7280' }}>
                              {formatDate(setting.valid_from)} {setting.valid_to ? `– ${formatDate(setting.valid_to)}` : `(${t('pricing.ongoing')})`}
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <span style={{
                                padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '700',
                                backgroundColor: setting.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                color: setting.is_active ? '#059669' : '#ef4444'
                              }}>
                                {setting.is_active ? t('common.active') : t('common.inactive')}
                              </span>
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                <button onClick={() => handleEdit(setting)} title={t('common.edit')} style={{
                                  width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                                  backgroundColor: 'rgba(59,130,246,0.08)', color: '#3b82f6',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  cursor: 'pointer', transition: 'all 0.15s'
                                }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.15)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.08)'; }}
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button onClick={() => handleDelete(setting.id)} title={t('common.delete')} style={{
                                  width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                                  backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  cursor: 'pointer', transition: 'all 0.15s'
                                }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)'; }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="mobile-cards" style={{ padding: '12px' }}>
                    {buildingSettings.map(setting => (
                      <div key={setting.id} style={{
                        backgroundColor: '#f9fafb',
                        borderRadius: '12px',
                        padding: '16px',
                        marginBottom: '10px',
                        border: '1px solid #e5e7eb'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '14px' }}>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{
                              padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700',
                              backgroundColor: setting.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                              color: setting.is_active ? '#059669' : '#ef4444'
                            }}>
                              {setting.is_active ? t('common.active') : t('common.inactive')}
                            </span>
                            <span style={{
                              padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700',
                              backgroundColor: setting.is_complex ? '#8b5cf615' : '#f3f4f6',
                              color: setting.is_complex ? '#7c3aed' : '#6b7280'
                            }}>
                              {setting.is_complex ? t('pricing.buildingType.vzev') : t('pricing.buildingType.zev')}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => handleEdit(setting)} style={{
                              width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                              backgroundColor: 'rgba(59,130,246,0.08)', color: '#3b82f6',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                            }}>
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => handleDelete(setting.id)} style={{
                              width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                              backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                            }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                              <Zap size={12} color="#3b82f6" />
                              <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600' }}>{t('pricing.normalKwh')}</span>
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937' }}>
                              {setting.currency} {setting.normal_power_price.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                              <Sun size={12} color="#f59e0b" />
                              <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600' }}>{t('pricing.solarKwh')}</span>
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: '700', color: '#f59e0b' }}>
                              {setting.currency} {setting.solar_power_price.toFixed(2)}
                            </div>
                          </div>
                          {building.is_group && (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                <Layers size={12} color="#8b5cf6" />
                                <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600' }}>{t('pricing.vzevExportPrice')}</span>
                              </div>
                              <div style={{ fontSize: '15px', fontWeight: '700', color: '#8b5cf6' }}>
                                {setting.currency} {(setting.vzev_export_price || 0).toFixed(2)}
                              </div>
                            </div>
                          )}
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                              <Car size={12} color="#6b7280" />
                              <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600' }}>{t('pricing.chargingNormal')}</span>
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937' }}>
                              {setting.currency} {setting.car_charging_normal_price.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                              <Car size={12} color="#ef4444" />
                              <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600' }}>{t('pricing.chargingPriority')}</span>
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937' }}>
                              {setting.currency} {setting.car_charging_priority_price.toFixed(2)}
                            </div>
                          </div>
                        </div>

                        <div style={{ paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                          <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{t('pricing.validPeriod')}</div>
                          <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>
                            {formatDate(setting.valid_from)} {setting.valid_to ? `– ${formatDate(setting.valid_to)}` : `(${t('pricing.ongoing')})`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Instructions Modal */}
      {showInstructions && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 2000, padding: '20px'
        }} onClick={(e) => { if (e.target === e.currentTarget) setShowInstructions(false); }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '20px', maxWidth: '700px',
            maxHeight: '90vh', overflow: 'auto', width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            animation: 'ps-slideUp 0.25s ease-out'
          }}>
            {/* Instructions Header */}
            <div style={{
              padding: '24px 28px 20px', borderBottom: '1px solid #f3f4f6',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1, borderRadius: '20px 20px 0 0'
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937', margin: 0 }}>
                {t('pricing.instructions.title')}
              </h2>
              <button onClick={() => setShowInstructions(false)} style={{
                width: '32px', height: '32px', borderRadius: '50%', border: 'none',
                backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#6b7280', transition: 'background-color 0.15s'
              }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Instructions Body */}
            <div style={{ padding: '24px 28px', lineHeight: '1.8', color: '#374151' }}>
              <div style={{ backgroundColor: '#eff6ff', padding: '16px', borderRadius: '12px', marginBottom: '16px', border: '1px solid #bfdbfe' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px', color: '#1e40af' }}>
                  {t('pricing.instructions.whatIsPricing')}
                </h3>
                <p style={{ margin: 0, fontSize: '14px' }}>{t('pricing.instructions.pricingDescription')}</p>
              </div>

              <div style={{ backgroundColor: '#fefce8', padding: '16px', borderRadius: '12px', marginBottom: '16px', border: '1px solid #fde68a' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px', color: '#a16207' }}>
                  {t('pricing.zevVsVzev.title')}
                </h3>
                <div style={{ marginBottom: '12px' }}>
                  <strong>{t('pricing.zevVsVzev.zev.title')}</strong>
                  <ul style={{ marginLeft: '20px', marginTop: '8px', fontSize: '14px' }}>
                    <li>{t('pricing.zevVsVzev.zev.item1')}</li>
                    <li>{t('pricing.zevVsVzev.zev.item2')}</li>
                    <li>{t('pricing.zevVsVzev.zev.item3')}</li>
                    <li>{t('pricing.zevVsVzev.zev.item4')}</li>
                  </ul>
                </div>
                <div>
                  <strong>{t('pricing.zevVsVzev.vzev.title')}</strong>
                  <ul style={{ marginLeft: '20px', marginTop: '8px', fontSize: '14px' }}>
                    <li>{t('pricing.zevVsVzev.vzev.item1')}</li>
                    <li>{t('pricing.zevVsVzev.vzev.item2')}</li>
                    <li>{t('pricing.zevVsVzev.vzev.item3')}</li>
                    <li>{t('pricing.zevVsVzev.vzev.item4')}</li>
                  </ul>
                </div>
              </div>

              <div style={{ backgroundColor: '#fefce8', padding: '16px', borderRadius: '12px', marginBottom: '16px', border: '1px solid #fde68a' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px', color: '#a16207' }}>
                  {t('pricing.instructions.howPricingWorks')}
                </h3>
                <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
                  <li>{t('pricing.instructions.work1')}</li>
                  <li>{t('pricing.instructions.work2')}</li>
                  <li>{t('pricing.instructions.work3')}</li>
                  <li>{t('pricing.instructions.work4')}</li>
                  <li><strong>{t('pricing.instructions.vzevWork')}</strong></li>
                </ul>
              </div>

              <h3 style={{ fontSize: '16px', fontWeight: '700', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
                {t('pricing.instructions.howToUse')}
              </h3>
              <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
                <li>{t('pricing.instructions.step1')}</li>
                <li>{t('pricing.instructions.step2')}</li>
                <li>{t('pricing.instructions.step3')}</li>
                <li>{t('pricing.instructions.step4')}</li>
                <li>{t('pricing.instructions.step5')}</li>
                <li><strong>{t('pricing.instructions.vzevStep')}</strong></li>
              </ul>

              <div style={{ backgroundColor: '#fef2f2', padding: '16px', borderRadius: '12px', marginTop: '16px', border: '1px solid #fecaca' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '8px', color: '#dc2626' }}>
                  {t('pricing.instructions.important')}
                </h3>
                <ul style={{ marginLeft: '20px', fontSize: '13px' }}>
                  <li>{t('pricing.instructions.important1')}</li>
                  <li>{t('pricing.instructions.important2')}</li>
                  <li>{t('pricing.instructions.important3')}</li>
                  <li><strong>{t('pricing.instructions.vzevImportant')}</strong></li>
                </ul>
              </div>

              <div style={{ backgroundColor: '#f0fdf4', padding: '16px', borderRadius: '12px', marginTop: '16px', border: '1px solid #bbf7d0' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '8px', color: '#059669' }}>
                  {t('pricing.instructions.tips')}
                </h3>
                <ul style={{ marginLeft: '20px', fontSize: '13px' }}>
                  <li>{t('pricing.instructions.tip1')}</li>
                  <li>{t('pricing.instructions.tip2')}</li>
                  <li>{t('pricing.instructions.tip3')}</li>
                  <li><strong>{t('pricing.vzevExportPriceTip')}</strong></li>
                </ul>
              </div>
            </div>

            {/* Instructions Footer */}
            <div style={{ padding: '16px 28px 24px', borderTop: '1px solid #f3f4f6', position: 'sticky', bottom: 0, backgroundColor: 'white', borderRadius: '0 0 20px 20px' }}>
              <button onClick={() => setShowInstructions(false)} style={{
                width: '100%', padding: '12px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white', border: 'none', borderRadius: '10px',
                fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(102, 126, 234, 0.35)'
              }}>
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Form Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '15px'
        }} onClick={(e) => { if (e.target === e.currentTarget) { setShowModal(false); setEditingSetting(null); } }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '20px',
            width: '90%', maxWidth: '600px', maxHeight: '90vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            animation: 'ps-slideUp 0.25s ease-out'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '24px 28px 20px',
              borderBottom: '1px solid #f3f4f6',
              display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0
            }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)', flexShrink: 0
              }}>
                <DollarSign size={22} color="white" />
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', margin: 0 }}>
                  {editingSetting ? t('pricing.editPricing') : t('pricing.addPricing')}
                </h2>
                <p style={{ fontSize: '13px', color: '#9ca3af', margin: '2px 0 0' }}>
                  {t('pricing.subtitle')}
                </p>
              </div>
              <button onClick={() => { setShowModal(false); setEditingSetting(null); }} style={{
                width: '32px', height: '32px', borderRadius: '50%', border: 'none',
                backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#6b7280', transition: 'background-color 0.15s'
              }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1, backgroundColor: '#f9fafb' }}>
              <form id="pricing-form" onSubmit={handleSubmit}>
                {/* Building Selection */}
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '18px', border: '1px solid #e5e7eb', marginBottom: '16px' }}>
                  <label style={labelStyle}>{t('users.building')} *</label>
                  <select
                    required
                    value={formData.building_id}
                    onChange={(e) => {
                      const buildingId = parseInt(e.target.value);
                      const building = buildings.find(b => b.id === buildingId);
                      setFormData({
                        ...formData,
                        building_id: buildingId,
                        is_complex: building?.is_group || false
                      });
                    }}
                    style={inputStyle(isMobile)}
                    onFocus={focusHandler}
                    onBlur={blurHandler}
                  >
                    <option value={0}>{t('users.selectBuilding')}</option>
                    {buildings.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} {b.is_group ? `(${t('pricing.buildingType.vzevComplex')})` : `(${t('pricing.buildingType.zevBuilding')})`}
                      </option>
                    ))}
                  </select>

                  {isComplexSelected && (
                    <div style={{
                      marginTop: '12px', padding: '10px 14px',
                      backgroundColor: '#8b5cf610', borderRadius: '8px',
                      border: '1px solid #8b5cf630'
                    }}>
                      <p style={{ margin: 0, fontSize: '13px', color: '#7c3aed', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Layers size={14} /> {t('pricing.vzevComplexSelected')}
                      </p>
                    </div>
                  )}
                </div>

                {/* Power Prices */}
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '18px', border: '1px solid #e5e7eb', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Zap size={14} color="#3b82f6" /> {t('pricing.powerPricesSection')}
                  </div>
                  <div className="form-row" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label style={labelStyle}>{t('pricing.normalPower')} *</label>
                      <input type="number" step="0.01" required value={formData.normal_power_price}
                        onChange={(e) => setFormData({ ...formData, normal_power_price: parseFloat(e.target.value) })}
                        style={inputStyle(isMobile)}
                        onFocus={focusHandler} onBlur={blurHandler} />
                    </div>
                    <div>
                      <label style={labelStyle}>{t('pricing.solarPower')} *</label>
                      <input type="number" step="0.01" required value={formData.solar_power_price}
                        onChange={(e) => setFormData({ ...formData, solar_power_price: parseFloat(e.target.value) })}
                        style={inputStyle(isMobile)}
                        onFocus={focusHandler} onBlur={blurHandler} />
                    </div>
                  </div>

                  {isComplexSelected && (
                    <div style={{ marginTop: '14px' }}>
                      <label style={labelStyle}>{t('pricing.vzevExportPriceUnit')} *</label>
                      <input type="number" step="0.01" required value={formData.vzev_export_price || 0.18}
                        onChange={(e) => setFormData({ ...formData, vzev_export_price: parseFloat(e.target.value) })}
                        style={inputStyle(isMobile)}
                        onFocus={focusHandler} onBlur={blurHandler} />
                      <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                        {t('pricing.vzevExportPriceDescription')}
                      </p>
                    </div>
                  )}
                </div>

                {/* Charging Prices */}
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '18px', border: '1px solid #e5e7eb', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Car size={14} color="#f59e0b" /> {t('pricing.chargingPricesSection')}
                  </div>
                  <div className="form-row" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label style={labelStyle}>{t('pricing.chargingNormal')} *</label>
                      <input type="number" step="0.01" required value={formData.car_charging_normal_price}
                        onChange={(e) => setFormData({ ...formData, car_charging_normal_price: parseFloat(e.target.value) })}
                        style={inputStyle(isMobile)}
                        onFocus={focusHandler} onBlur={blurHandler} />
                    </div>
                    <div>
                      <label style={labelStyle}>{t('pricing.chargingPriority')} *</label>
                      <input type="number" step="0.01" required value={formData.car_charging_priority_price}
                        onChange={(e) => setFormData({ ...formData, car_charging_priority_price: parseFloat(e.target.value) })}
                        style={inputStyle(isMobile)}
                        onFocus={focusHandler} onBlur={blurHandler} />
                    </div>
                  </div>
                </div>

                {/* Validity */}
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '18px', border: '1px solid #e5e7eb', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>
                    {t('pricing.validPeriod')}
                  </div>
                  <div className="form-row" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label style={labelStyle}>{t('pricing.validFrom')} *</label>
                      <input type="date" required value={formData.valid_from}
                        onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                        style={inputStyle(isMobile)}
                        onFocus={focusHandler} onBlur={blurHandler} />
                    </div>
                    <div>
                      <label style={labelStyle}>{t('pricing.validTo')} ({t('common.optional')})</label>
                      <input type="date" value={formData.valid_to}
                        onChange={(e) => setFormData({ ...formData, valid_to: e.target.value })}
                        style={inputStyle(isMobile)}
                        onFocus={focusHandler} onBlur={blurHandler} />
                    </div>
                  </div>
                </div>

                {/* Options */}
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '18px', border: '1px solid #e5e7eb' }}>
                  <CustomCheckbox
                    checked={formData.is_active ?? true}
                    onChange={(v) => setFormData({ ...formData, is_active: v })}
                    label={t('pricing.activeUseForBilling')}
                  />
                </div>

                {/* Error Message in Form */}
                {message && showModal && (
                  <div style={{
                    marginTop: '14px', padding: '12px 14px', borderRadius: '10px',
                    backgroundColor: 'rgba(239,68,68,0.1)', color: '#dc2626',
                    border: '1px solid rgba(239,68,68,0.2)',
                    fontSize: '13px', fontWeight: '500'
                  }}>
                    {message}
                  </div>
                )}
              </form>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 28px 20px',
              borderTop: '1px solid #f3f4f6',
              display: 'flex', gap: '12px', flexShrink: 0
            }}>
              <button type="button" onClick={() => { setShowModal(false); setEditingSetting(null); }} style={{
                flex: 1, padding: '12px', backgroundColor: 'white', color: '#6b7280',
                border: '1px solid #e5e7eb', borderRadius: '10px',
                fontSize: '14px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s'
              }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f9fafb'; e.currentTarget.style.borderColor = '#d1d5db'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
              >
                {t('common.cancel')}
              </button>
              <button type="submit" form="pricing-form" style={{
                flex: 1, padding: '12px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white', border: 'none', borderRadius: '10px',
                fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(102, 126, 234, 0.35)',
                transition: 'all 0.15s'
              }}>
                {editingSetting ? t('common.update') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ps-fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes ps-shimmer {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @keyframes ps-slideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .ps-btn-instructions:hover {
          border-color: #667eea !important;
          color: #764ba2 !important;
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15) !important;
        }

        .ps-btn-add:hover {
          box-shadow: 0 4px 14px rgba(102, 126, 234, 0.45) !important;
          transform: translateY(-1px);
        }

        @media (min-width: 769px) {
          .mobile-cards {
            display: none;
          }
        }

        @media (max-width: 768px) {
          .desktop-table {
            display: none;
          }

          .mobile-cards {
            display: block;
          }

          .button-group-header {
            width: 100%;
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
