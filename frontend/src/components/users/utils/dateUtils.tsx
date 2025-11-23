import { MoveRight } from 'lucide-react';

export function formatDateForInput(dateStr?: string): string {
  if (!dateStr) return '';
  // If it's already in YYYY-MM-DD format, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  // Otherwise, parse the ISO date and extract YYYY-MM-DD
  try {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    console.error('Error parsing date:', dateStr, e);
    return '';
  }
}

export function formatRentPeriod(startDate?: string, endDate?: string): JSX.Element | string {
  if (!startDate) return '-';

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const start = formatDate(startDate);

  // Don't show end date if it's the default far future date
  if (!endDate || endDate === '2099-01-01') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        {start}
        <MoveRight size={14} />
      </span>
    );
  }

  const end = formatDate(endDate);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      {start}
      <MoveRight size={14} />
      {end}
    </span>
  );
}