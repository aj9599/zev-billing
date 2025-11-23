import { AlertCircle, CheckCircle, Info } from 'lucide-react';

interface LogIconProps {
  action: string;
}

export const LogIcon = ({ action }: LogIconProps) => {
  if (action.toLowerCase().includes('error') || action.toLowerCase().includes('failed')) {
    return <AlertCircle size={16} color="#dc3545" />;
  } else if (action.toLowerCase().includes('success') || action.toLowerCase().includes('collected')) {
    return <CheckCircle size={16} color="#28a745" />;
  }
  return <Info size={16} color="#007bff" />;
};