import { CheckCircle, AlertCircle, X } from 'lucide-react';
import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose?: () => void;
  autoClose?: boolean;
  duration?: number;
}

/**
 * Toast notification component with accessibility support
 * Displays temporary notifications with auto-dismiss
 * 
 * @param message - The message to display
 * @param type - The type of notification (success, error, info)
 * @param onClose - Optional callback when toast is closed
 * @param autoClose - Whether to auto-close the toast (default: true)
 * @param duration - Duration in ms before auto-close (default: 3000)
 */
export default function Toast({ 
  message, 
  type, 
  onClose,
  autoClose = true,
  duration = 3000 
}: ToastProps) {
  useEffect(() => {
    if (autoClose && onClose) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [autoClose, duration, onClose]);

  const backgroundColor = 
    type === 'success' ? '#10b981' : 
    type === 'error' ? '#ef4444' : 
    '#3b82f6';

  const ariaLabel = 
    type === 'success' ? 'Success notification' : 
    type === 'error' ? 'Error notification' : 
    'Information notification';

  return (
    <div
      role="alert"
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-label={ariaLabel}
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '16px 20px',
        backgroundColor,
        color: 'white',
        borderRadius: '8px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        zIndex: 2000,
        animation: 'slideInRight 0.3s ease-out',
        maxWidth: '400px',
        minWidth: '300px'
      }}
    >
      {type === 'success' && <CheckCircle size={20} aria-hidden="true" />}
      {(type === 'error' || type === 'info') && <AlertCircle size={20} aria-hidden="true" />}
      <span style={{ fontSize: '14px', fontWeight: '500', flex: 1 }}>{message}</span>
      
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close notification"
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            opacity: 0.8,
            transition: 'opacity 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
        >
          <X size={16} />
        </button>
      )}

      <style>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}