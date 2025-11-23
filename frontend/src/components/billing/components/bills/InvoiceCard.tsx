import { Eye, Download, Trash2 } from 'lucide-react';
import type { Invoice, User } from '../../../types';
import { useTranslation } from '../../../i18n';
import { formatDate, getStatusColor } from '../../utils/billingUtils';

interface InvoiceCardProps {
  invoice: Invoice;
  user: User | undefined;
  onView: (id: number) => void;
  onDownload: (invoice: Invoice) => void;
  onDelete: (id: number) => void;
}

/**
 * Invoice Card Component
 * Displays invoice information in card format for mobile view
 * Fully accessible with ARIA labels and semantic HTML
 */
export default function InvoiceCard({
  invoice,
  user,
  onView,
  onDownload,
  onDelete
}: InvoiceCardProps) {
  const { t } = useTranslation();
  const statusColors = getStatusColor(invoice.status);
  const isArchived = !user?.is_active;
  const userName = user ? `${user.first_name} ${user.last_name}` : '-';

  return (
    <article
      aria-label={`Invoice ${invoice.invoice_number}`}
      style={{
        backgroundColor: isArchived ? '#f8f9fa' : 'white',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '12px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}
    >
      <div style={{ marginBottom: '12px' }}>
        <div style={{
          fontSize: '13px',
          fontFamily: 'monospace',
          color: '#6b7280',
          marginBottom: '4px'
        }}>
          {invoice.invoice_number}
        </div>
        
        <h3 style={{
          fontSize: '16px',
          fontWeight: '600',
          marginBottom: '8px',
          color: '#1f2937'
        }}>
          {userName}
          {isArchived && (
            <span
              role="status"
              aria-label="Archived user"
              style={{
                color: '#999',
                fontSize: '12px',
                marginLeft: '8px'
              }}
            >
              ({t('billing.archived')})
            </span>
          )}
        </h3>
        
        <div style={{
          fontSize: '13px',
          color: '#6b7280',
          marginBottom: '4px'
        }}>
          <time dateTime={invoice.period_start}>
            {formatDate(invoice.period_start)}
          </time>
          {' - '}
          <time dateTime={invoice.period_end}>
            {formatDate(invoice.period_end)}
          </time>
        </div>
        
        <div style={{
          fontSize: '18px',
          fontWeight: '700',
          color: '#1f2937',
          marginBottom: '8px'
        }}>
          {invoice.currency} {invoice.total_amount.toFixed(2)}
        </div>
        
        <span
          role="status"
          aria-label={`Status: ${invoice.status}`}
          style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '600',
            backgroundColor: statusColors.bg,
            color: statusColors.color,
            marginBottom: '8px'
          }}
        >
          {invoice.status.toUpperCase()}
        </span>
        
        <div style={{ fontSize: '12px', color: '#9ca3af' }}>
          {t('billing.generated')}: <time dateTime={invoice.generated_at}>
            {formatDate(invoice.generated_at)}
          </time>
        </div>
      </div>
      
      <div
        role="group"
        aria-label={`Actions for invoice ${invoice.invoice_number}`}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '8px',
          borderTop: '1px solid #f3f4f6',
          paddingTop: '12px'
        }}
      >
        <button
          onClick={() => onView(invoice.id)}
          aria-label={`View details for invoice ${invoice.invoice_number}`}
          title={t('billing.viewBtn')}
          style={{
            padding: '10px',
            backgroundColor: '#667EEA',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#5568d3'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#667EEA'}
        >
          <Eye size={14} aria-hidden="true" />
          <span style={{ fontSize: '11px' }}>{t('billing.viewBtn')}</span>
        </button>
        
        <button
          onClick={() => onDownload(invoice)}
          aria-label={`Download PDF for invoice ${invoice.invoice_number}`}
          title={t('billing.pdfBtn')}
          style={{
            padding: '10px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#218838'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#28a745'}
        >
          <Download size={14} aria-hidden="true" />
          <span style={{ fontSize: '11px' }}>{t('billing.pdfBtn')}</span>
        </button>
        
        <button
          onClick={() => onDelete(invoice.id)}
          aria-label={`Delete invoice ${invoice.invoice_number}`}
          title={t('billing.deleteBtn')}
          style={{
            padding: '10px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#c82333'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#dc3545'}
        >
          <Trash2 size={14} aria-hidden="true" />
          <span style={{ fontSize: '11px' }}>{t('billing.deleteBtn')}</span>
        </button>
      </div>
    </article>
  );
}