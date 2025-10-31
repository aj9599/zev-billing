import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, ShieldCheck, Lock } from 'lucide-react';
import { useTranslation } from '../i18n';

interface DeleteCaptchaProps {
  onValidationChange: (isValid: boolean) => void;
}

export default function DeleteCaptcha({ onValidationChange }: DeleteCaptchaProps) {
  const { t } = useTranslation();
  const [targetPosition, setTargetPosition] = useState(() => Math.floor(Math.random() * 60) + 20);
  const [sliderValue, setSliderValue] = useState(0);
  const [isValid, setIsValid] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const validationTimeoutRef = useRef<NodeJS.Timeout>();

  const generateNewChallenge = useCallback(() => {
    const newTarget = Math.floor(Math.random() * 60) + 20;
    setTargetPosition(newTarget);
    setSliderValue(0);
    setIsValid(false);
    setHasInteracted(false);
    setIsLocked(false);
    onValidationChange(false);
  }, [onValidationChange]);

  useEffect(() => {
    const tolerance = 5;
    const valid = hasInteracted && Math.abs(sliderValue - targetPosition) <= tolerance;
    
    // Clear any existing timeout
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    
    if (valid && !isLocked) {
      // Lock the captcha for a moment to prevent flickering
      setIsLocked(true);
      validationTimeoutRef.current = setTimeout(() => {
        setIsValid(true);
        onValidationChange(true);
      }, 300);
    } else if (!valid && isValid) {
      setIsValid(false);
      onValidationChange(false);
    }

    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, [sliderValue, targetPosition, hasInteracted, onValidationChange, isValid, isLocked]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = 300 * dpr;
    canvas.height = 100 * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, 300, 100);

    // Draw background pattern
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 300, 100);

    // Draw track with gradient
    const trackGradient = ctx.createLinearGradient(10, 40, 10, 60);
    trackGradient.addColorStop(0, '#e2e8f0');
    trackGradient.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = trackGradient;
    ctx.fillRect(10, 42, 280, 16);
    
    // Draw track border
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 42, 280, 16);

    // Draw target zone with glow effect
    const targetX = (targetPosition / 100) * 280 + 10;
    
    // Outer glow
    if (!isValid) {
      ctx.fillStyle = '#3b82f6';
      ctx.globalAlpha = 0.1;
      ctx.fillRect(targetX - 20, 30, 40, 40);
      ctx.globalAlpha = 0.2;
      ctx.fillRect(targetX - 18, 32, 36, 36);
    }
    
    // Target zone
    ctx.globalAlpha = isValid ? 0.4 : 0.3;
    const zoneGradient = ctx.createRadialGradient(targetX, 50, 0, targetX, 50, 20);
    zoneGradient.addColorStop(0, isValid ? '#22c55e' : '#3b82f6');
    zoneGradient.addColorStop(1, isValid ? '#16a34a' : '#2563eb');
    ctx.fillStyle = zoneGradient;
    ctx.fillRect(targetX - 16, 34, 32, 32);
    ctx.globalAlpha = 1;

    // Draw target circle with 3D effect
    const circleGradient = ctx.createRadialGradient(targetX - 3, 47, 0, targetX, 50, 14);
    circleGradient.addColorStop(0, isValid ? '#4ade80' : '#60a5fa');
    circleGradient.addColorStop(1, isValid ? '#16a34a' : '#1e40af');
    ctx.fillStyle = circleGradient;
    ctx.beginPath();
    ctx.arc(targetX, 50, 14, 0, Math.PI * 2);
    ctx.fill();
    
    // Target circle border
    ctx.strokeStyle = isValid ? '#15803d' : '#1e3a8a';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    
    // Inner highlight
    ctx.strokeStyle = isValid ? '#86efac' : '#93c5fd';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(targetX - 2, 48, 8, 0, Math.PI * 2);
    ctx.stroke();

    // Draw slider with 3D effect
    const sliderX = (sliderValue / 100) * 280 + 10;
    const distance = Math.abs(sliderX - targetX);
    const isClose = distance < 20 && hasInteracted;
    
    // Slider shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(sliderX - 13, 37, 26, 26);
    
    // Slider main body with gradient
    const sliderGradient = ctx.createLinearGradient(sliderX - 12, 36, sliderX + 12, 60);
    if (!hasInteracted) {
      sliderGradient.addColorStop(0, '#9ca3af');
      sliderGradient.addColorStop(1, '#6b7280');
    } else if (isValid) {
      sliderGradient.addColorStop(0, '#4ade80');
      sliderGradient.addColorStop(1, '#22c55e');
    } else if (isClose) {
      sliderGradient.addColorStop(0, '#fbbf24');
      sliderGradient.addColorStop(1, '#f59e0b');
    } else {
      sliderGradient.addColorStop(0, '#f87171');
      sliderGradient.addColorStop(1, '#ef4444');
    }
    
    ctx.fillStyle = sliderGradient;
    ctx.fillRect(sliderX - 12, 36, 24, 24);
    
    // Slider border
    if (!hasInteracted) {
      ctx.strokeStyle = '#4b5563';
    } else if (isValid) {
      ctx.strokeStyle = '#16a34a';
    } else if (isClose) {
      ctx.strokeStyle = '#d97706';
    } else {
      ctx.strokeStyle = '#dc2626';
    }
    ctx.lineWidth = 2.5;
    ctx.strokeRect(sliderX - 12, 36, 24, 24);
    
    // Slider highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sliderX - 10, 38, 20, 10);

    // Draw distance indicator
    if (hasInteracted && !isValid) {
      ctx.strokeStyle = isClose ? '#f59e0b' : '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(targetX, 20);
      ctx.lineTo(targetX, 80);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw distance text
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      const distancePercent = Math.round(distance / 280 * 100);
      if (isClose) {
        ctx.fillText(t('captcha.almostThere'), targetX, 15);
      } else {
        ctx.fillText(`${distancePercent}% ${t('captcha.away')}`, targetX, 15);
      }
    }

    // Draw success checkmark
    if (isValid) {
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(sliderX - 6, 48);
      ctx.lineTo(sliderX - 2, 52);
      ctx.lineTo(sliderX + 6, 44);
      ctx.stroke();
    }
  }, [sliderValue, targetPosition, isValid, hasInteracted, t]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isLocked) {
      setHasInteracted(true);
      setSliderValue(Number(e.target.value));
    }
  };

  return (
    <div style={{
      marginBottom: '16px',
      padding: '20px',
      background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
      border: '2px solid #3b82f6',
      borderRadius: '16px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      transition: 'all 0.3s ease'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isValid ? (
            <ShieldCheck size={20} color="#22c55e" />
          ) : (
            <Lock size={20} color="#3b82f6" />
          )}
          <label style={{ 
            fontWeight: '700', 
            fontSize: '15px', 
            color: isValid ? '#16a34a' : '#1e40af',
            transition: 'color 0.3s ease'
          }}>
            {t('captcha.title')}
          </label>
        </div>
        <button
          type="button"
          onClick={generateNewChallenge}
          style={{
            padding: '8px 14px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)'
          }}
          title={t('captcha.refreshTitle')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(59, 130, 246, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(59, 130, 246, 0.3)';
          }}
        >
          <RefreshCw size={14} />
          {t('captcha.new')}
        </button>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <p style={{ 
          fontSize: '14px', 
          color: '#1e40af', 
          marginBottom: '12px', 
          fontWeight: '600',
          textAlign: 'center',
          letterSpacing: '0.01em'
        }}>
          {t('captcha.instruction')}
        </p>
        
        <canvas
          ref={canvasRef}
          width={300}
          height={100}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            marginBottom: '16px',
            borderRadius: '8px',
            backgroundColor: '#f8fafc'
          }}
        />

        <div style={{ position: 'relative' }}>
          <input
            type="range"
            min="0"
            max="100"
            value={sliderValue}
            onChange={handleSliderChange}
            disabled={isLocked && isValid}
            style={{
              width: '100%',
              height: '10px',
              borderRadius: '5px',
              outline: 'none',
              background: isValid 
                ? 'linear-gradient(to right, #22c55e, #16a34a)' 
                : hasInteracted
                ? 'linear-gradient(to right, #ef4444, #dc2626)'
                : 'linear-gradient(to right, #3b82f6, #2563eb)',
              WebkitAppearance: 'none',
              appearance: 'none',
              cursor: isLocked && isValid ? 'not-allowed' : 'pointer',
              transition: 'background 0.3s ease',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
        <p style={{ fontSize: '12px', color: '#64748b', marginBottom: 0, fontWeight: '500' }}>
          {t('captcha.footer')}
        </p>
        {isValid && (
          <span style={{ 
            fontSize: '13px', 
            color: '#22c55e', 
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            animation: 'fadeIn 0.3s ease'
          }}>
            ✓ {t('captcha.success')}
          </span>
        )}
      </div>
    </div>
  );
}