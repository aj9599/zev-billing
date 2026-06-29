import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { subscribeToasts, dismissToast, type Toast } from '../utils/toast';

const STYLES: Record<Toast['type'], { bg: string; border: string; fg: string; Icon: typeof Info }> = {
  success: { bg: '#ecfdf5', border: '#10b981', fg: '#065f46', Icon: CheckCircle2 },
  error: { bg: '#fef2f2', border: '#ef4444', fg: '#991b1b', Icon: AlertTriangle },
  info: { bg: '#eff6ff', border: '#3b82f6', fg: '#1e3a8a', Icon: Info },
};

// Mounted once near the app root; renders the stacked toasts from the store.
export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '16px',
      right: '16px',
      zIndex: 4000,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      maxWidth: 'min(380px, calc(100vw - 32px))',
      pointerEvents: 'none',
    }}>
      {toasts.map((t) => {
        const s = STYLES[t.type];
        const Icon = s.Icon;
        return (
          <div
            key={t.id}
            role="alert"
            className="app-fade-in"
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: '10px',
              backgroundColor: s.bg,
              border: `1px solid ${s.border}`,
              boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
              color: s.fg,
              fontSize: '14px',
            }}
          >
            <Icon size={18} color={s.border} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span style={{ flex: 1, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {t.message}
            </span>
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: s.fg, opacity: 0.6, padding: 0, flexShrink: 0 }}
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
