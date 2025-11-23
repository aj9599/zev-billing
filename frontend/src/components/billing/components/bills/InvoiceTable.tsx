import { Eye, Download, Trash2 } from 'lucide-react';
import type { Invoice, User } from '../../../types';
import { useTranslation } from '../../../i18n';
import { formatDate, getStatusColor } from '../../utils/billingUtils';

interface InvoiceTableProps {
  invoices: Invoice[];
  users: User[];
  onView: (id: number) => void;
  onDownload: (invoice: Invoice) => void;
  onDelete: (id: number) => void;
}

/**
 * Invoice Table Component
 * Displays invoices in a table format for desktop view
 * Fully accessible with ARIA labels and keyboard navigation
 */
export default function InvoiceTable({
  invoices,
  users,
  onView,
  onDownload,
  onDelete
}: InvoiceTableProps) {
  const { t } = useTranslation();

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      width: '100%'
    }}>
      <table
        role="table"
        aria-label="Invoice list table"
        style={{ width: '100%', borderCollapse: 'collapse' }}
      >
        <thead>
          <tr style={{
            backgroundColor: '#f9f9f9',
            borderBottom: '2px solid #eee'
          }}>
            <th scope="col" style={{
              padding: '12px',
              textAlign: 'left',
              fontWeight: '600',
              fontSize: '14px'
            }}>
              {t('billing.invoiceNumber')}
            </th>
            <th scope="col" style={{
              padding: '12px',
              textAlign: 'left',
              fontWeight: '600',
              fontSize: '14px'
            }}>
              {t('billing.user')}
            </th>
            <th scope="col" style={{
              padding: '12px',
              textAlign: 'left',
              fontWeight: '600',
              fontSize: '14px'
            }}>
              {t('billing.period')}
            </th>
            <th scope="col" style={{
              padding: '12px',
              textAlign: 'left',
              fontWeight: '600',
              fontSize: '14px'
            }}>
              {t('billing.amount')}
            </th>
            <th scope="col" style={{
              padding: '12px',
              textAlign: 'left',
              fontWeight: '600',
              fontSize: '14px'
            }}>
              {t('common.status')}
            </th>
            <th scope="col" style={{
              padding: '12px',
              textAlign: 'left',
              fontWeight: '600',
              fontSize: '14px'
            }}>
              {t('billing.generated')}
            </th>
            <th scope="col" style={{
              padding: '12px',
              textAlign: 'left',
              fontWeight: '600',
              fontSize: '14px'
            }}>
              {t('common.actions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {invoices.map(invoice => {
            const user = users.find(u => u.id === invoice.user_id);
            const statusColors = getStatusColor(invoice.status);
            const isArchived = !user?.is_active;
            const userName = user ? `${user.first_name} ${user.last_name}` : '-';

            return (
              <tr
                key={invoice.id}
                style={{
                  borderBottom: '1px solid #eee',
                  backgroundColor: isArchived ? '#f8f9fa' : 'white'
                }}
              >
                <td style={{
                  padding: '16px',
                  fontFamily: 'monospace',
                  fontSize: '13px'
                }}>
                  {invoice.invoice_number}
                </td>
                <td style={{ padding: '16px' }}>
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
                </td>
                <td style={{ padding: '16px' }}>
                  <time dateTime={invoice.period_start}>
                    {formatDate(invoice.period_start)}
                  </time>
                  {' - '}
                  <time dateTime={invoice.period_end}>
                    {formatDate(invoice.period_end)}
                  </time>
                </td>
                <td style={{ padding: '16px', fontWeight: '600' }}>
                  {invoice.currency} {invoice.total_amount.toFixed(2)}
                </td>
                <td style={{ padding: '16px' }}>
                  <span
                    role="status"
                    aria-label={`Status: ${invoice.status}`}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      backgroundColor: statusColors.bg,
                      color: statusColors.color
                    }}
                  >
                    {invoice.status.toUpperCase()}
                  </span>
                </td>
                <td style={{
                  padding: '16px',
                  fontSize: '13px',
                  color: '#666'
                }}>
                  <time dateTime={invoice.generated_at}>
                    {formatDate(invoice.generated_at)}
                  </time>
                </td>
                <td style={{ padding: '16px' }}>
                  <div
                    role="group"
                    aria-label={`Actions for invoice ${invoice.invoice_number}`}
                    style={{ display: 'flex', gap: '8px' }}
                  >
                    <button
                      onClick={() => onView(invoice.id)}
                      aria-label={`View details for invoice ${invoice.invoice_number}`}
                      title={t('billing.view')}
                      style={{
                        padding: '6px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <Eye size={16} color="#667EEA" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => onDownload(invoice)}
                      aria-label={`Download PDF for invoice ${invoice.invoice_number}`}
                      title={t('billing.downloadPdf')}
                      style={{
                        padding: '6px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <Download size={16} color="#28a745" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => onDelete(invoice.id)}
                      aria-label={`Delete invoice ${invoice.invoice_number}`}
                      title={t('common.delete')}
                      style={{
                        padding: '6px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <Trash2 size={16} color="#dc3545" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}