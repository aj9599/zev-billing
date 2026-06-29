// Lightweight, dependency-free toast notifications. A module-level store so any
// code (components, hooks, plain functions) can call notify(...) without needing
// context. <ToastContainer /> (mounted once in App) subscribes and renders.

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(toasts);
}

export function subscribeToasts(l: Listener): () => void {
  listeners.add(l);
  l(toasts);
  return () => {
    listeners.delete(l);
  };
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function push(message: string, type: ToastType) {
  const id = nextId++;
  toasts = [...toasts, { id, message, type }];
  emit();
  // Errors linger a little longer than success/info.
  const ttl = type === 'error' ? 6500 : 4000;
  setTimeout(() => dismissToast(id), ttl);
}

// classify infers the tone from the message so existing alert() text keeps
// sensible styling after a mechanical alert() → notify() swap.
function classify(message: string): ToastType {
  const m = message.toLowerCase();
  if (/(fail|error|invalid|could not|cannot|denied|fehler|fehlgeschlagen|ungültig|✗|❌|⚠)/.test(m)) {
    return 'error';
  }
  if (/(success|saved|created|updated|deleted|sent|erfolg|gespeichert|erstellt|aktualisiert|gelöscht|✓|✅)/.test(m)) {
    return 'success';
  }
  return 'info';
}

interface Notify {
  (message: string): void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

export const notify: Notify = Object.assign(
  (message: string) => push(message, classify(message)),
  {
    success: (message: string) => push(message, 'success'),
    error: (message: string) => push(message, 'error'),
    info: (message: string) => push(message, 'info'),
  }
);
