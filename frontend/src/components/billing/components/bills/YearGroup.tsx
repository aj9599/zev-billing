import type { Invoice, User } from '../../../../types';
import { useTranslation } from '../../../../i18n';
import InvoiceTable from './InvoiceTable';
import InvoiceCard from './InvoiceCard';

interface YearGroupProps {
  year: string;
  buildingId: number;
  invoices: Invoice[];
  users: User[];
  isExpanded: boolean;
  onToggle: () => void;
  onView: (id: number) => void;
  onDownload: (invoice: Invoice) => void;
  onDelete: (id: number) => void;
}

export default function YearGroup({
  year,
  invoices,
  users,
  isExpanded,
  onToggle,
  onView,
  onDownload,
  onDelete
}: YearGroupProps) {
  const { t } = useTranslation();

  return (
    <div style={{ marginBottom: '20px' }}>
      <div
        onClick={onToggle}
        style={{
          backgroundColor: '#e7f3ff',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '8px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          border: '1px solid #3b82f6'
        }}
      >
        <h3 style={{
          fontSize: '16px',
          fontWeight: '600',
          margin: 0,
          color: '#1f2937'
        }}>
          {year} ({invoices.length}{' '}
          {invoices.length === 1 ? t('billing.invoice') : t('billing.invoices')})
        </h3>
        <span style={{ fontSize: '18px', color: '#666' }}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </div>

      {isExpanded && (
        <>
          <div className="desktop-table">
            <InvoiceTable
              invoices={invoices}
              users={users}
              onView={onView}
              onDownload={onDownload}
              onDelete={onDelete}
            />
          </div>

          <div className="mobile-cards">
            {invoices.map(invoice => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                user={users.find(u => u.id === invoice.user_id)}
                onView={onView}
                onDownload={onDownload}
                onDelete={onDelete}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}