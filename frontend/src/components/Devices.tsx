import { useEffect, useState } from 'react';
import { Plus, Power, Edit2, Trash2, X, Zap, RefreshCw, Search, Clock, Wifi, Activity, Target, Plug } from 'lucide-react';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import type { Device, DeviceLiveStatus, LoxoneControl, Building as BuildingType } from '../types';

type FormState = {
  id?: number;
  name: string;
  building_id: number;
  driver: 'shelly' | 'loxone';
  is_active: boolean;
  // shelly
  shelly_host: string;
  shelly_model: string;
  shelly_gen: number;
  shelly_channel: number;
  shelly_auth_user: string;
  shelly_auth_pass: string;
  shelly_staged: boolean;
  shelly_stages: ShellyStage[];
  // loxone
  loxone_host: string;
  loxone_username: string;
  loxone_password: string;
  loxone_output_uuid: string;
  loxone_state_uuid: string;
  // control
  switch_on_threshold_w: number;
  switch_off_threshold_w: number;
  min_runtime_seconds: number;
  min_offtime_seconds: number;
  priority: number;
  // schedule (zero or more optional windows)
  schedule_enabled: boolean;
  schedule_windows: ScheduleWindow[];
  // runtime guarantee
  guarantee_hours: number;
  guarantee_by: string;
};

type ScheduleWindow = { from: string; to: string; days: number[] };

// Supported Shelly models. All Gen3/Gen4 + Pro use the same Gen2+ RPC API, so
// gen is 2 for them; the two generic entries keep older/other devices working.
// channels = number of relays/switches; pm = has power metering.
type ShellyModel = { id: string; label: string; gen: number; channels: number; pm: boolean };
const SHELLY_MODELS: ShellyModel[] = [
  { id: 'shelly1', label: 'Shelly 1 (Gen3/4)', gen: 2, channels: 1, pm: false },
  { id: 'shelly1pm', label: 'Shelly 1PM (Gen3/4)', gen: 2, channels: 1, pm: true },
  { id: 'shelly2pm', label: 'Shelly 2PM (Gen3/4)', gen: 2, channels: 2, pm: true },
  { id: 'shelly1mini', label: 'Shelly 1 Mini (Gen3/4)', gen: 2, channels: 1, pm: false },
  { id: 'shelly1pmmini', label: 'Shelly 1PM Mini (Gen3/4)', gen: 2, channels: 1, pm: true },
  { id: 'shellypro1', label: 'Shelly Pro 1', gen: 2, channels: 1, pm: false },
  { id: 'shellypro1pm', label: 'Shelly Pro 1PM', gen: 2, channels: 1, pm: true },
  { id: 'shellypro2', label: 'Shelly Pro 2', gen: 2, channels: 2, pm: false },
  { id: 'shellypro2pm', label: 'Shelly Pro 2PM', gen: 2, channels: 2, pm: true },
  { id: 'shellypro3', label: 'Shelly Pro 3', gen: 2, channels: 3, pm: false },
  { id: 'shellypro4pm', label: 'Shelly Pro 4PM', gen: 2, channels: 4, pm: true },
  { id: 'generic1', label: 'Other Shelly (Gen1)', gen: 1, channels: 4, pm: false },
  { id: 'generic2', label: 'Other Shelly (Gen2+)', gen: 2, channels: 4, pm: false },
];
const shellyModelById = (id: string): ShellyModel =>
  SHELLY_MODELS.find((m) => m.id === id) || SHELLY_MODELS[SHELLY_MODELS.length - 1];

// One cumulative power level of a staged device. relays = 0-based channels that
// are ON at this stage; the stage turns on at on_threshold_w surplus and drops
// below off_threshold_w.
type ShellyStage = { relays: number[]; on_threshold_w: number; off_threshold_w: number };
const newStage = (): ShellyStage => ({ relays: [], on_threshold_w: 2000, off_threshold_w: 1500 });
// Staging only makes sense for multi-relay models.
const stagingAvailable = (modelId: string): boolean => shellyModelById(modelId).channels > 1;

const newWindow = (): ScheduleWindow => ({ from: '10:00', to: '16:00', days: [1, 2, 3, 4, 5, 6, 7] });

const parseScheduleJson = (s?: string | null): ScheduleWindow[] => {
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr)
      ? arr.map((w: any) => ({
          from: w.from || '10:00',
          to: w.to || '16:00',
          days: Array.isArray(w.days) && w.days.length ? w.days : [1, 2, 3, 4, 5, 6, 7],
        }))
      : [];
  } catch {
    return [];
  }
};

const windowsToScheduleJson = (enabled: boolean, windows: ScheduleWindow[]): string | null => {
  const w = windows.filter((x) => x.days.length > 0);
  return enabled && w.length > 0 ? JSON.stringify(w.map((x) => ({ days: x.days, from: x.from, to: x.to }))) : null;
};

