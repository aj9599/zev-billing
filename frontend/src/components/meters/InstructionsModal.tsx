import { X, Wifi, Radio, Zap, Settings, AlertCircle, Star, Rss } from 'lucide-react';
import { useTranslation } from '../../i18n';

interface InstructionsModalProps {
    onClose: () => void;
}

export default function InstructionsModal({ onClose }: InstructionsModalProps) {
    const { t } = useTranslation();

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '20px'
        }}>
            <div className="modal-content" style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '30px',
                maxWidth: '800px',
                maxHeight: '90vh',
                overflow: 'auto',
                width: '100%'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px'
                }}>
                    <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>
                        {t('meters.instructions.title')}
                    </h2>
                    <button
                        onClick={onClose}
                        style={{ border: 'none', background: 'none', cursor: 'pointer' }}
                    >
                        <X size={24} />
                    </button>
                </div>

                <div style={{ lineHeight: '1.8', color: '#374151' }}>
                    {/* Loxone WebSocket API Section */}
                    <h3 style={{
                        fontSize: '18px',
                        fontWeight: '600',
                        marginTop: '20px',
                        marginBottom: '10px',
                        color: '#1f2937',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <Wifi size={20} color="#10b981" />
                        {t('meters.instructions.loxoneTitle')}
                    </h3>
                    <div style={{
                        backgroundColor: '#d1fae5',
                        padding: '16px',
                        borderRadius: '8px',
                        marginBottom: '16px',
                        border: '2px solid #10b981'
                    }}>
                        <p style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '12px'
                        }}>
                            <Star size={16} fill="#fbbf24" color="#fbbf24" />
                            <strong>{t('meters.instructions.loxoneRecommended')}</strong>
                        </p>

                        <h4 style={{
                            fontSize: '15px',
                            fontWeight: '600',
                            marginTop: '16px',
                            marginBottom: '8px'
                        }}>
                            {t('meters.instructions.loxoneUuidTitle')}
                        </h4>
                        <ol style={{ marginLeft: '20px', marginBottom: '12px' }}>
                            <li>{t('meters.instructions.loxoneUuidStep1')}</li>
                            <li>{t('meters.instructions.loxoneUuidStep2')}</li>
                            <li>{t('meters.instructions.loxoneUuidStep3')}</li>
                            <li>{t('meters.instructions.loxoneUuidStep4')}</li>
                        </ol>

                        <div style={{
                            backgroundColor: '#fff',
                            padding: '12px',
                            borderRadius: '6px',
                            marginBottom: '12px',
                            fontFamily: 'monospace',
                            fontSize: '13px'
                        }}>
                            <strong>{t('meters.instructions.loxoneUuidExample')}</strong><br />
                            http://192.168.1.100/data/LoxAPP3.json
                        </div>

                        <h4 style={{
                            fontSize: '15px',
                            fontWeight: '600',
                            marginTop: '16px',
                            marginBottom: '8px'
                        }}>
                            {t('meters.instructions.loxoneSetupTitle')}
                        </h4>
                        <ol style={{ marginLeft: '20px', marginTop: '10px' }}>
                            <li>{t('meters.instructions.loxoneStep1')}</li>
                            <li>{t('meters.instructions.loxoneStep2')}</li>
                            <li>{t('meters.instructions.loxoneStep3')}</li>
                            <li>{t('meters.instructions.loxoneStep4')}</li>
                            <li>{t('meters.instructions.loxoneStep5')}</li>
                        </ol>

                        <div style={{
                            backgroundColor: '#fff',
                            padding: '12px',
                            borderRadius: '6px',
                            marginTop: '10px',
                            fontFamily: 'monospace',
                            fontSize: '13px'
                        }}>
                            <strong>{t('meters.instructions.loxoneExample')}</strong><br />
                            {t('meters.instructions.loxoneExampleHost')}<br />
                            {t('meters.instructions.loxoneExampleDevice')}<br />
                            {t('meters.instructions.loxoneExampleCredentials')}<br /><br />
                            <strong>{t('meters.instructions.loxoneBenefits')}</strong><br />
                            {t('meters.instructions.loxoneBenefit1')}<br />
                            {t('meters.instructions.loxoneBenefit2')}<br />
                            {t('meters.instructions.loxoneBenefit3')}
                        </div>

                        {/* Loxone Configuration Modes */}
                        <h4 style={{
                            fontSize: '15px',
                            fontWeight: '600',
                            marginTop: '16px',
                            marginBottom: '8px'
                        }}>
                            {t('meters.instructions.loxoneModeTitle')}
                        </h4>
                        <p style={{ marginBottom: '12px', fontSize: '14px' }}>
                            {t('meters.instructions.loxoneModeIntro')}
                        </p>

                        <div style={{
                            backgroundColor: '#fff',
                            padding: '12px',
                            borderRadius: '6px',
                            marginBottom: '12px',
                            border: '1px solid #22c55e'
                        }}>
                            <strong style={{ color: '#15803d' }}>{t('meters.instructions.loxoneModeMeterBlockTitle')}</strong>
                            <p style={{ marginTop: '8px', marginBottom: '8px', fontSize: '13px' }}>
                                {t('meters.instructions.loxoneModeMeterBlockDesc')}
                            </p>
                            <ul style={{ marginLeft: '20px', fontSize: '13px' }}>
                                <li>{t('meters.instructions.loxoneModeMeterBlockPoint1')}</li>
                                <li>{t('meters.instructions.loxoneModeMeterBlockPoint2')}</li>
                                <li>{t('meters.instructions.loxoneModeMeterBlockPoint3')}</li>
                                <li>{t('meters.instructions.loxoneModeMeterBlockPoint4')}</li>
                            </ul>
                        </div>

                        <div style={{
                            backgroundColor: '#fff',
                            padding: '12px',
                            borderRadius: '6px',
                            marginBottom: '12px',
                            border: '1px solid #3b82f6'
                        }}>
                            <strong style={{ color: '#1e40af' }}>{t('meters.instructions.loxoneModeVirtualOutputTitle')}</strong>
                            <p style={{ marginTop: '8px', marginBottom: '8px', fontSize: '13px' }}>
                                {t('meters.instructions.loxoneModeVirtualOutputDesc')}
                            </p>
                            <ul style={{ marginLeft: '20px', fontSize: '13px' }}>
                                <li>{t('meters.instructions.loxoneModeVirtualOutputPoint1')}</li>
                                <li>{t('meters.instructions.loxoneModeVirtualOutputPoint2')}</li>
                                <li>{t('meters.instructions.loxoneModeVirtualOutputPoint3')}</li>
                                <li>{t('meters.instructions.loxoneModeVirtualOutputPoint4')}</li>
                            </ul>
                        </div>

                        <div style={{
                            backgroundColor: '#fff',
                            padding: '12px',
                            borderRadius: '6px',
                            marginTop: '10px',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            border: '1px solid #e5e7eb'
                        }}>
                            <strong>{t('meters.instructions.loxoneModeExample')}</strong><br /><br />
                            <strong style={{ color: '#15803d' }}>Meter Block:</strong><br />
                            {t('meters.instructions.loxoneModeMeterBlockExample')}<br /><br />
                            <strong style={{ color: '#1e40af' }}>Virtual Output:</strong><br />
                            {t('meters.instructions.loxoneModeVirtualOutputExample')}
                        </div>

                        <div style={{
                            backgroundColor: '#fef3c7',
                            padding: '10px',
                            borderRadius: '6px',
                            marginTop: '10px',
                            fontSize: '12px',
                            color: '#92400e',
                            border: '1px solid #f59e0b'
                        }}>
                            ℹ️ <strong>{t('meters.instructions.loxoneModeNote')}</strong>
                        </div>
                    </div>

                    {/* MQTT Protocol Section */}
                    <h3 style={{
                        fontSize: '18px',
                        fontWeight: '600',
                        marginTop: '20px',
                        marginBottom: '10px',
                        color: '#1f2937',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <Rss size={20} color="#8b5cf6" />
                        {t('meters.instructions.mqttTitle')}
                    </h3>
                    <div style={{
                        backgroundColor: '#f3e8ff',
                        padding: '16px',
                        borderRadius: '8px',
                        marginBottom: '16px',
                        border: '2px solid #8b5cf6'
                    }}>
                        <p style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '12px'
                        }}>
                            <Star size={16} fill="#8b5cf6" color="#8b5cf6" />
                            <strong>{t('meters.instructions.mqttDescription')}</strong>
                        </p>

                        <h4 style={{
                            fontSize: '15px',
                            fontWeight: '600',
                            marginTop: '16px',
                            marginBottom: '8px'
                        }}>
                            {t('meters.instructions.mqttSetupTitle')}
                        </h4>
                        <ol style={{ marginLeft: '20px', marginBottom: '12px' }}>
                            <li>{t('meters.instructions.mqttStep1')}</li>
                            <li>{t('meters.instructions.mqttStep2')}</li>
                            <li>{t('meters.instructions.mqttStep3')}</li>
                            <li>{t('meters.instructions.mqttStep4')}</li>
                            <li>{t('meters.instructions.mqttStep5')}</li>
                            <li>{t('meters.instructions.mqttStep6')}</li>
                        </ol>

                        <h4 style={{
                            fontSize: '15px',
                            fontWeight: '600',
                            marginTop: '16px',
                            marginBottom: '8px'
                        }}>
                            {t('meters.instructions.mqttFormatsTitle')}
                        </h4>
                        <div style={{
                            backgroundColor: '#fff',
                            padding: '12px',
                            borderRadius: '6px',
                            marginTop: '10px',
                            fontFamily: 'monospace',
                            fontSize: '12px'
                        }}>
                            <strong>{t('meters.instructions.mqttFormat1Title')}</strong><br />
                            {`{`}<br />
                            &nbsp;&nbsp;"device_id": "YOUR_DEVICE_ID",<br />
                            &nbsp;&nbsp;"timestamp": 1234567890000,<br />
                            &nbsp;&nbsp;"energy": 123.456,<br />
                            &nbsp;&nbsp;"power": 1500<br />
                            {`}`}<br /><br />

                            <strong>{t('meters.instructions.mqttFormat2Title')}</strong><br />
                            {`{`}<br />
                            &nbsp;&nbsp;"energy": 123.456<br />
                            {`}`}<br />
                            {t('common.or')}<br />
                            {`{`}<br />
                            &nbsp;&nbsp;"power_kwh": 123.456<br />
                            {`}`}<br /><br />

                            <strong>{t('meters.instructions.mqttFormat3Title')}</strong><br />
                            123.456
                        </div>

                        <h4 style={{
                            fontSize: '15px',
                            fontWeight: '600',
                            marginTop: '16px',
                            marginBottom: '8px'
                        }}>
                            {t('meters.instructions.mqttConfigTitle')}
                        </h4>
                        <div style={{
                            backgroundColor: '#fff',
                            padding: '12px',
                            borderRadius: '6px',
                            marginTop: '10px',
                            fontFamily: 'monospace',
                            fontSize: '13px'
                        }}>
                            <strong>{t('meters.instructions.mqttTopicLabel')}</strong> {t('meters.instructions.mqttTopicExample')}<br />
                            <strong>{t('meters.instructions.mqttBrokerLabel')}</strong> {t('meters.instructions.mqttBrokerExample')}<br />
                            <strong>{t('meters.instructions.mqttPortLabel')}</strong> {t('meters.instructions.mqttPortExample')}<br />
                            <strong>{t('meters.instructions.mqttQosLabel')}</strong> {t('meters.instructions.mqttQosExample')}<br /><br />

                            <strong>{t('meters.instructions.mqttBenefitsTitle')}</strong><br />
                            {t('meters.instructions.mqttBenefit1')}<br />
                            {t('meters.instructions.mqttBenefit2')}<br />
                            {t('meters.instructions.mqttBenefit3')}<br />
                            {t('meters.instructions.mqttBenefit4')}<br />
                            {t('meters.instructions.mqttBenefit5')}
                        </div>
                    </div>

                    {/* UDP Protocol Section */}
                    <h3 style={{
                        fontSize: '18px',
                        fontWeight: '600',
                        marginTop: '20px',
                        marginBottom: '10px',
                        color: '#1f2937',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <Radio size={20} color="#f59e0b" />
                        {t('meters.instructions.udpTitle')}
                    </h3>
                    <div style={{
                        backgroundColor: '#fef3c7',
                        padding: '16px',
                        borderRadius: '8px',
                        marginBottom: '16px',
                        border: '2px solid #f59e0b'
                    }}>
                        <p style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AlertCircle size={16} color="#f59e0b" />
                            <strong>{t('meters.instructions.udpDeprecated')}</strong>
                        </p>
                        <ol style={{ marginLeft: '20px', marginTop: '10px' }}>
                            <li>{t('meters.instructions.udpStep1')}</li>
                            <li>{t('meters.instructions.udpStep2')}</li>
                            <li>{t('meters.instructions.udpStep3')}</li>
                            <li>{t('meters.instructions.udpStep4')}</li>
                            <li><strong>{t('meters.instructions.udpStep5')}</strong></li>
                        </ol>
                        <div style={{
                            backgroundColor: '#fff',
                            padding: '12px',
                            borderRadius: '6px',
                            marginTop: '10px',
                            fontFamily: 'monospace',
                            fontSize: '13px'
                        }}>
                            <strong>{t('meters.instructions.udpExample1Title')}</strong><br />
                            {t('meters.instructions.udpPort')} 8888<br />
                            {t('meters.instructions.udpDataKey')} "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d_power_kwh" {t('meters.instructions.udpAutoGenerated')}<br />
                            {t('meters.instructions.udpLoxoneSends')} {"{\"a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d_power_kwh\": <v>}"}<br /><br />

                            <strong>{t('meters.instructions.udpExample2Title')}</strong><br />
                            {t('meters.instructions.udpPort')} 8888 {t('meters.instructions.udpSamePort')}<br />
                            {t('meters.instructions.udpDataKey')} "f6e5d4c3-b2a1-4098-7654-321fedcba098_power_kwh" {t('meters.instructions.udpAutoGenerated')}<br />
                            {t('meters.instructions.udpLoxoneSends')} {"{\"f6e5d4c3-b2a1-4098-7654-321fedcba098_power_kwh\": <v>}"}
                        </div>
                    </div>

                    {/* Modbus TCP Section */}
                    <h3 style={{
                        fontSize: '18px',
                        fontWeight: '600',
                        marginTop: '20px',
                        marginBottom: '10px',
                        color: '#1f2937',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <Zap size={20} color="#0284c7" />
                        {t('meters.instructions.modbusTitle')}
                    </h3>
                    <div style={{
                        backgroundColor: '#e0f2fe',
                        padding: '16px',
                        borderRadius: '8px',
                        marginBottom: '16px',
                        border: '2px solid #0284c7'
                    }}>
                        <p style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '12px'
                        }}>
                            <strong>{t('meters.instructions.modbusSubtitle')}</strong>
                        </p>
                        <p style={{ marginBottom: '12px', fontSize: '14px' }}>
                            {t('meters.instructions.modbusDescription')}
                        </p>

                        <h4 style={{
                            fontSize: '15px',
                            fontWeight: '600',
                            marginTop: '16px',
                            marginBottom: '8px',
                            color: '#0c4a6e'
                        }}>
                            {t('meters.instructions.modbusWhatYouNeed')}
                        </h4>
                        <div style={{
                            backgroundColor: '#fff',
                            padding: '12px',
                            borderRadius: '6px',
                            marginBottom: '12px',
                            fontSize: '13px'
                        }}>
                            <ol style={{ marginLeft: '20px', marginTop: '8px', marginBottom: '8px' }}>
                                <li><strong>{t('meters.instructions.modbusNeed1')}</strong> {t('meters.instructions.modbusNeed1Desc')}</li>
                                <li><strong>{t('meters.instructions.modbusNeed2')}</strong> {t('meters.instructions.modbusNeed2Desc')}</li>
                                <li><strong>{t('meters.instructions.modbusNeed3')}</strong> {t('meters.instructions.modbusNeed3Desc')}</li>
                                <li><strong>{t('meters.instructions.modbusNeed4')}</strong> {t('meters.instructions.modbusNeed4Desc')}</li>
                                <li><strong>{t('meters.instructions.modbusNeed5')}</strong> {t('meters.instructions.modbusNeed5Desc')}</li>
                                <li><strong>{t('meters.instructions.modbusNeed6')}</strong> {t('meters.instructions.modbusNeed6Desc')}</li>
                            </ol>
                        </div>

                        <h4 style={{
                            fontSize: '15px',
                            fontWeight: '600',
                            marginTop: '16px',
                            marginBottom: '8px',
                            color: '#0c4a6e'
                        }}>
                            {t('meters.instructions.modbusConfigSteps')}
                        </h4>
                        <ol style={{ marginLeft: '20px', marginTop: '10px' }}>
                            <li>
                                <strong>{t('meters.instructions.modbusStep1Title')}</strong>
                                <ul style={{ marginLeft: '20px', marginTop: '4px' }}>
                                    <li>{t('meters.instructions.modbusStep1a')}</li>
                                    <li>{t('meters.instructions.modbusStep1b')}</li>
                                    <li>{t('meters.instructions.modbusStep1c')}</li>
                                </ul>
                            </li>
                            <li style={{ marginTop: '8px' }}>
                                <strong>{t('meters.instructions.modbusStep2Title')}</strong> {t('meters.instructions.modbusStep2Desc')}
                                <ul style={{ marginLeft: '20px', marginTop: '4px' }}>
                                    <li><strong>FC03</strong> - {t('meters.instructions.modbusFc03Desc')}</li>
                                    <li><strong>FC04</strong> - {t('meters.instructions.modbusFc04Desc')}</li>
                                    <li>FC01 - {t('meters.instructions.modbusFc01Desc')} | FC02 - {t('meters.instructions.modbusFc02Desc')}</li>
                                </ul>
                            </li>
                            <li style={{ marginTop: '8px' }}>
                                <strong>{t('meters.instructions.modbusStep3Title')}</strong> {t('meters.instructions.modbusStep3Desc')}
                                <ul style={{ marginLeft: '20px', marginTop: '4px' }}>
                                    <li><strong>float32</strong> - {t('meters.instructions.modbusFloat32Desc')}</li>
                                    <li>float64 - {t('meters.instructions.modbusFloat64Desc')}</li>
                                    <li>int16/int32 - {t('meters.instructions.modbusIntDesc')}</li>
                                    <li>uint16/uint32 - {t('meters.instructions.modbusUintDesc')}</li>
                                </ul>
                            </li>
                            <li style={{ marginTop: '8px' }}>
                                <strong>{t('meters.instructions.modbusStep4Title')}</strong> {t('meters.instructions.modbusStep4Desc')}
                                <ul style={{ marginLeft: '20px', marginTop: '4px' }}>
                                    <li>{t('meters.instructions.modbusStep4a')}</li>
                                    <li>{t('meters.instructions.modbusStep4b')}</li>
                                    <li>{t('meters.instructions.modbusStep4c')}</li>
                                </ul>
                            </li>
                            <li style={{ marginTop: '8px' }}>
                                <strong>{t('meters.instructions.modbusStep5Title')}</strong> {t('meters.instructions.modbusStep5Desc')}
                                <ul style={{ marginLeft: '20px', marginTop: '4px' }}>
                                    <li>{t('meters.instructions.modbusStep5a')}</li>
                                    <li>{t('meters.instructions.modbusStep5b')}</li>
                                    <li>{t('meters.instructions.modbusStep5c')}</li>
                                </ul>
                            </li>
                        </ol>

                        <h4 style={{
                            fontSize: '15px',
                            fontWeight: '600',
                            marginTop: '16px',
                            marginBottom: '8px',
                            color: '#0c4a6e'
                        }}>
                            {t('meters.instructions.modbusReadingManual')}
                        </h4>
                        <div style={{
                            backgroundColor: '#fff',
                            padding: '12px',
                            borderRadius: '6px',
                            marginBottom: '12px',
                            fontSize: '13px'
                        }}>
                            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f0f9ff' }}>
                                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #0284c7' }}>
                                            {t('meters.instructions.modbusManualTerm')}
                                        </th>
                                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #0284c7' }}>
                                            {t('meters.instructions.modbusSystemField')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>
                                            <strong>{t('meters.instructions.modbusIoAddress')}</strong>
                                        </td>
                                        <td style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>
                                            {t('meters.instructions.modbusRegisterAddress')}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>
                                            <strong>{t('meters.instructions.modbusBefehl')}</strong>
                                        </td>
                                        <td style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>
                                            {t('meters.instructions.modbusFunctionCode')}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>
                                            <strong>{t('meters.instructions.modbusDatentyp')}</strong>
                                        </td>
                                        <td style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>
                                            {t('meters.instructions.modbusDataType')}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style={{ padding: '8px' }}>
                                            <strong>{t('meters.instructions.modbusWirkenergie')}</strong>
                                        </td>
                                        <td style={{ padding: '8px' }}>
                                            {t('meters.instructions.modbusImportExportRegister')}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <h4 style={{
                            fontSize: '15px',
                            fontWeight: '600',
                            marginTop: '16px',
                            marginBottom: '8px',
                            color: '#0c4a6e'
                        }}>
                            {t('meters.instructions.modbusCommonConfigs')}
                        </h4>
                        <div style={{
                            backgroundColor: '#fff',
                            padding: '12px',
                            borderRadius: '6px',
                            marginBottom: '12px',
                            fontFamily: 'monospace',
                            fontSize: '12px'
                        }}>
                            <strong>{t('meters.instructions.modbusConfig1Title')}</strong><br />
                            IP: 192.168.1.100:502<br />
                            {t('meters.instructions.modbusUnitId')}: 1<br />
                            {t('meters.instructions.modbusFunction')}: FC03<br />
                            {t('meters.instructions.modbusDataType')}: float32<br />
                            {t('meters.instructions.modbusImportRegister')}: 0<br />
                            {t('meters.instructions.modbusExport')}: {t('meters.instructions.modbusDisabled')}<br /><br />

                            <strong>{t('meters.instructions.modbusConfig2Title')}</strong><br />
                            IP: 192.168.1.100:502<br />
                            {t('meters.instructions.modbusUnitId')}: 1<br />
                            {t('meters.instructions.modbusFunction')}: FC03<br />
                            {t('meters.instructions.modbusDataType')}: float32<br />
                            {t('meters.instructions.modbusImportRegister')}: 0<br />
                            {t('meters.instructions.modbusExportRegister')}: âœ“ {t('meters.instructions.modbusEnabled')} â†’ 100<br /><br />

                            <strong>{t('meters.instructions.modbusConfig3Title')}</strong><br />
                            IP: 192.168.1.100:502<br />
                            {t('meters.instructions.modbusUnitId')}: 1<br />
                            {t('meters.instructions.modbusFunction')}: FC04 {t('meters.instructions.modbusDifferent')}<br />
                            {t('meters.instructions.modbusDataType')}: float32<br />
                            {t('meters.instructions.modbusImportRegister')}: 0
                        </div>

                        <div style={{
                            backgroundColor: '#fef3c7',
                            padding: '12px',
                            borderRadius: '6px',
                            marginTop: '12px',
                            fontSize: '13px',
                            border: '1px solid #f59e0b'
                        }}>
                            <strong>{t('meters.instructions.modbusImportantNotes')}</strong>
                            <ul style={{ marginLeft: '20px', marginTop: '8px', marginBottom: '0' }}>
                                <li>{t('meters.instructions.modbusNote1')}</li>
                                <li>{t('meters.instructions.modbusNote2')}</li>
                                <li>{t('meters.instructions.modbusNote3')}</li>
                                <li>{t('meters.instructions.modbusNote4')}</li>
                                <li>{t('meters.instructions.modbusNote5')}</li>
                            </ul>
                        </div>
                    </div>

                    {/* Testing Section */}
                    <h3 style={{
                        fontSize: '18px',
                        fontWeight: '600',
                        marginTop: '20px',
                        marginBottom: '10px',
                        color: '#1f2937',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <Settings size={20} color="#3b82f6" />
                        {t('meters.instructions.testingTitle')}
                    </h3>
                    <div style={{
                        backgroundColor: '#dbeafe',
                        padding: '16px',
                        borderRadius: '8px',
                        marginBottom: '16px',
                        border: '1px solid #3b82f6'
                    }}>
                        <p><strong>{t('meters.instructions.testingIntro')}</strong></p>
                        <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
                            <li>{t('meters.instructions.testingPoint1')}</li>
                            <li>{t('meters.instructions.testingPoint2')}</li>
                            <li>{t('meters.instructions.testingPoint3')}</li>
                            <li>{t('meters.instructions.testingPoint4')}</li>
                        </ul>
                    </div>

                    {/* Troubleshooting Section */}
                    <h3 style={{
                        fontSize: '18px',
                        fontWeight: '600',
                        marginTop: '20px',
                        marginBottom: '10px',
                        color: '#1f2937',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <AlertCircle size={20} color="#f59e0b" />
                        {t('meters.instructions.troubleshootingTitle')}
                    </h3>
                    <div style={{
                        backgroundColor: '#fef3c7',
                        padding: '16px',
                        borderRadius: '8px',
                        border: '1px solid #f59e0b'
                    }}>
                        <ul style={{ marginLeft: '20px' }}>
                            <li>
                                <strong>{t('meters.instructions.troubleshootingLoxoneLabel')}</strong>{' '}
                                {t('meters.instructions.troubleshootingLoxoneWebSocket')}
                            </li>
                            <li>
                                <strong>{t('meters.instructions.troubleshootingLoxoneLabel')}</strong>{' '}
                                {t('meters.instructions.troubleshootingLoxoneAuth')}
                            </li>
                            <li>
                                <strong>{t('meters.instructions.troubleshootingLoxoneLabel')}</strong>{' '}
                                {t('meters.instructions.troubleshootingLoxoneDevice')}
                            </li>
                            <li>
                                <strong>{t('meters.instructions.troubleshootingModbusLabel')}</strong> {t('meters.instructions.troubleshootingModbus1')}{' '}
                                <code style={{
                                    backgroundColor: '#fff',
                                    padding: '2px 6px',
                                    borderRadius: '4px'
                                }}>
                                    ping YOUR_DEVICE_IP
                                </code>
                            </li>
                            <li>
                                <strong>{t('meters.instructions.troubleshootingModbusLabel')}</strong> {t('meters.instructions.troubleshootingModbus2')}
                            </li>
                            <li>
                                <strong>{t('meters.instructions.troubleshootingModbusLabel')}</strong> {t('meters.instructions.troubleshootingModbus3')}
                            </li>
                            <li>
                                <strong>{t('meters.instructions.troubleshootingModbusLabel')}</strong> {t('meters.instructions.troubleshootingModbus4')}
                            </li>
                            <li>
                                <strong>{t('meters.instructions.troubleshootingMqttLabel')}</strong> {t('meters.instructions.troubleshootingMqttBroker')}{' '}
                                <code style={{
                                    backgroundColor: '#fff',
                                    padding: '2px 6px',
                                    borderRadius: '4px'
                                }}>
                                    sudo systemctl status mosquitto
                                </code>
                            </li>
                            <li>
                                <strong>{t('meters.instructions.troubleshootingMqttLabel')}</strong> {t('meters.instructions.troubleshootingMqttSubscribe')}{' '}
                                <code style={{
                                    backgroundColor: '#fff',
                                    padding: '2px 6px',
                                    borderRadius: '4px'
                                }}>
                                    mosquitto_sub -h localhost -t "meters/#"
                                </code>
                            </li>
                            <li>
                                <strong>{t('meters.instructions.troubleshootingMqttLabel')}</strong> {t('meters.instructions.troubleshootingMqttPublish')}{' '}
                                <code style={{
                                    backgroundColor: '#fff',
                                    padding: '2px 6px',
                                    borderRadius: '4px'
                                }}>
                                    mosquitto_pub -h localhost -t "test" -m "hello"
                                </code>
                            </li>
                            <li>
                                {t('meters.instructions.troubleshootingService')}{' '}
                                <code style={{
                                    backgroundColor: '#fff',
                                    padding: '2px 6px',
                                    borderRadius: '4px'
                                }}>
                                    sudo systemctl status zev-billing
                                </code>
                            </li>
                            <li>
                                {t('meters.instructions.troubleshootingLogs')}{' '}
                                <code style={{
                                    backgroundColor: '#fff',
                                    padding: '2px 6px',
                                    borderRadius: '4px'
                                }}>
                                    journalctl -u zev-billing -f
                                </code>
                            </li>
                            <li>
                                {t('meters.instructions.troubleshootingNetwork')}{' '}
                                <code style={{
                                    backgroundColor: '#fff',
                                    padding: '2px 6px',
                                    borderRadius: '4px'
                                }}>
                                    ping YOUR_LOXONE_IP
                                </code>
                            </li>
                            <li>{t('meters.instructions.troubleshootingMonitor')}</li>
                        </ul>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    style={{
                        width: '100%',
                        marginTop: '24px',
                        padding: '12px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer'
                    }}
                >
                    {t('common.close')}
                </button>
            </div>
        </div>
    );
}