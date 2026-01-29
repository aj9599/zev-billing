import {
  AlertCircle,
  CheckCircle,
  Info,
  Wifi,
  WifiOff,
  RefreshCw,
  Key,
  Globe,
  FileText,
  Shield,
  Database,
} from 'lucide-react';

interface LogIconProps {
  action: string;
}

type LogCategory = 'error' | 'success' | 'connection' | 'disconnect' | 'reconnect' | 'auth' | 'dns' | 'billing' | 'security' | 'collection' | 'info';

function categorizeAction(action: string): LogCategory {
  const a = action.toLowerCase();

  // Errors and failures
  if (a.includes('error') || a.includes('failed') || a.includes('exhausted') || a.includes('timeout')) {
    return 'error';
  }

  // Disconnections
  if (a.includes('disconnected') || a.includes('closed') || a.includes('stopping') || a.includes('stopped')) {
    return 'disconnect';
  }

  // Reconnections and restarts
  if (a.includes('reconnect') || a.includes('restart') || a.includes('port change')) {
    return 'reconnect';
  }

  // Connections established
  if (a.includes('connected') || a.includes('started') || a.includes('ready') || a.includes('listener started') || a.includes('initialized')) {
    return 'connection';
  }

  // Authentication and tokens
  if (a.includes('auth') || a.includes('token') || a.includes('login') || a.includes('password') || a.includes('key')) {
    return 'auth';
  }

  // DNS changes
  if (a.includes('dns') || a.includes('cloud host') || a.includes('resolve')) {
    return 'dns';
  }

  // Billing and invoices
  if (a.includes('billing') || a.includes('invoice') || a.includes('bill') || a.includes('export') || a.includes('backup')) {
    return 'billing';
  }

  // Security events
  if (a.includes('security') || a.includes('login_failed') || a.includes('login_success')) {
    return 'security';
  }

  // Data collection and readings
  if (a.includes('collected') || a.includes('collection') || a.includes('reading') || a.includes('session') || a.includes('meter')) {
    return 'collection';
  }

  // Success states
  if (a.includes('success') || a.includes('complete') || a.includes('restored') || a.includes('generated')) {
    return 'success';
  }

  return 'info';
}

const iconConfig: Record<LogCategory, { icon: typeof Info; color: string }> = {
  error:      { icon: AlertCircle, color: '#dc3545' },
  success:    { icon: CheckCircle, color: '#28a745' },
  connection: { icon: Wifi,        color: '#10b981' },
  disconnect: { icon: WifiOff,     color: '#f59e0b' },
  reconnect:  { icon: RefreshCw,   color: '#f97316' },
  auth:       { icon: Key,         color: '#8b5cf6' },
  dns:        { icon: Globe,       color: '#6366f1' },
  billing:    { icon: FileText,    color: '#0ea5e9' },
  security:   { icon: Shield,      color: '#ec4899' },
  collection: { icon: Database,    color: '#14b8a6' },
  info:       { icon: Info,        color: '#6b7280' },
};

export const LogIcon = ({ action }: LogIconProps) => {
  const category = categorizeAction(action);
  const config = iconConfig[category];
  const Icon = config.icon;
  return <Icon size={16} color={config.color} />;
};

export { categorizeAction };
export type { LogCategory };
