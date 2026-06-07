import { useEffect, useState } from 'react';
import { Plus, Power, Edit2, Trash2, X, Zap, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import type { Device, DeviceLiveStatus, Building as BuildingType } from '../types';

type FormState = {
  id?: number;
  name: string;
  building_id: number;
  driver: 'shelly' | 'loxone';
  is_active: boolean;
  // shelly
  shelly_host: string;
  shelly_gen: number;
  shelly_channel: number;
  shelly_auth_user: string;
  shelly_auth_pass: string;
  // loxone
  loxone_host: string;
  loxone_username: string;
  loxone_password: string;
  loxone_output_uuid: string;
  // control
  switch_on_threshold_w: number;
  switch_off_threshold_w: number;
  min_runtime_seconds: number;
  min_offtime_seconds: number;
  priority: number;
  // schedule (single optional window)
  schedule_enabled: boolean;
  schedule_from: string;
  schedule_to: string;
  schedule_days: number[];
};

const emptyForm = (): FormState => ({
  name: '',
  building_id: 0,
  driver: 'shelly',
  is_active: true,
  shelly_host: '',
  shelly_gen: 1,
  shelly_channel: 0,
  shelly_auth_user: '',
  shelly_auth_pass: '',
  loxone_host: '',
  loxone_username: '',
  loxone_password: '',
  loxone_output_uuid: '',
  switch_on_threshold_w: 1000,
  switch_off_threshold_w: 0,
  min_runtime_seconds: 300,
  min_offtime_seconds: 300,
  priority: 100,
  schedule_enabled: false,
  schedule_from: '10:00',
  schedule_to: '16:00',
  schedule_days: [1, 2, 3, 4, 5, 6, 7],
});

const card: React.CSSProperties = { backgroundColor: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e5e7eb' };
const label: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '4px' };
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' };

export default function Devices() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<Device[]>([]);
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [status, setStatus] = useState<Record<number, DeviceLiveStatus>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [testResult, setTestResult] = useState<string>('');
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadData();
    refreshStatus();
    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    try {
      const [devs, blds] = await Promise.all([api.getDevices(), api.getBuildings()]);
      setDevices(devs);
      setBuildings(blds.filter((b) => !b.is_group));
    } finally {
      setLoading(false);
    }
  }

  async function refreshStatus() {
    try {
      const list = await api.getDeviceLiveStatus();
      const map: Record<number, DeviceLiveStatus> = {};
      for (const s of list) map[s.device_id] = s;
      setStatus(map);
    } catch {
      /* ignore transient */
    }
  }

  const buildingName = (id: number) => buildings.find((b) => b.id === id)?.name || `#${id}`;

  function openCreate() {
    const f = emptyForm();
    f.building_id = buildings[0]?.id || 0;
    setForm(f);
    setTestResult('');
    setShowModal(true);
  }

  function openEdit(d: Device) {
    const f = emptyForm();
    f.id = d.id;
    f.name = d.name;
    f.building_id = d.building_id;
    f.driver = (d.driver as 'shelly' | 'loxone') || 'shelly';
    f.is_active = d.is_active;
    f.switch_on_threshold_w = d.switch_on_threshold_w;
    f.switch_off_threshold_w = d.switch_off_threshold_w;
    f.min_runtime_seconds = d.min_runtime_seconds;
    f.min_offtime_seconds = d.min_offtime_seconds;
    f.priority = d.priority;
    try {
      const cfg = JSON.parse(d.connection_config || '{}');
      if (f.driver === 'shelly') {
        f.shelly_host = cfg.host || '';
        f.shelly_gen = cfg.gen || 1;
        f.shelly_channel = cfg.channel || 0;
        f.shelly_auth_user = cfg.auth_user || '';
        f.shelly_auth_pass = cfg.auth_pass || '';
      } else {
        f.loxone_host = cfg.host || '';
        f.loxone_username = cfg.username || '';
        f.loxone_password = cfg.password || '';
        f.loxone_output_uuid = cfg.output_uuid || '';
      }
    } catch { /* ignore */ }
    if (d.schedule_json) {
      try {
        const arr = JSON.parse(d.schedule_json);
        if (Array.isArray(arr) && arr[0]) {
          f.schedule_enabled = true;
          f.schedule_from = arr[0].from || '10:00';
          f.schedule_to = arr[0].to || '16:00';
          f.schedule_days = Array.isArray(arr[0].days) && arr[0].days.length ? arr[0].days : [1, 2, 3, 4, 5, 6, 7];
        }
      } catch { /* ignore */ }
    }
    setForm(f);
    setTestResult('');
    setShowModal(true);
  }

  function buildPayload(f: FormState): Partial<Device> {
    const connection_config =
      f.driver === 'shelly'
        ? JSON.stringify({
            host: f.shelly_host.trim(),
            gen: Number(f.shelly_gen) || 1,
            channel: Number(f.shelly_channel) || 0,
            auth_user: f.shelly_auth_user,
            auth_pass: f.shelly_auth_pass,
          })
        : JSON.stringify({
            host: f.loxone_host.trim(),
            username: f.loxone_username,
            password: f.loxone_password,
            output_uuid: f.loxone_output_uuid.trim(),
          });
    const schedule_json = f.schedule_enabled
      ? JSON.stringify([{ days: f.schedule_days, from: f.schedule_from, to: f.schedule_to }])
      : null;
    return {
      name: f.name.trim(),
      building_id: Number(f.building_id),
      driver: f.driver,
      connection_config,
      switch_on_threshold_w: Number(f.switch_on_threshold_w),
      switch_off_threshold_w: Number(f.switch_off_threshold_w),
      min_runtime_seconds: Number(f.min_runtime_seconds),
      min_offtime_seconds: Number(f.min_offtime_seconds),
      priority: Number(f.priority),
      schedule_json,
      is_active: f.is_active,
    };
  }

  async function save() {
    if (!form.name.trim() || !form.building_id) {
      setMessage(t('devices.validation'));
      return;
    }
    const payload = buildPayload(form);
    try {
      if (form.id) await api.updateDevice(form.id, payload);
      else await api.createDevice(payload);
      setShowModal(false);
      await loadData();
      refreshStatus();
    } catch {
      setMessage(t('devices.saveError'));
    }
  }

  async function runTest() {
    if (!form.id) {
      setTestResult(t('devices.saveFirst'));
      return;
    }
    setTesting(true);
    setTestResult('');
    try {
      const r = await api.testDevice(form.id);
      setTestResult(r.online ? `${t('devices.online')} — ${r.state}` : `${t('devices.offline')}${r.error ? ': ' + r.error : ''}`);
    } catch {
      setTestResult(t('devices.offline'));
    } finally {
      setTesting(false);
    }
  }

  async function control(d: Device, mode: 'auto' | 'on' | 'off') {
    try {
      await api.controlDevice(d.id, mode);
      await loadData();
      refreshStatus();
    } catch {
      setMessage(t('devices.controlError'));
    }
  }

  async function remove(d: Device) {
    if (!confirm(t('devices.confirmDelete').replace('{name}', d.name))) return;
    await api.deleteDevice(d.id);
    await loadData();
  }

  const stateBadge = (d: Device) => {
    const s = status[d.id];
    const state = s?.state || 'unknown';
    const colors: Record<string, { bg: string; fg: string }> = {
      on: { bg: '#10b98115', fg: '#059669' },
      off: { bg: '#f3f4f6', fg: '#6b7280' },
      offline: { bg: '#ef444415', fg: '#dc2626' },
      unknown: { bg: '#f3f4f6', fg: '#9ca3af' },
    };
    const c = colors[state] || colors.unknown;
    return (
      <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, backgroundColor: c.bg, color: c.fg, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        {state === 'offline' ? <WifiOff size={12} /> : <Wifi size={12} />}
        {t(`devices.state.${state}`)}
      </span>
    );
  };

  if (loading) {
    return <div style={{ padding: '40px', color: '#6b7280' }}>{t('common.loading')}</div>;
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Power size={24} color="#10b981" /> {t('devices.title')}
          </h1>
          <p style={{ color: '#6b7280', margin: '6px 0 0', fontSize: '14px' }}>{t('devices.subtitle')}</p>
        </div>
        <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '10px', padding: '10px 16px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={16} /> {t('devices.add')}
        </button>
      </div>

      {message && (
        <div style={{ backgroundColor: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', margin: '12px 0', fontSize: '14px' }} onClick={() => setMessage('')}>
          {message}
        </div>
      )}

      {devices.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '48px', color: '#9ca3af', marginTop: '16px' }}>
          <Power size={40} style={{ opacity: 0.4 }} />
          <p style={{ marginTop: '12px' }}>{t('devices.empty')}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px', marginTop: '16px' }}>
          {devices.map((d) => {
            const s = status[d.id];
            return (
              <div key={d.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '16px' }}>{d.name}</div>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                      {buildingName(d.building_id)} · {d.driver}
                    </div>
                  </div>
                  {stateBadge(d)}
                </div>

                <div style={{ display: 'flex', gap: '12px', margin: '12px 0', fontSize: '13px', color: '#374151', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Zap size={13} color="#f59e0b" />
                    {s && s.has_signal ? `${Math.round(s.building_surplus_w)} W` : t('devices.noSignal')}
                  </span>
                  <span>· {t('devices.modeLabel')}: <strong>{t(`devices.mode.${(s?.mode || d.control_mode)}`)}</strong></span>
                  <span>· {t('devices.onThresholdShort')}: {Math.round(d.switch_on_threshold_w)} W</span>
                </div>

                {s?.last_error && (
                  <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '8px' }}>{s.last_error}</div>
                )}

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button onClick={() => control(d, 'on')} style={btn('#10b981', (s?.mode === 'on'))}>{t('devices.on')}</button>
                  <button onClick={() => control(d, 'off')} style={btn('#ef4444', (s?.mode === 'off'))}>{t('devices.off')}</button>
                  <button onClick={() => control(d, 'auto')} style={btn('#3b82f6', (s?.mode === 'auto' || !s))}>{t('devices.auto')}</button>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => openEdit(d)} title={t('common.edit')} style={iconBtn}><Edit2 size={15} /></button>
                  <button onClick={() => remove(d)} title={t('common.delete')} style={{ ...iconBtn, color: '#dc2626' }}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px', zIndex: 50, overflowY: 'auto' }}>
          <div style={{ backgroundColor: '#f9fafb', borderRadius: '16px', width: '100%', maxWidth: '560px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>{form.id ? t('devices.edit') : t('devices.add')}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={card}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={label}>{t('devices.name')} *</label>
                    <input style={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <label style={label}>{t('devices.building')} *</label>
                    <select style={input} value={form.building_id} onChange={(e) => setForm({ ...form, building_id: Number(e.target.value) })}>
                      <option value={0}>—</option>
                      {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: '12px' }}>
                  <label style={label}>{t('devices.driver')}</label>
                  <select style={input} value={form.driver} onChange={(e) => setForm({ ...form, driver: e.target.value as 'shelly' | 'loxone' })}>
                    <option value="shelly">Shelly</option>
                    <option value="loxone">Loxone</option>
                  </select>
                </div>
              </div>

              {/* Connection */}
              <div style={card}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '12px' }}>{t('devices.connection')}</div>
                {form.driver === 'shelly' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={label}>{t('devices.host')} *</label>
                        <input style={input} placeholder="192.168.1.50" value={form.shelly_host} onChange={(e) => setForm({ ...form, shelly_host: e.target.value })} />
                      </div>
                      <div>
                        <label style={label}>{t('devices.generation')}</label>
                        <select style={input} value={form.shelly_gen} onChange={(e) => setForm({ ...form, shelly_gen: Number(e.target.value) })}>
                          <option value={1}>Gen 1</option>
                          <option value={2}>Gen 2+</option>
                        </select>
                      </div>
                      <div>
                        <label style={label}>{t('devices.channel')}</label>
                        <input type="number" style={input} value={form.shelly_channel} onChange={(e) => setForm({ ...form, shelly_channel: Number(e.target.value) })} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={label}>{t('devices.authUser')} ({t('common.optional')})</label>
                        <input style={input} value={form.shelly_auth_user} onChange={(e) => setForm({ ...form, shelly_auth_user: e.target.value })} />
                      </div>
                      <div>
                        <label style={label}>{t('devices.authPass')} ({t('common.optional')})</label>
                        <input type="password" style={input} value={form.shelly_auth_pass} onChange={(e) => setForm({ ...form, shelly_auth_pass: e.target.value })} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={label}>{t('devices.host')} *</label>
                      <input style={input} placeholder="192.168.1.100" value={form.loxone_host} onChange={(e) => setForm({ ...form, loxone_host: e.target.value })} />
                    </div>
                    <div>
                      <label style={label}>{t('devices.outputUuid')} *</label>
                      <input style={input} placeholder="0f1a2b3c-..." value={form.loxone_output_uuid} onChange={(e) => setForm({ ...form, loxone_output_uuid: e.target.value })} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={label}>{t('devices.username')}</label>
                        <input style={input} value={form.loxone_username} onChange={(e) => setForm({ ...form, loxone_username: e.target.value })} />
                      </div>
                      <div>
                        <label style={label}>{t('devices.password')}</label>
                        <input type="password" style={input} value={form.loxone_password} onChange={(e) => setForm({ ...form, loxone_password: e.target.value })} />
                      </div>
                    </div>
                  </div>
                )}
                {form.id && (
                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button onClick={runTest} disabled={testing} style={{ ...btn('#6b7280', false), display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <RefreshCw size={13} /> {testing ? t('devices.testing') : t('devices.test')}
                    </button>
                    {testResult && <span style={{ fontSize: '13px', color: '#374151' }}>{testResult}</span>}
                  </div>
                )}
              </div>

              {/* Control parameters */}
              <div style={card}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '12px' }}>{t('devices.controlSection')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={label}>{t('devices.onThreshold')} (W)</label>
                    <input type="number" style={input} value={form.switch_on_threshold_w} onChange={(e) => setForm({ ...form, switch_on_threshold_w: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label style={label}>{t('devices.offThreshold')} (W)</label>
                    <input type="number" style={input} value={form.switch_off_threshold_w} onChange={(e) => setForm({ ...form, switch_off_threshold_w: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label style={label}>{t('devices.minRuntime')} (s)</label>
                    <input type="number" style={input} value={form.min_runtime_seconds} onChange={(e) => setForm({ ...form, min_runtime_seconds: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label style={label}>{t('devices.minOfftime')} (s)</label>
                    <input type="number" style={input} value={form.min_offtime_seconds} onChange={(e) => setForm({ ...form, min_offtime_seconds: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label style={label}>{t('devices.priority')}</label>
                    <input type="number" style={input} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px', marginBottom: 0 }}>{t('devices.thresholdHint')}</p>
              </div>

              {/* Schedule */}
              <div style={card}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.schedule_enabled} onChange={(e) => setForm({ ...form, schedule_enabled: e.target.checked })} />
                  {t('devices.scheduleEnabled')}
                </label>
                {form.schedule_enabled && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={label}>{t('devices.from')}</label>
                        <input type="time" style={input} value={form.schedule_from} onChange={(e) => setForm({ ...form, schedule_from: e.target.value })} />
                      </div>
                      <div>
                        <label style={label}>{t('devices.to')}</label>
                        <input type="time" style={input} value={form.schedule_to} onChange={(e) => setForm({ ...form, schedule_to: e.target.value })} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                      {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                        const on = form.schedule_days.includes(day);
                        return (
                          <button key={day} onClick={() => setForm({ ...form, schedule_days: on ? form.schedule_days.filter((x) => x !== day) : [...form.schedule_days, day] })}
                            style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #d1d5db', background: on ? '#10b981' : 'white', color: on ? 'white' : '#6b7280', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                            {t(`devices.day.${day}`)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                {t('devices.activeControl')}
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button onClick={() => setShowModal(false)} style={{ ...btn('#9ca3af', false) }}>{t('common.cancel')}</button>
              <button onClick={save} style={{ ...btn('#10b981', false) }}>{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btn = (color: string, active: boolean): React.CSSProperties => ({
  padding: '7px 12px', borderRadius: '8px', border: active ? `2px solid ${color}` : '1px solid #e5e7eb',
  background: active ? color : 'white', color: active ? 'white' : color, fontSize: '13px', fontWeight: 600, cursor: 'pointer',
});

const iconBtn: React.CSSProperties = {
  padding: '7px', borderRadius: '8px', border: '1px solid #e5e7eb', background: 'white', color: '#6b7280', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center',
};
