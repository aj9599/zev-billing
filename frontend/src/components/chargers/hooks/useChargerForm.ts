import { useState, useCallback } from 'react';
import { api } from '../../../api/client';
import type { Charger } from '../../../types';
import { getPreset } from '../../chargerPresets';

export interface ChargerConnectionConfig {
  power_endpoint?: string;
  state_endpoint?: string;
  user_id_endpoint?: string;
  mode_endpoint?: string;
  ip_address?: string;
  port?: number;
  power_register?: number;
  state_register?: number;
  user_id_register?: number;
  mode_register?: number;
  unit_id?: number;
  listen_port?: number;
  power_key?: string;
  state_key?: string;
  user_id_key?: string;
  mode_key?: string;
  state_cable_locked?: string;
  state_waiting_auth?: string;
  state_charging?: string;
  state_idle?: string;
  mode_normal?: string;
  mode_priority?: string;
  loxone_host?: string;
  loxone_username?: string;
  loxone_password?: string;
  loxone_power_uuid?: string;
  loxone_state_uuid?: string;
  loxone_user_id_uuid?: string;
  loxone_mode_uuid?: string;
  zaptec_username?: string;
  zaptec_password?: string;
  zaptec_charger_id?: string;
  zaptec_installation_id?: string;
}

export const useChargerForm = (onSubmitSuccess: () => void) => {
  const [showModal, setShowModal] = useState(false);
  const [editingCharger, setEditingCharger] = useState<Charger | null>(null);
  const [formData, setFormData] = useState<Partial<Charger>>({
    name: '',
    brand: 'weidmuller',
    preset: 'weidmuller',
    building_id: 0,
    connection_type: 'loxone_api',
    connection_config: '{}',
    notes: '',
    is_active: true
  });
  const [connectionConfig, setConnectionConfig] = useState<ChargerConnectionConfig>({
    power_endpoint: '',
    state_endpoint: '',
    user_id_endpoint: '',
    mode_endpoint: '',
    ip_address: '',
    port: 502,
    power_register: 0,
    state_register: 1,
    user_id_register: 2,
    mode_register: 3,
    unit_id: 1,
    listen_port: 8888,
    power_key: '',
    state_key: '',
    user_id_key: '',
    mode_key: '',
    state_cable_locked: '65',
    state_waiting_auth: '66',
    state_charging: '67',
    state_idle: '50',
    mode_normal: '1',
    mode_priority: '2',
    loxone_host: '',
    loxone_username: '',
    loxone_password: '',
    loxone_power_uuid: '',
    loxone_state_uuid: '',
    loxone_user_id_uuid: '',
    loxone_mode_uuid: '',
    zaptec_username: '',
    zaptec_password: '',
    zaptec_charger_id: '',
    zaptec_installation_id: ''
  });

  const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const generateUniqueKeys = () => {
    const baseUUID = generateUUID();
    return {
      power_key: `${baseUUID}_power`,
      state_key: `${baseUUID}_state`,
      user_id_key: `${baseUUID}_user`,
      mode_key: `${baseUUID}_mode`
    };
  };

  const resetForm = useCallback(() => {
    const preset = getPreset('weidmuller');
    setFormData({
      name: '',
      brand: 'weidmuller',
      preset: 'weidmuller',
      building_id: 0,
      connection_type: 'loxone_api',
      connection_config: '{}',
      notes: '',
      is_active: true
    });
    setConnectionConfig({
      power_endpoint: '',
      state_endpoint: '',
      user_id_endpoint: '',
      mode_endpoint: '',
      ip_address: '',
      port: 502,
      power_register: 0,
      state_register: 1,
      user_id_register: 2,
      mode_register: 3,
      unit_id: 1,
      listen_port: 8888,
      power_key: '',
      state_key: '',
      user_id_key: '',
      mode_key: '',
      state_cable_locked: preset.defaultStateMappings.cable_locked,
      state_waiting_auth: preset.defaultStateMappings.waiting_auth,
      state_charging: preset.defaultStateMappings.charging,
      state_idle: preset.defaultStateMappings.idle,
      mode_normal: preset.defaultModeMappings.normal,
      mode_priority: preset.defaultModeMappings.priority,
      loxone_host: '',
      loxone_username: '',
      loxone_password: '',
      loxone_power_uuid: '',
      loxone_state_uuid: '',
      loxone_user_id_uuid: '',
      loxone_mode_uuid: '',
      zaptec_username: '',
      zaptec_password: '',
      zaptec_charger_id: '',
      zaptec_installation_id: ''
    });
  }, []);

  const handleAddCharger = useCallback(() => {
    resetForm();
    const uniqueKeys = generateUniqueKeys();
    setConnectionConfig(prev => ({
      ...prev,
      ...uniqueKeys
    }));
    setShowModal(true);
  }, [resetForm]);

  const handleEdit = useCallback((charger: Charger) => {
    setEditingCharger(charger);
    setFormData(charger);

    try {
      const config = JSON.parse(charger.connection_config);
      const preset = getPreset(charger.preset);

      setConnectionConfig({
        power_endpoint: config.power_endpoint || '',
        state_endpoint: config.state_endpoint || '',
        user_id_endpoint: config.user_id_endpoint || '',
        mode_endpoint: config.mode_endpoint || '',
        ip_address: config.ip_address || '',
        port: config.port || 502,
        power_register: config.power_register || 0,
        state_register: config.state_register || 1,
        user_id_register: config.user_id_register || 2,
        mode_register: config.mode_register || 3,
        unit_id: config.unit_id || 1,
        listen_port: config.listen_port || 8888,
        power_key: config.power_key || '',
        state_key: config.state_key || '',
        user_id_key: config.user_id_key || '',
        mode_key: config.mode_key || '',
        state_cable_locked: config.state_cable_locked || preset.defaultStateMappings.cable_locked,
        state_waiting_auth: config.state_waiting_auth || preset.defaultStateMappings.waiting_auth,
        state_charging: config.state_charging || preset.defaultStateMappings.charging,
        state_idle: config.state_idle || preset.defaultStateMappings.idle,
        mode_normal: config.mode_normal || preset.defaultModeMappings.normal,
        mode_priority: config.mode_priority || preset.defaultModeMappings.priority,
        loxone_host: config.loxone_host || '',
        loxone_username: config.loxone_username || '',
        loxone_password: config.loxone_password || '',
        loxone_power_uuid: config.loxone_power_uuid || '',
        loxone_state_uuid: config.loxone_state_uuid || '',
        loxone_user_id_uuid: config.loxone_user_id_uuid || '',
        loxone_mode_uuid: config.loxone_mode_uuid || '',
        zaptec_username: config.zaptec_username || '',
        zaptec_password: config.zaptec_password || '',
        zaptec_charger_id: config.zaptec_charger_id || '',
        zaptec_installation_id: config.zaptec_installation_id || ''
      });
    } catch (e) {
      console.error('Failed to parse config:', e);
    }

    setShowModal(true);
  }, []);

  const handlePresetChange = useCallback((presetName: string) => {
    const preset = getPreset(presetName);
    setFormData(prev => ({
      ...prev,
      brand: presetName,
      preset: presetName,
      connection_type: presetName === 'zaptec' ? 'zaptec_api' : prev.connection_type
    }));
    setConnectionConfig(prev => ({
      ...prev,
      state_cable_locked: preset.defaultStateMappings.cable_locked,
      state_waiting_auth: preset.defaultStateMappings.waiting_auth,
      state_charging: preset.defaultStateMappings.charging,
      state_idle: preset.defaultStateMappings.idle,
      mode_normal: preset.defaultModeMappings.normal,
      mode_priority: preset.defaultModeMappings.priority
    }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let config: ChargerConnectionConfig = {};

    if (formData.connection_type === 'loxone_api') {
      config = {
        loxone_host: connectionConfig.loxone_host,
        loxone_username: connectionConfig.loxone_username,
        loxone_password: connectionConfig.loxone_password,
        loxone_power_uuid: connectionConfig.loxone_power_uuid,
        loxone_state_uuid: connectionConfig.loxone_state_uuid,
        loxone_user_id_uuid: connectionConfig.loxone_user_id_uuid,
        loxone_mode_uuid: connectionConfig.loxone_mode_uuid,
        state_cable_locked: connectionConfig.state_cable_locked,
        state_waiting_auth: connectionConfig.state_waiting_auth,
        state_charging: connectionConfig.state_charging,
        state_idle: connectionConfig.state_idle,
        mode_normal: connectionConfig.mode_normal,
        mode_priority: connectionConfig.mode_priority
      };
    } else if (formData.connection_type === 'zaptec_api') {
      config = {
        zaptec_username: connectionConfig.zaptec_username,
        zaptec_password: connectionConfig.zaptec_password,
        zaptec_charger_id: connectionConfig.zaptec_charger_id,
        zaptec_installation_id: connectionConfig.zaptec_installation_id
      };
    } else if (formData.connection_type === 'http') {
      config = {
        power_endpoint: connectionConfig.power_endpoint,
        state_endpoint: connectionConfig.state_endpoint,
        user_id_endpoint: connectionConfig.user_id_endpoint,
        mode_endpoint: connectionConfig.mode_endpoint,
        state_cable_locked: connectionConfig.state_cable_locked,
        state_waiting_auth: connectionConfig.state_waiting_auth,
        state_charging: connectionConfig.state_charging,
        state_idle: connectionConfig.state_idle,
        mode_normal: connectionConfig.mode_normal,
        mode_priority: connectionConfig.mode_priority
      };
    } else if (formData.connection_type === 'modbus_tcp') {
      config = {
        ip_address: connectionConfig.ip_address,
        port: connectionConfig.port,
        power_register: connectionConfig.power_register,
        state_register: connectionConfig.state_register,
        user_id_register: connectionConfig.user_id_register,
        mode_register: connectionConfig.mode_register,
        unit_id: connectionConfig.unit_id,
        state_cable_locked: connectionConfig.state_cable_locked,
        state_waiting_auth: connectionConfig.state_waiting_auth,
        state_charging: connectionConfig.state_charging,
        state_idle: connectionConfig.state_idle,
        mode_normal: connectionConfig.mode_normal,
        mode_priority: connectionConfig.mode_priority
      };
    } else if (formData.connection_type === 'udp') {
      config = {
        listen_port: connectionConfig.listen_port,
        power_key: connectionConfig.power_key,
        state_key: connectionConfig.state_key,
        user_id_key: connectionConfig.user_id_key,
        mode_key: connectionConfig.mode_key,
        state_cable_locked: connectionConfig.state_cable_locked,
        state_waiting_auth: connectionConfig.state_waiting_auth,
        state_charging: connectionConfig.state_charging,
        state_idle: connectionConfig.state_idle,
        mode_normal: connectionConfig.mode_normal,
        mode_priority: connectionConfig.mode_priority
      };
    }

    const dataToSend = {
      ...formData,
      connection_config: JSON.stringify(config)
    };

    try {
      if (editingCharger) {
        await api.updateCharger(editingCharger.id, dataToSend);
      } else {
        await api.createCharger(dataToSend);
      }
      setShowModal(false);
      setEditingCharger(null);
      resetForm();
      onSubmitSuccess();
    } catch (err) {
      alert('Failed to save charger. Please try again.');
    }
  };

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setEditingCharger(null);
  }, []);

  return {
    showModal,
    editingCharger,
    formData,
    connectionConfig,
    setFormData,
    setConnectionConfig,
    handleSubmit,
    handleEdit,
    handleAddCharger,
    handleCloseModal,
    handlePresetChange
  };
};