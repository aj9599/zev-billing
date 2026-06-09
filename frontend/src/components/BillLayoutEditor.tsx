import { useEffect, useState } from 'react';
import { X, Palette, FileText, Save, Info } from 'lucide-react';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import type { Building } from '../types';

interface BillLayoutEditorProps {
  isOpen: boolean;
  buildings: Building[];
  initialBuildingId?: number;
  onClose: () => void;
}

interface LayoutForm {
  title: string;
  intro_text: string;
  footer_text: string;
  primary_color: string;
}

const DEFAULT_LAYOUT: LayoutForm = {
  title: '',
  intro_text: '',
  footer_text: '',
  primary_color: '#667EEA',
};

export default function BillLayoutEditor({
  isOpen,
  buildings,
  initialBuildingId,
  onClose,
}: BillLayoutEditorProps) {
  const { t } = useTranslation();
  const [buildingId, setBuildingId] = useState<number | null>(null);
  const [form, setForm] = useState<LayoutForm>(DEFAULT_LAYOUT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Filter to non-group buildings (layouts are per concrete building).
  const eligibleBuildings = buildings.filter(b => !b.is_group);

  useEffect(() => {
    if (!isOpen) return;
    setMessage(null);
    const target = initialBuildingId && eligibleBuildings.some(b => b.id === initialBuildingId)
      ? initialBuildingId
      : eligibleBuildings[0]?.id ?? null;
    setBuildingId(target);
  }, [isOpen, initialBuildingId, buildings.length]);

  useEffect(() => {
    if (!isOpen || buildingId == null) return;
    let cancelled = false;
    setLoading(true);
    api.getBillLayout(buildingId)
      .then(data => {
        if (cancelled) return;
        setForm({
          title: data.title || '',
          intro_text: data.intro_text || '',
          footer_text: data.footer_text || '',
          primary_color: data.primary_color || '#667EEA',
        });
      })
      .catch(() => {
        if (!cancelled) setForm(DEFAULT_LAYOUT);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, buildingId]);

  const handleSave = async () => {
    if (buildingId == null) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.updateBillLayout(buildingId, form);
      setMessage({ kind: 'ok', text: t('billLayout.saved') });
    } catch (err: any) {
      setMessage({ kind: 'err', text: t('billLayout.saveFailed') + (err?.message ? `: ${err.message}` : '') });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setForm(DEFAULT_LAYOUT);
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '14px',
        maxWidth: '880px', width: '100%', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #f3f4f6',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '10px',
              background: '#667eea',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Palette size={18} color="white" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#1f2937' }}>
                {t('billLayout.title')}
              </h2>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                {t('billLayout.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: 'none', backgroundColor: '#f3f4f6', color: '#6b7280',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {/* Building selector */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>
              {t('billLayout.building')}
            </label>
            <select
              value={buildingId ?? ''}
              onChange={(e) => setBuildingId(e.target.value ? Number(e.target.value) : null)}
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
                borderRadius: '8px', fontSize: '14px', outline: 'none', backgroundColor: 'white'
              }}
            >
              {eligibleBuildings.length === 0 && (
                <option value="">{t('billLayout.noBuildings')}</option>
              )}
              {eligibleBuildings.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* QR-page note */}
          <div style={{
            padding: '12px 14px', backgroundColor: '#fffbeb',
            border: '1px solid #fde68a', borderRadius: '8px',
            marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'flex-start'
          }}>
            <Info size={16} style={{ color: '#b45309', marginTop: 2, flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: '12px', color: '#92400e', lineHeight: 1.5 }}>
              {t('billLayout.qrPageNote')}
            </p>
          </div>

          {message && (
            <div style={{
              padding: '10px 14px', marginBottom: '16px', borderRadius: '8px',
              backgroundColor: message.kind === 'ok' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              color: message.kind === 'ok' ? '#059669' : '#dc2626',
              border: `1px solid ${message.kind === 'ok' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
              fontSize: '13px', fontWeight: 600
            }}>
              {message.text}
            </div>
          )}

          {/* Form fields */}
          <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                  <FileText size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  {t('billLayout.titleField')}
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder={t('billLayout.titlePlaceholder')}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
                    borderRadius: '8px', fontSize: '14px', outline: 'none'
                  }}
                />
                <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0 0' }}>
                  {t('billLayout.titleHelp')}
                </p>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                  <Palette size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  {t('billLayout.colorField')}
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={form.primary_color}
                    onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                    style={{ width: 44, height: 38, padding: 0, border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', background: 'white' }}
                  />
                  <input
                    type="text"
                    value={form.primary_color}
                    onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                    style={{
                      flex: 1, padding: '10px 12px', border: '1px solid #e5e7eb',
                      borderRadius: '8px', fontSize: '13px', outline: 'none', fontFamily: 'monospace'
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                {t('billLayout.introField')}
              </label>
              <textarea
                value={form.intro_text}
                onChange={(e) => setForm({ ...form, intro_text: e.target.value })}
                placeholder={t('billLayout.introPlaceholder')}
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
                  borderRadius: '8px', fontSize: '13px', outline: 'none', resize: 'vertical', lineHeight: 1.5
                }}
              />
              <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0 0' }}>
                {t('billLayout.introHelp')}
              </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                {t('billLayout.footerField')}
              </label>
              <textarea
                value={form.footer_text}
                onChange={(e) => setForm({ ...form, footer_text: e.target.value })}
                placeholder={t('billLayout.footerPlaceholder')}
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
                  borderRadius: '8px', fontSize: '13px', outline: 'none', resize: 'vertical', lineHeight: 1.5
                }}
              />
              <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0 0' }}>
                {t('billLayout.footerHelp')}
              </p>
            </div>
          </div>

          {/* Mini preview */}
          <div style={{
            marginTop: '16px', borderRadius: 10,
            border: '1px solid #e5e7eb', overflow: 'hidden', backgroundColor: '#fafafa'
          }}>
            <div style={{ padding: '8px 12px', fontSize: 11, color: '#6b7280', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f3f4f6', fontWeight: 600 }}>
              {t('billLayout.preview')}
            </div>
            <div style={{ padding: '20px 24px', backgroundColor: 'white' }}>
              <div style={{ borderBottom: `2px solid ${form.primary_color}`, paddingBottom: 8, marginBottom: 12 }}>
                <h1 style={{ margin: 0, fontSize: 20, color: form.primary_color }}>
                  {form.title || t('billLayout.previewTitleFallback')}
                </h1>
              </div>
              {form.intro_text && (
                <div style={{
                  padding: '8px 10px', background: '#f8fafc',
                  borderLeft: `3px solid ${form.primary_color}`,
                  fontSize: 12, lineHeight: 1.5, marginBottom: 8, whiteSpace: 'pre-wrap'
                }}>{form.intro_text}</div>
              )}
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {t('billLayout.previewPlaceholder')}
              </div>
              {form.footer_text && (
                <div style={{
                  padding: '8px 10px', background: '#f8fafc',
                  borderLeft: `3px solid ${form.primary_color}`,
                  fontSize: 12, lineHeight: 1.5, marginTop: 8, whiteSpace: 'pre-wrap'
                }}>{form.footer_text}</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #f3f4f6',
          display: 'flex', justifyContent: 'space-between', gap: 12,
          backgroundColor: '#fafafa'
        }}>
          <button
            onClick={handleReset}
            style={{
              padding: '10px 18px', backgroundColor: 'white', color: '#6b7280',
              border: '1px solid #e5e7eb', borderRadius: 10, cursor: 'pointer',
              fontSize: 13, fontWeight: 600
            }}
          >
            {t('billLayout.reset')}
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                padding: '10px 18px', backgroundColor: 'white', color: '#374151',
                border: '1px solid #e5e7eb', borderRadius: 10, cursor: 'pointer',
                fontSize: 13, fontWeight: 600
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || buildingId == null}
              style={{
                padding: '10px 18px',
                background: saving ? '#d1d5db' : '#667eea',
                color: 'white', border: 'none', borderRadius: 10,
                cursor: saving || buildingId == null ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              <Save size={14} />
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
