import { Eye, Download, Trash2 } from 'lucide-react';
import type { Invoice, User } from '../../../../types';
import { useTranslation } from '../../../../i18n';
import { formatDate, getStatusColor } from '../../utils/billingUtils';

interface InvoiceTableProps {
  invoices: Invoice[];
  users: User[];
  onView: (id: number) => void;
  onDownload: (invoice: Invoice) => void;
  onDelete: (id: number) => void;
}

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
      border: '1px solid #e5e7eb',
      overflow: 'hidden',
      width: '100%',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
    }}>
      <table
        role="table"
        aria-label="Invoice list table"
        style={{ width: '100%', borderCollapse: 'collapse' }}
      >
        <thead>
          <tr style={{ backgroundColor: '#f9fafb' }}>
            <th scope="col" style={{
              padding: '12px 16px', textAlign: 'left', fontWeight: '600',
              fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px'
            }}>
              {t('billing.invoiceNumber')}
            </th>
            <th scope="col" style={{
              padding: '12px 16px', textAlign: 'left', fontWeight: '600',
              fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px'
            }}>
              {t('billing.user')}
            </th>
            <th scope="col" style={{
              padding: '12px 16px', textAlign: 'left', fontWeight: '600',
              fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px'
            }}>
              {t('billing.period')}
            </th>
            <th scope="col" style={{
              padding: '12px 16px', textAlign: 'left', fontWeight: '600',
              fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px'
            }}>
              {t('billing.amount')}
            </th>
            <th scope="col" style={{
              padding: '12px 16px', textAlign: 'left', fontWeight: '600',
              fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px'
            }}>
              {t('common.status')}
            </th>
            <th scope="col" style={{
              padding: '12px 16px', textAlign: 'left', fontWeight: '600',
              fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px'
            }}>
              {t('billing.generated')}
            </th>
            <th scope="col" style={{
              padding: '12px 16px', textAlign: 'right', fontWeight: '600',
              fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px'
            }}>
              {t('common.actions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice, idx) => {
            const user = users.find(u => u.id === invoice.user_id);
            const statusColors = getStatusColor(invoice.status);
            const isArchived = !user?.is_active;
            const userName = user ? `${user.first_name} ${user.last_name}` : '-';

            return (
              <tr
                key={invoice.id}
                style={{
                  borderTop: idx > 0 ? '1px solid #f3f4f6' : 'none',
                  backgroundColor: isArchived ? '#f9fafb' : 'white',
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={(e) => { if (!isArchived) e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isArchived ? '#f9fafb' : 'white'; }}
              >
                <td style={{
                  padding: '14px 16px',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  color: '#6b7280'
                }}>
                  {invoice.invoice_number}
                </td>
                <td style={{ padding: '14px 16px', fontWeight: '500', color: '#1f2937' }}>
                  {userName}
                  {isArchived && (
                    <span style={{
                      color: '#9ca3af',
                      fontSize: '11px',
                      marginLeft: '6px'
                    }}>
                      ({t('billing.archived')})
                    </span>
                  )}
                </td>
                <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6b7280' }}>
                  <time dateTime={invoice.period_start}>
                    {formatDate(invoice.period_start)}
                  </time>
                  {' – '}
                  <time dateTime={invoice.period_end}>
                    {formatDate(invoice.period_end)}
                  </time>
                </td>
                <td style={{ padding: '14px 16px', fontWeight: '700', fontSize: '14px', color: '#1f2937' }}>
                  {invoice.currency} {invoice.total_amount.toFixed(2)}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: '700',
                    backgroundColor: statusColors.bg,
                    color: statusColors.color
                  }}>
                    {invoice.status.toUpperCase()}
                  </span>
                </td>
                <td style={{
                  padding: '14px 16px',
                  fontSize: '13px',
                  color: '#9ca3af'
                }}>
                  <time dateTime={invoice.generated_at}>
                    {formatDate(invoice.generated_at)}
                  </time>
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => onView(invoice.id)}
                      title={t('billing.view')}
                      style={{
                        width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                        backgroundColor: 'rgba(102,126,234,0.08)', color: '#667eea',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', transition: 'all 0.15s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(102,126,234,0.15)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(102,126,234,0.08)'; }}
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => onDownload(invoice)}
                      title={t('billing.downloadPdf')}
                      style={{
                        width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                        backgroundColor: 'rgba(16,185,129,0.08)', color: '#10b981',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', transition: 'all 0.15s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(16,185,129,0.15)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(16,185,129,0.08)'; }}
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={() => onDelete(invoice.id)}
                      title={t('common.delete')}
                      style={{
                        width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                        backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', transition: 'all 0.15s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)'; }}
                    >
                      <Trash2 size={14} />
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