const emptyForm = (): FormState => ({
  name: '',
  building_id: 0,
  driver: 'shelly',
  is_active: true,
  shelly_host: '',
  shelly_model: 'shelly1pm',
  shelly_gen: 2,
  shelly_channel: 0,
  shelly_auth_user: '',
  shelly_auth_pass: '',
  shelly_staged: false,
  shelly_stages: [newStage()],
  loxone_host: '',
  loxone_username: '',
  loxone_password: '',
  loxone_output_uuid: '',
  loxone_state_uuid: '',
  switch_on_threshold_w: 1000,
  switch_off_threshold_w: 0,
  min_runtime_seconds: 300,
  min_offtime_seconds: 300,
  priority: 100,
  schedule_enabled: false,
  schedule_windows: [newWindow()],
  guarantee_hours: 0,
  guarantee_by: '18:00',
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
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  // dedicated schedule modal (edits only the schedule, nothing else)
  const [schedDevice, setSchedDevice] = useState<Device | null>(null);
  const [schedEnabled, setSchedEnabled] = useState(false);
  const [schedWindows, setSchedWindows] = useState<ScheduleWindow[]>([newWindow()]);
  // dedicated runtime-guarantee modal
  const [guarDevice, setGuarDevice] = useState<Device | null>(null);
  const [guarHours, setGuarHours] = useState(0);
  const [guarBy, setGuarBy] = useState('18:00');
  const [testResult, setTestResult] = useState<string>('');
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [loxoneControls, setLoxoneControls] = useState<LoxoneControl[]>([]);
  // building filter (matches the Meters/Chargers pages)
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState('');

  useEffect(() => {
    loadData();
    refreshStatus();
    const interval = setInterval(refreshStatus, 5000);
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', onResize);
    };
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

  const parseSchedule = (d: Device): ScheduleWindow[] => parseScheduleJson(d.schedule_json);

  const formatDays = (days: number[]): string => {
    const sorted = [...new Set(days)].filter((n) => n >= 1 && n <= 7).sort((a, b) => a - b);
    if (sorted.length === 0) return '';
    if (sorted.length === 7) return t('devices.everyDay');
    const parts: string[] = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
      if (j - i >= 2) parts.push(`${t(`devices.day.${sorted[i]}`)}–${t(`devices.day.${sorted[j]}`)}`);
      else for (let k = i; k <= j; k++) parts.push(t(`devices.day.${sorted[k]}`));
      i = j + 1;
    }
    return parts.join(', ');
  };

  function openCreate() {
    const f = emptyForm();
    f.building_id = buildings[0]?.id || 0;
    setForm(f);
    setTestResult('');
    setLoxoneControls([]);
    setDiscoverError('');
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
    f.guarantee_hours = d.guarantee_hours || 0;
    f.guarantee_by = d.guarantee_by || '18:00';
    try {
      const cfg = JSON.parse(d.connection_config || '{}');
      if (f.driver === 'shelly') {
        f.shelly_host = cfg.host || '';
        f.shelly_gen = cfg.gen || 1;
        f.shelly_channel = cfg.channel || 0;
        // Prefer the saved model; fall back to a generic entry by generation
        // for devices created before the model picker existed.
        f.shelly_model = cfg.model || (Number(cfg.gen) >= 2 ? 'generic2' : 'generic1');
        f.shelly_auth_user = cfg.auth_user || '';
        f.shelly_auth_pass = cfg.auth_pass || '';
        f.shelly_staged = !!cfg.staged;
        if (Array.isArray(cfg.stages) && cfg.stages.length > 0) {
          f.shelly_stages = cfg.stages.map((st: any) => ({
            relays: Array.isArray(st.relays) ? st.relays.map(Number) : [],
            on_threshold_w: Number(st.on_threshold_w) || 0,
            off_threshold_w: Number(st.off_threshold_w) || 0,
          }));
        }
      } else {
        f.loxone_host = cfg.host || '';
        f.loxone_username = cfg.username || '';
        f.loxone_password = cfg.password || '';
        f.loxone_output_uuid = cfg.output_uuid || '';
        f.loxone_state_uuid = cfg.state_uuid || '';
      }
    } catch { /* ignore */ }
    const wins = parseScheduleJson(d.schedule_json);
    if (wins.length > 0) {
      f.schedule_enabled = true;
      f.schedule_windows = wins;
    }
    setForm(f);
    setTestResult('');
    setLoxoneControls([]);
    setDiscoverError('');
    setShowModal(true);
  }

  function buildPayload(f: FormState): Partial<Device> {
    const connection_config =
      f.driver === 'shelly'
        ? JSON.stringify({
            host: f.shelly_host.trim(),
            model: f.shelly_model,
            gen: shellyModelById(f.shelly_model).gen,
            channel: Number(f.shelly_channel) || 0,
            auth_user: f.shelly_auth_user,
            auth_pass: f.shelly_auth_pass,
            staged: stagingAvailable(f.shelly_model) && f.shelly_staged,
            stages: stagingAvailable(f.shelly_model) && f.shelly_staged
              ? f.shelly_stages
                  .filter((st) => st.relays.length > 0)
                  .map((st) => ({
                    relays: [...st.relays].sort((a, b) => a - b),
                    on_threshold_w: Number(st.on_threshold_w) || 0,
                    off_threshold_w: Number(st.off_threshold_w) || 0,
                  }))
              : [],
          })
        : JSON.stringify({
            host: f.loxone_host.trim(),
            username: f.loxone_username,
            password: f.loxone_password,
            output_uuid: f.loxone_output_uuid.trim(),
            state_uuid: f.loxone_state_uuid.trim(),
          });
    const schedule_json = windowsToScheduleJson(f.schedule_enabled, f.schedule_windows);
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
      guarantee_hours: Number(f.guarantee_hours) || 0,
      guarantee_by: Number(f.guarantee_hours) > 0 ? f.guarantee_by : null,
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

  async function discoverLoxone() {
    if (!form.loxone_host.trim()) {
      setDiscoverError(t('devices.discoverNeedHost'));
      return;
    }
    setDiscovering(true);
    setDiscoverError('');
    setLoxoneControls([]);
    try {
      const list = await api.discoverLoxoneControls({
        host: form.loxone_host.trim(),
        username: form.loxone_username,
        password: form.loxone_password,
      });
      setLoxoneControls(list);
      if (list.length === 0) setDiscoverError(t('devices.discoverEmpty'));
    } catch (e: any) {
      setDiscoverError(e?.message || t('devices.discoverError'));
    } finally {
      setDiscovering(false);
    }
  }

  function openSchedule(d: Device) {
    const wins = parseScheduleJson(d.schedule_json);
    setSchedDevice(d);
    setSchedEnabled(wins.length > 0);
    setSchedWindows(wins.length > 0 ? wins : [newWindow()]);
  }

  async function saveSchedule() {
    if (!schedDevice) return;
    try {
      await api.updateDeviceSchedule(schedDevice.id, windowsToScheduleJson(schedEnabled, schedWindows));
      setSchedDevice(null);
      await loadData();
    } catch {
      setMessage(t('devices.saveError'));
    }
  }

  function openGuarantee(d: Device) {
    setGuarDevice(d);
    setGuarHours(d.guarantee_hours || 0);
    setGuarBy(d.guarantee_by || '18:00');
  }

  async function saveGuarantee() {
    if (!guarDevice) return;
    try {
      await api.updateDeviceGuarantee(guarDevice.id, Number(guarHours) || 0, Number(guarHours) > 0 ? guarBy : null);
      setGuarDevice(null);
      await loadData();
    } catch {
      setMessage(t('devices.saveError'));
    }
  }

  // Reusable multi-window schedule editor — used by both the full edit modal
  // and the dedicated schedule modal, so both stay in sync.
  const renderScheduleEditor = (
    enabled: boolean,
    windows: ScheduleWindow[],
    setEnabled: (v: boolean) => void,
    setWindows: (w: ScheduleWindow[]) => void,
  ) => (
    <div style={card}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        {t('devices.scheduleEnabled')}
      </label>
      {enabled && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {windows.map((wnd, idx) => {
            const setWindow = (patch: Partial<ScheduleWindow>) =>
              setWindows(windows.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
            return (
              <div key={idx} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px', background: '#fafafa' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={label}>{t('devices.from')}</label>
                    <input type="time" style={input} value={wnd.from} onChange={(e) => setWindow({ from: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={label}>{t('devices.to')}</label>
                    <input type="time" style={input} value={wnd.to} onChange={(e) => setWindow({ to: e.target.value })} />
                  </div>
                  {windows.length > 1 && (
                    <button onClick={() => setWindows(windows.filter((_, i) => i !== idx))}
                      title={t('common.delete')} style={{ ...iconBtn, color: '#dc2626', height: '37px' }}><Trash2 size={15} /></button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                  {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                    const on = wnd.days.includes(day);
                    return (
                      <button key={day} onClick={() => setWindow({ days: on ? wnd.days.filter((x) => x !== day) : [...wnd.days, day] })}
                        style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #d1d5db', background: on ? '#10b981' : 'white', color: on ? 'white' : '#6b7280', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                        {t(`devices.day.${day}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <button onClick={() => setWindows([...windows, newWindow()])}
            style={{ ...btn('#10b981', false), display: 'inline-flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-start' }}>
            <Plus size={13} /> {t('devices.addWindow')}
          </button>
        </div>
      )}
    </div>
  );

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

  if (loading) {
    return <div style={{ padding: '40px', color: '#6b7280' }}>{t('common.loading')}</div>;
  }

  const onlineCount = devices.filter((d) => status[d.id]?.online).length;
  const onCount = devices.filter((d) => status[d.id]?.state === 'on').length;
  const autoCount = devices.filter((d) => (status[d.id]?.mode || d.control_mode) === 'auto' && d.is_active).length;

  // building filter: search narrows the building pills; the selected building
  // narrows the device grid.
  const filteredBuildings = buildings.filter((b) => b.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredDevices = selectedBuildingId ? devices.filter((d) => d.building_id === selectedBuildingId) : devices;
  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: isMobile ? '8px 14px' : '8px 18px', borderRadius: '20px',
    border: active ? '1.5px solid #667eea' : '1.5px solid #e5e7eb',
    backgroundColor: active ? '#667eea' : 'white', color: active ? 'white' : '#6b7280',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
    display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
    boxShadow: active ? '0 2px 8px rgba(102,126,234,0.3)' : '0 1px 3px rgba(0,0,0,0.04)',
  });
  const countBadge = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '20px', height: '20px',
    padding: '0 6px', borderRadius: '10px', fontSize: '11px', fontWeight: 700,
    backgroundColor: active ? 'rgba(255,255,255,0.25)' : '#f3f4f6', color: active ? 'white' : '#9ca3af',
  });

  return (
    <div style={{ width: '100%', maxWidth: '100%' }}>
      <style>{`@keyframes dev-pulse {
        0%, 100% { box-shadow: 0 0 0 4px rgba(16,185,129,0.20); }
        50% { box-shadow: 0 0 0 9px rgba(16,185,129,0.04); }
      }`}</style>

      {/* Header */}
      <div className="app-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '20px' : '28px', gap: '15px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{
            fontSize: isMobile ? '24px' : '32px', fontWeight: 800, marginBottom: '6px',
            display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            <Power size={isMobile ? 24 : 32} style={{ color: '#667eea' }} /> {t('devices.title')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: isMobile ? '13px' : '15px', margin: 0 }}>{t('devices.subtitle')}</p>
        </div>
        <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '10px', padding: '10px 16px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={16} /> {t('devices.add')}
        </button>
      </div>

      {/* Stat cards */}
      <div className="app-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px', animationDelay: '0.05s' }}>
        <StatCard icon={Power} color="#667eea" label={t('devices.statTotal')} value={devices.length} />
        <StatCard icon={Activity} color="#3b82f6" label={t('devices.statAuto')} value={autoCount} />
        <StatCard icon={Wifi} color="#0ea5e9" label={t('devices.statOnline')} value={onlineCount} sublabel={`${devices.length - onlineCount} ${t('devices.offline')}`} />
        <StatCard icon={Zap} color="#10b981" label={t('devices.statOn')} value={onCount} />
      </div>

      {message && (
        <div style={{ backgroundColor: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', margin: '12px 0', fontSize: '14px' }} onClick={() => setMessage('')}>
          {message}
        </div>
      )}

      {/* Building filter (search + per-building pills), like Meters/Chargers */}
      {devices.length > 0 && buildings.length > 1 && (
        <div className="app-fade-in" style={{ marginBottom: '8px', animationDelay: '0.08s' }}>
          <div style={{ position: 'relative', maxWidth: '400px', marginBottom: '14px' }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="text"
              placeholder={t('dashboard.searchBuildings')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 14px 10px 42px', border: '1px solid #e5e7eb', borderRadius: '12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button onClick={() => setSelectedBuildingId(null)} style={pillStyle(selectedBuildingId === null)}>
              {t('dashboard.allBuildings')}
              <span style={countBadge(selectedBuildingId === null)}>{devices.length}</span>
            </button>
            {filteredBuildings.map((b) => {
              const count = devices.filter((d) => d.building_id === b.id).length;
              const active = selectedBuildingId === b.id;
              return (
                <button key={b.id} onClick={() => setSelectedBuildingId(b.id)} style={pillStyle(active)}>
                  {b.name}
                  <span style={countBadge(active)}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {devices.length === 0 ? (
        <div className="app-fade-in" style={{ ...card, textAlign: 'center', padding: '48px', color: '#9ca3af', marginTop: '16px', animationDelay: '0.1s' }}>
          <Power size={40} style={{ opacity: 0.4 }} />
          <p style={{ marginTop: '12px' }}>{t('devices.empty')}</p>
        </div>
      ) : filteredDevices.length === 0 ? (
        <div className="app-fade-in" style={{ ...card, textAlign: 'center', padding: '40px', color: '#9ca3af', marginTop: '16px' }}>
          <Power size={36} style={{ opacity: 0.4 }} />
          <p style={{ marginTop: '12px' }}>{t('devices.emptyBuilding')}</p>
        </div>
      ) : (
        <div className="app-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '18px', marginTop: '16px', animationDelay: '0.1s' }}>
          {filteredDevices.map((d) => {
            const s = status[d.id];
            const state = s?.state || 'unknown';
            const isOn = state === 'on';
            const offline = state === 'offline';
            const accent = isOn ? '#10b981' : offline ? '#ef4444' : '#94a3b8';
            const surplus = s?.has_signal ? s.building_surplus_w : null;
            // Grid-power convention for display: import positive, export negative.
            const gridW = surplus != null ? -surplus : null;
            const threshold = d.switch_on_threshold_w || 0;
            const mode = (s?.mode || d.control_mode || 'auto') as 'on' | 'off' | 'auto';
            const modeColor: Record<string, string> = { on: '#10b981', off: '#ef4444', auto: '#3b82f6' };
            return (
              <div key={d.id} style={{
                position: 'relative', borderRadius: '16px', overflow: 'hidden',
                background: isOn ? 'linear-gradient(150deg,#ecfdf5 0%,#ffffff 55%)' : '#ffffff',
                border: `1px solid ${isOn ? '#a7f3d0' : '#e5e7eb'}`,
                boxShadow: isOn ? '0 8px 24px rgba(16,185,129,0.16)' : '0 1px 3px rgba(0,0,0,0.06)',
                transition: 'all .3s ease',
              }}>
                <div style={{ height: '4px', background: accent }} />
                <div style={{ padding: '16px' }}>
                  {/* header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '46px', height: '46px', borderRadius: '13px', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isOn ? '#10b981' : offline ? '#fee2e2' : '#f1f5f9',
                      color: isOn ? '#fff' : offline ? '#dc2626' : '#64748b',
                      animation: isOn ? 'dev-pulse 2.2s ease-in-out infinite' : 'none',
                    }}>
                      <Power size={22} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px', textTransform: 'capitalize' }}>{buildingName(d.building_id)} · {d.driver}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                      {/* DEVICE: actual switch state read from the hardware */}
                      <span title={t('devices.deviceTooltip')} style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
                        background: isOn ? '#10b98115' : offline ? '#ef444415' : '#f3f4f6',
                        color: isOn ? '#059669' : offline ? '#dc2626' : '#6b7280',
                      }}>
                        <Plug size={12} />
                        {t('devices.deviceShort')}: {t(`devices.state.${state}`)}
                      </span>
                      {/* CONTROL: what the automation is set to */}
                      <span title={t('devices.controlTooltip')} style={{
                        padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap',
                        background: modeColor[mode] + '15', color: modeColor[mode],
                      }}>
                        <Activity size={11} />
                        {t('devices.controlShort')}: {mode === 'auto' && s
                          ? `${t('devices.mode.auto')} (${s.stage_count
                              ? (s.stage_level && s.stage_level > 0 ? `${t('devices.stage')} ${s.stage_level}/${s.stage_count}` : t('devices.state.off'))
                              : (s.desired_on ? t('devices.state.on') : t('devices.state.off'))})`
                          : t(`devices.mode.${mode}`)}
                      </span>
                    </div>
                  </div>

                  {/* live grid power */}
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '12px', color: '#6b7280', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <Zap size={13} color="#f59e0b" /> {t('devices.gridLabel')}
                        {s?.has_signal && (
                          <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '6px', backgroundColor: s.surplus_live ? '#10b98115' : '#f59e0b15', color: s.surplus_live ? '#059669' : '#d97706' }}>
                            {s.surplus_live ? t('devices.live') : t('devices.estimated')}
                          </span>
                        )}
                      </span>
                      <span title={t('devices.gridHint')} style={{ fontSize: '16px', fontWeight: 800, color: gridW == null ? '#9ca3af' : gridW < 0 ? '#059669' : '#dc2626' }}>
                        {gridW != null ? formatPower(gridW) : t('devices.noSignal')}
                      </span>
                    </div>
                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#9ca3af' }}>
                      {t('devices.onThresholdShort')} {formatPower(threshold)}
                    </div>
                  </div>

                  {/* device power metering (PM models) */}
                  {s?.power_w != null && (
                    <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '12px', color: '#475569' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#6b7280' }}>
                        <Activity size={13} color="#6366f1" /> {t('devices.devicePower')}
                      </span>
                      <span style={{ fontWeight: 700 }}>
                        {formatPower(s.power_w)}
                        {s.energy_wh != null && <span style={{ fontWeight: 500, color: '#9ca3af' }}> · {(s.energy_wh / 1000).toFixed(2)} kWh</span>}
                      </span>
                    </div>
                  )}

                  {/* schedule windows */}
                  {parseSchedule(d).length > 0 && (
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {parseSchedule(d).map((wnd, i) => (
                        <div key={i} style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Clock size={12} color="#94a3b8" />
                          <span><strong style={{ color: '#475569' }}>{formatDays(wnd.days)}</strong> · {wnd.from}–{wnd.to}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* runtime guarantee */}
                  {d.guarantee_hours > 0 && d.guarantee_by && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Target size={12} color="#94a3b8" />
                      <span>
                        <strong style={{ color: '#475569' }}>≥{formatGuarantee(d.guarantee_hours)}</strong> {t('devices.by')} {d.guarantee_by}
                        {s && ` · ${t('devices.todayShort')} ${Math.floor((s.runtime_today_min || 0) / 60)}h ${(s.runtime_today_min || 0) % 60}m`}
                      </span>
                    </div>
                  )}

                  {s?.last_error && (
                    <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '10px' }}>{s.last_error}</div>
                  )}

                  {/* segmented mode control */}
                  <div style={{ display: 'flex', gap: '0', marginTop: '14px', background: '#f1f5f9', borderRadius: '11px', padding: '3px' }}>
                    {(['on', 'off', 'auto'] as const).map((m) => {
                      const active = mode === m;
                      return (
                        <button key={m} onClick={() => control(d, m)} style={{
                          flex: 1, padding: '8px 0', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                          background: active ? '#ffffff' : 'transparent',
                          color: active ? modeColor[m] : '#94a3b8',
                          boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                          transition: 'all .15s',
                        }}>{t(`devices.${m}`)}</button>
                      );
                    })}
                  </div>

                  {/* footer */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px' }}>
                    <button onClick={() => openSchedule(d)} title={t('devices.editSchedule')}
                      style={{ ...iconBtn, color: parseSchedule(d).length > 0 ? '#0ea5e9' : '#6b7280', borderColor: parseSchedule(d).length > 0 ? '#bae6fd' : '#e5e7eb' }}>
                      <Clock size={15} />
                    </button>
                    <button onClick={() => openGuarantee(d)} title={t('devices.editGuarantee')}
                      style={{ ...iconBtn, color: d.guarantee_hours > 0 ? '#8b5cf6' : '#6b7280', borderColor: d.guarantee_hours > 0 ? '#ddd6fe' : '#e5e7eb' }}>
                      <Target size={15} />
                    </button>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => openEdit(d)} title={t('common.edit')} style={iconBtn}><Edit2 size={15} /></button>
                    <button onClick={() => remove(d)} title={t('common.delete')} style={{ ...iconBtn, color: '#dc2626' }}><Trash2 size={15} /></button>
                  </div>
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
                    {(() => {
                      const m = shellyModelById(form.shelly_model);
                      const multi = m.channels > 1;
                      const staged = multi && form.shelly_staged;
                      const setStage = (idx: number, patch: Partial<ShellyStage>) =>
                        setForm({ ...form, shelly_stages: form.shelly_stages.map((s, i) => (i === idx ? { ...s, ...patch } : s)) });
                      const toggleRelay = (idx: number, ch: number) => {
                        const s = form.shelly_stages[idx];
                        const relays = s.relays.includes(ch) ? s.relays.filter((r) => r !== ch) : [...s.relays, ch];
                        setStage(idx, { relays });
                      };
                      const segBtn = (active: boolean): React.CSSProperties => ({
                        flex: 1, padding: '8px 0', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                        background: active ? '#ffffff' : 'transparent', color: active ? '#10b981' : '#94a3b8',
                        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                      });
                      const relayChip = (active: boolean): React.CSSProperties => ({
                        padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, border: 'none',
                        background: active ? '#10b981' : '#eef2f7', color: active ? '#fff' : '#64748b',
                      });
                      return (
                        <>
                          <div>
                            <label style={label}>{t('devices.shellyModel')}</label>
                            <select style={input} value={form.shelly_model} onChange={(e) => {
                              const sel = shellyModelById(e.target.value);
                              setForm({ ...form, shelly_model: e.target.value, shelly_gen: sel.gen, shelly_channel: Math.min(form.shelly_channel, sel.channels - 1), shelly_staged: sel.channels > 1 ? form.shelly_staged : false });
                            }}>
                              {SHELLY_MODELS.map((sm) => (
                                <option key={sm.id} value={sm.id}>{sm.label}</option>
                              ))}
                            </select>
                          </div>

                          {multi && (
                            <div>
                              <label style={label}>{t('devices.shellyControlMode')}</label>
                              <div style={{ display: 'flex', gap: '0', background: '#f1f5f9', borderRadius: '11px', padding: '3px' }}>
                                <button type="button" style={segBtn(!form.shelly_staged)} onClick={() => setForm({ ...form, shelly_staged: false })}>{t('devices.shellySingle')}</button>
                                <button type="button" style={segBtn(form.shelly_staged)} onClick={() => setForm({ ...form, shelly_staged: true })}>{t('devices.shellyStaged')}</button>
                              </div>
                            </div>
                          )}

                          {multi && !staged && (
                            <div>
                              <label style={label}>{t('devices.channel')}</label>
                              <select style={input} value={form.shelly_channel} onChange={(e) => setForm({ ...form, shelly_channel: Number(e.target.value) })}>
                                {Array.from({ length: m.channels }, (_, i) => (
                                  <option key={i} value={i}>{t('devices.relay')} {i + 1}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {staged && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <label style={label}>{t('devices.stages')}</label>
                              {form.shelly_stages.map((st, idx) => (
                                <div key={idx} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px', background: '#fafafa' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <strong style={{ fontSize: '13px', color: '#475569' }}>{t('devices.stage')} {idx + 1}</strong>
                                    {form.shelly_stages.length > 1 && (
                                      <button type="button" onClick={() => setForm({ ...form, shelly_stages: form.shelly_stages.filter((_, i) => i !== idx) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={15} /></button>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                                    {Array.from({ length: m.channels }, (_, ch) => (
                                      <button type="button" key={ch} onClick={() => toggleRelay(idx, ch)} style={relayChip(st.relays.includes(ch))}>{t('devices.relay')} {ch + 1}</button>
                                    ))}
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <div>
                                      <label style={label}>{t('devices.stageOnThreshold')}</label>
                                      <input type="number" style={input} value={st.on_threshold_w} onChange={(e) => setStage(idx, { on_threshold_w: Number(e.target.value) || 0 })} />
                                    </div>
                                    <div>
                                      <label style={label}>{t('devices.stageOffThreshold')}</label>
                                      <input type="number" style={input} value={st.off_threshold_w} onChange={(e) => setStage(idx, { off_threshold_w: Number(e.target.value) || 0 })} />
                                    </div>
                                  </div>
                                </div>
                              ))}
                              <button type="button" onClick={() => setForm({ ...form, shelly_stages: [...form.shelly_stages, newStage()] })} style={{ ...btn('#10b981', false), alignSelf: 'flex-start' }}>+ {t('devices.addStage')}</button>
                              <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>{t('devices.stagesHint')}</p>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    <div>
                      <label style={label}>{t('devices.host')} *</label>
                      <input style={input} placeholder="192.168.1.50" value={form.shelly_host} onChange={(e) => setForm({ ...form, shelly_host: e.target.value })} />
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

                    {/* Auto-discovery: load switchable outputs from the Miniserver */}
                    <div>
                      <button onClick={discoverLoxone} disabled={discovering} style={{ ...btn('#10b981', false), display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Search size={13} /> {discovering ? t('devices.discovering') : t('devices.discover')}
                      </button>
                      {discoverError && <span style={{ marginLeft: '10px', fontSize: '13px', color: '#dc2626' }}>{discoverError}</span>}
                    </div>

                    {loxoneControls.length > 0 && (
                      <div>
                        <label style={label}>{t('devices.pickOutput')} ({loxoneControls.length})</label>
                        <select style={input} value={form.loxone_output_uuid}
                          onChange={(e) => {
                            const sel = loxoneControls.find((c) => c.uuid === e.target.value);
                            setForm({ ...form, loxone_output_uuid: e.target.value, loxone_state_uuid: sel?.state_uuid || '', name: form.name.trim() ? form.name : (sel?.name || '') });
                          }}>
                          <option value="">—</option>
                          {loxoneControls.map((c) => (
                            <option key={c.uuid} value={c.uuid}>{c.room ? `${c.room} · ` : ''}{c.name} ({c.type})</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label style={label}>{t('devices.outputUuid')} *</label>
                      <input style={input} placeholder="0f1a2b3c-..." value={form.loxone_output_uuid} onChange={(e) => setForm({ ...form, loxone_output_uuid: e.target.value })} />
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
              {renderScheduleEditor(
                form.schedule_enabled,
                form.schedule_windows,
                (v) => setForm({ ...form, schedule_enabled: v }),
                (w) => setForm({ ...form, schedule_windows: w }),
              )}

              {/* Runtime guarantee */}
              <div style={card}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '12px' }}>{t('devices.guaranteeSection')}</div>
                <GuaranteeFields
                  hours={form.guarantee_hours}
                  by={form.guarantee_by}
                  onHours={(h) => setForm({ ...form, guarantee_hours: h })}
                  onBy={(v) => setForm({ ...form, guarantee_by: v })}
                />
                <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px', marginBottom: 0 }}>{t('devices.guaranteeHint')}</p>
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

      {/* Dedicated schedule modal — edits only the schedule */}
      {schedDevice && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px', zIndex: 50, overflowY: 'auto' }}>
          <div style={{ backgroundColor: '#f9fafb', borderRadius: '16px', width: '100%', maxWidth: '480px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} color="#0ea5e9" /> {t('devices.scheduleFor').replace('{name}', schedDevice.name)}
              </h2>
              <button onClick={() => setSchedDevice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 14px' }}>{t('devices.scheduleHint')}</p>
            {renderScheduleEditor(schedEnabled, schedWindows, setSchedEnabled, setSchedWindows)}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button onClick={() => setSchedDevice(null)} style={{ ...btn('#9ca3af', false) }}>{t('common.cancel')}</button>
              <button onClick={saveSchedule} style={{ ...btn('#10b981', false) }}>{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated runtime-guarantee modal */}
      {guarDevice && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px', zIndex: 50, overflowY: 'auto' }}>
          <div style={{ backgroundColor: '#f9fafb', borderRadius: '16px', width: '100%', maxWidth: '520px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Target size={18} color="#8b5cf6" /> {t('devices.guaranteeFor').replace('{name}', guarDevice.name)}
              </h2>
              <button onClick={() => setGuarDevice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 14px' }}>{t('devices.guaranteeHint')}</p>
            <div style={card}>
              <GuaranteeFields
                hours={guarHours}
                by={guarBy}
                onHours={setGuarHours}
                onBy={setGuarBy}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button onClick={() => setGuarDevice(null)} style={{ ...btn('#9ca3af', false) }}>{t('common.cancel')}</button>
              <button onClick={saveGuarantee} style={{ ...btn('#10b981', false) }}>{t('common.save')}</button>
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

// Show kW for large magnitudes, W otherwise.
const formatPower = (w: number) => (Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${Math.round(w)} W`);

// Format a guarantee stored in (fractional) hours as a clean "1h 30m" / "2h" / "45m".
const formatGuarantee = (hours: number): string => {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

// Default the hours/minutes toggle to minutes when the stored value isn't a whole
// number of hours (e.g. 0.5h shows as 30m), otherwise hours.
const guaranteeDefaultUnit = (hours: number): 'h' | 'm' => (hours > 0 && (hours * 60) % 60 !== 0 ? 'm' : 'h');

// GuaranteeFields renders the runtime-guarantee amount (with an hours/minutes
// toggle) + the "by" time. Storage is always hours (what the backend expects);
// the toggle only changes how the amount is entered/displayed.
function GuaranteeFields({ hours, by, onHours, onBy }: {
  hours: number; by: string; onHours: (h: number) => void; onBy: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [unit, setUnit] = useState<'h' | 'm'>(guaranteeDefaultUnit(hours));
  const displayValue = unit === 'h' ? hours : Math.round(hours * 60);
  const unitBtn = (u: 'h' | 'm'): React.CSSProperties => ({
    padding: '6px 12px', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
    background: unit === u ? '#ffffff' : 'transparent',
    color: unit === u ? '#8b5cf6' : '#94a3b8',
    boxShadow: unit === u ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
  });
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <label style={label}>{t('devices.guaranteeRuntime')}</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input type="number" step={unit === 'h' ? '0.5' : '1'} min="0" style={{ ...input, flex: 1, minWidth: 0 }}
            value={displayValue}
            onChange={(e) => {
              const v = Number(e.target.value) || 0;
              onHours(unit === 'h' ? v : v / 60);
            }} />
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '9px', padding: '3px', flexShrink: 0 }}>
            <button type="button" style={unitBtn('h')} onClick={() => setUnit('h')}>{t('devices.unitHours')}</button>
            <button type="button" style={unitBtn('m')} onClick={() => setUnit('m')}>{t('devices.unitMinutes')}</button>
          </div>
        </div>
      </div>
      <div style={{ flex: '0 0 130px' }}>
        <label style={label}>{t('devices.guaranteeBy')}</label>
        <input type="time" style={input} value={by} disabled={hours <= 0} onChange={(e) => onBy(e.target.value)} />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, sublabel }: {
  icon: React.ComponentType<any>;
  label: string; value: number | string; color: string; sublabel?: string;
}) {
  return (
    <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderLeft: `4px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500, marginBottom: '4px' }}>{label}</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#1f2937', lineHeight: 1.1 }}>{value}</div>
          {sublabel && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{sublabel}</div>}
        </div>
        <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={20} color={color} />
        </div>
      </div>
    </div>
  );
}
