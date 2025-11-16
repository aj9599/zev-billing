import { Edit2, Trash2, Zap, Wifi, WifiOff, Activity, Battery, TrendingUp, Power, Gauge, User, Clock } from 'lucide-react';
import type { Charger } from '../../types';
import type { LiveChargerData, LoxoneConnectionStatus, ZaptecConnectionStatus } from './hooks/useChargerStatus';
import { getPreset } from '../chargerPresets';
import { getStateDisplay, getModeDisplay } from './utils/chargerUtils';
import ChargerConnectionStatus from './ChargerConnectionStatus';

interface ChargerCardProps {
  charger: Charger;
  liveData?: LiveChargerData;
  loxoneStatus?: LoxoneConnectionStatus[number];
  zaptecStatus?: ZaptecConnectionStatus[number];
  onEdit: () => void;
  onDelete: () => void;
  t: (key: string) => string;
}

export default function ChargerCard({
  charger,
  liveData,
  loxoneStatus,
  zaptecStatus,
  onEdit,
  onDelete,
  t
}: ChargerCardProps) {
  const chargerPreset = getPreset(charger.preset);
  const isCharging = liveData?.state === '67';

  return (
    <div 
      className="charger-card-modern" 
      style={{
        background: isCharging
          ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
          : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '24px',
        padding: '0',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
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
      {/* Animated Background */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0.1,
        background: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px)',
        pointerEvents: 'none'
      }} />

      {/* Header Section */}
      <div style={{
        padding: '24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
        position: 'relative'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '12px'
        }}>
          <div style={{ flex: 1, paddingRight: '16px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '8px'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Zap size={28} color="white" />
              </div>
              <div>
                <h3 style={{
                  fontSize: '22px',
                  fontWeight: '700',
                  margin: 0,
                  color: 'white',
                  lineHeight: '1.2'
                }}>
                  {charger.name}
                </h3>
                <p style={{
                  fontSize: '13px',
                  color: 'rgba(255, 255, 255, 0.8)',
                  margin: '4px 0 0 0',
                  textTransform: 'capitalize',
                  fontWeight: '500'
                }}>
                  {chargerPreset.label}
                </p>
              </div>
            </div>
          </div>

          {/* Edit and Delete Buttons */}
          <div style={{
            display: 'flex',
            gap: '8px'
          }}>
            <button
              onClick={onEdit}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                border: 'none',
                background: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(10px)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title={t('common.edit')}
            >
              <Edit2 size={18} />
            </button>
            <button
              onClick={onDelete}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                border: 'none',
                background: 'rgba(239, 68, 68, 0.3)',
                backdropFilter: 'blur(10px)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.5)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title={t('common.delete')}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* Status Badges */}
        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          marginTop: '12px'
        }}>
          <div style={{
            padding: '6px 12px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: '600',
            color: 'white'
          }}>
            {(liveData?.is_online ?? true) ? (
              <>
                <Wifi size={14} />
                Online
              </>
            ) : (
              <>
                <WifiOff size={14} />
                Offline
              </>
            )}
          </div>

          {isCharging && (
            <div style={{
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.3)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: '700',
              color: 'white',
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
            }}>
              <Activity size={14} />
              CHARGING
            </div>
          )}

          <div style={{
            padding: '6px 12px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(10px)',
            fontSize: '12px',
            fontWeight: '600',
            color: 'white'
          }}>
            {getStateDisplay(charger, liveData?.state, t)}
          </div>
        </div>
      </div>

      {/* Main Content Section */}
      <div style={{ padding: '24px', background: 'white' }}>
        {/* Energy Metrics Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: liveData?.session_energy && liveData.session_energy > 0 ? '1fr 1fr' : '1fr',
          gap: '16px',
          marginBottom: '20px'
        }}>
          {/* Total Energy Card */}
          {liveData?.total_energy !== undefined && charger.connection_type === 'zaptec_api' && (
            <div style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              borderRadius: '16px',
              padding: '20px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{
                position: 'absolute',
                top: '-20px',
                right: '-20px',
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.1)',
                filter: 'blur(40px)'
              }} />
              <div style={{ position: 'relative' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Battery size={22} color="white" />
                  </div>
                  <div>
                    <div style={{
                      fontSize: '12px',
                      color: 'rgba(255, 255, 255, 0.8)',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Total Energy
                    </div>
                    <div style={{
                      fontSize: '28px',
                      fontWeight: '800',
                      color: 'white',
                      lineHeight: '1'
                    }}>
                      {liveData.total_energy.toFixed(1)}
                      <span style={{ fontSize: '16px', marginLeft: '4px', opacity: 0.8 }}>kWh</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Session Energy Card */}
          {liveData?.session_energy !== undefined && liveData.session_energy > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              borderRadius: '16px',
              padding: '20px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{
                position: 'absolute',
                top: '-20px',
                right: '-20px',
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.1)',
                filter: 'blur(40px)'
              }} />
              <div style={{ position: 'relative' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <TrendingUp size={22} color="white" />
                  </div>
                  <div>
                    <div style={{
                      fontSize: '12px',
                      color: 'rgba(255, 255, 255, 0.8)',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Session Energy
                    </div>
                    <div style={{
                      fontSize: '28px',
                      fontWeight: '800',
                      color: 'white',
                      lineHeight: '1'
                    }}>
                      {liveData.session_energy.toFixed(1)}
                      <span style={{ fontSize: '16px', marginLeft: '4px', opacity: 0.8 }}>kWh</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Current Power - BIG Display */}
        {liveData?.current_power_kw !== undefined && (
          <div style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '20px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute',
              top: '-30px',
              right: '-30px',
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.1)',
              filter: 'blur(50px)'
            }} />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'relative'
            }}>
              <div>
                <div style={{
                  fontSize: '13px',
                  color: 'rgba(255, 255, 255, 0.9)',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  marginBottom: '8px'
                }}>
                  Current Power
                </div>
                <div style={{
                  fontSize: '42px',
                  fontWeight: '900',
                  color: 'white',
                  lineHeight: '1',
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '8px'
                }}>
                  {liveData.current_power_kw.toFixed(2)}
                  <span style={{ fontSize: '22px', opacity: 0.9 }}>kW</span>
                </div>
              </div>
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Power size={40} color="white" />
              </div>
            </div>
          </div>
        )}

        {/* Voltage & Current Grid */}
        {(liveData?.voltage || liveData?.current) && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '20px'
          }}>
            {liveData.voltage && (
              <div style={{
                padding: '16px',
                background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                borderRadius: '12px',
                border: '1px solid #d1d5db'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px'
                }}>
                  <Gauge size={18} color="#6b7280" />
                  <div style={{
                    fontSize: '11px',
                    color: '#6b7280',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Voltage
                  </div>
                </div>
                <div style={{
                  fontSize: '24px',
                  fontWeight: '700',
                  color: '#1f2937'
                }}>
                  {liveData.voltage.toFixed(0)}
                  <span style={{ fontSize: '14px', marginLeft: '4px', color: '#6b7280' }}>V</span>
                </div>
              </div>
            )}
            {liveData.current && (
              <div style={{
                padding: '16px',
                background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                borderRadius: '12px',
                border: '1px solid #d1d5db'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px'
                }}>
                  <Activity size={18} color="#6b7280" />
                  <div style={{
                    fontSize: '11px',
                    color: '#6b7280',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Current
                  </div>
                </div>
                <div style={{
                  fontSize: '24px',
                  fontWeight: '700',
                  color: '#1f2937'
                }}>
                  {liveData.current.toFixed(1)}
                  <span style={{ fontSize: '14px', marginLeft: '4px', color: '#6b7280' }}>A</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mode Display */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px',
          background: '#f9fafb',
          borderRadius: '12px',
          border: '1px solid #e5e7eb'
        }}>
          <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '600' }}>
            Charging Mode
          </span>
          <span style={{
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '700',
            background: liveData?.mode === '2'
              ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
              : 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)',
            color: 'white',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            {getModeDisplay(charger, liveData?.mode, t)}
          </span>
        </div>
      </div>

      <ChargerConnectionStatus
        charger={charger}
        liveData={liveData}
        loxoneStatus={loxoneStatus}
        zaptecStatus={zaptecStatus}
        t={t}
      />
    </div>
  );
}