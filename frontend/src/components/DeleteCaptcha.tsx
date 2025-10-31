import { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from '../i18n';

interface DeleteCaptchaProps {
  onValidationChange: (isValid: boolean) => void;
}

export default function DeleteCaptcha({ onValidationChange }: DeleteCaptchaProps) {
  const { t } = useTranslation();
  const [targetPosition, setTargetPosition] = useState(50);
  const [sliderValue, setSliderValue] = useState(0);
  const [isValid, setIsValid] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generateNewChallenge = () => {
    const newTarget = Math.floor(Math.random() * 60) + 20;
    setTargetPosition(newTarget);
    setSliderValue(0);
    setIsValid(false);
    setHasInteracted(false);
    onValidationChange(false);
  };

  useEffect(() => {
    generateNewChallenge();
  }, []);

  useEffect(() => {
    const tolerance = 5;
    const valid = Math.abs(sliderValue - targetPosition) <= tolerance;
    setIsValid(valid);
    onValidationChange(valid);
  }, [sliderValue, targetPosition, onValidationChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw track
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(10, 45, canvas.width - 20, 10);

    // Draw target zone
    const targetX = (targetPosition / 100) * (canvas.width - 20) + 10;
    ctx.fillStyle = isValid ? '#22c55e' : '#3b82f6';
    ctx.globalAlpha = 0.3;
    ctx.fillRect(targetX - 15, 35, 30, 30);
    ctx.globalAlpha = 1;

    // Draw target circle
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(targetX, 50, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw slider square
    const sliderX = (sliderValue / 100) * (canvas.width - 20) + 10;
    ctx.fillStyle = hasInteracted ? (isValid ? '#22c55e' : '#ef4444') : '#6b7280';
    ctx.fillRect(sliderX - 12, 38, 24, 24);
    ctx.strokeStyle = hasInteracted ? (isValid ? '#16a34a' : '#dc2626') : '#4b5563';
    ctx.lineWidth = 2;
    ctx.strokeRect(sliderX - 12, 38, 24, 24);

    // Draw alignment helper lines
    if (hasInteracted && !isValid) {
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(targetX, 25);
      ctx.lineTo(targetX, 75);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [sliderValue, targetPosition, isValid, hasInteracted]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasInteracted(true);
    setSliderValue(Number(e.target.value));
  };

  return (
    <div style={{
      marginBottom: '16px',
      padding: '16px',
      backgroundColor: '#f0f9ff',
      border: '2px solid #3b82f6',
      borderRadius: '12px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <label style={{ fontWeight: '600', fontSize: '14px', color: '#1e40af' }}>
          {t('captcha.title')}
        </label>
        <button
          type="button"
          onClick={generateNewChallenge}
          style={{
            padding: '6px 12px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title={t('captcha.new')}
        >
          <RefreshCw size={14} />
          {t('captcha.new')}
        </button>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <p style={{ 
          fontSize: '13px', 
          color: '#1e40af', 
          marginBottom: '8px', 
          fontWeight: '500',
          textAlign: 'center' 
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
            marginBottom: '12px'
          }}
        />

        <input
          type="range"
          min="0"
          max="100"
          value={sliderValue}
          onChange={handleSliderChange}
          style={{
            width: '100%',
            height: '8px',
            borderRadius: '4px',
            outline: 'none',
            background: isValid 
              ? 'linear-gradient(to right, #22c55e, #22c55e)' 
              : 'linear-gradient(to right, #3b82f6, #93c5fd)',
            WebkitAppearance: 'none',
            appearance: 'none',
            cursor: 'pointer'
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: 0 }}>
          {t('captcha.footer')}
        </p>
        {isValid && (
          <span style={{ 
            fontSize: '12px', 
            color: '#22c55e', 
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            ✓ {t('captcha.success')}
          </span>
        )}
      </div>
    </div>
  );
}