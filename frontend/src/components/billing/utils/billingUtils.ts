import type { Invoice, User } from '../../../types';

export const formatDate = (dateStr: string | Date): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('de-CH');
};

export const getStatusColor = (status: string): { bg: string; color: string } => {
  switch (status.toLowerCase()) {
    case 'issued':
      return { bg: '#d4edda', color: '#155724' };
    case 'pending':
      return { bg: '#fff3cd', color: '#856404' };
    case 'paid':
      return { bg: '#d1ecf1', color: '#0c5460' };
    case 'draft':
      return { bg: '#f8d7da', color: '#721c24' };
    case 'archived':
      return { bg: '#e2e3e5', color: '#383d41' };
    default:
      return { bg: '#e2e3e5', color: '#383d41' };
  }
};

export const organizeInvoicesByYear = (
  invoices: Invoice[]
): Record<string, Invoice[]> => {
  return invoices.reduce((acc, inv) => {
    const year = new Date(inv.period_start).getFullYear().toString();
    if (!acc[year]) acc[year] = [];
    acc[year].push(inv);
    return acc;
  }, {} as Record<string, Invoice[]>);
};

export const organizeInvoicesByUser = (
  invoices: Invoice[],
  users: User[]
): Record<string, Invoice[]> => {
  return invoices.reduce((acc, inv) => {
    const user = users.find(u => u.id === inv.user_id);
    const userName = user ? `${user.first_name} ${user.last_name}` : 'Unknown User';
    if (!acc[userName]) acc[userName] = [];
    acc[userName].push(inv);
    return acc;
  }, {} as Record<string, Invoice[]>);
};

export const getCategoryColor = (category: string): string => {
  const colors: Record<string, string> = {
    meter_rent: '#3b82f6',
    maintenance: '#f59e0b',
    service: '#10b981',
    other: '#6b7280'
  };
  return colors[category] || '#6b7280';
};

export const getSplitTypeLabel = (splitType: string, t: (key: string) => string): string => {
  const labels: Record<string, string> = {
    'equal': t('sharedMeters.splitType.equal'),
    'custom': t('sharedMeters.splitType.custom')
  };
  return labels[splitType] || splitType;
};