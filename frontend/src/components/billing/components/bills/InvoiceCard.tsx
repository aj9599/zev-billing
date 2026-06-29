import { useState } from 'react';
import { Eye, Download, Trash2, CheckCircle2, Circle } from 'lucide-react';
import type { Invoice, User } from '../../../../types';
import { useTranslation } from '../../../../i18n';
import { formatDate, getStatusColor, paymentBadge } from '../../utils/billingUtils';
import { api } from '../../../../api/client';
import { notify } from '../../../../utils/toast';

interface InvoiceCardProps {
  invoice: Invoice;
  user: User | undefined;
  onView: (id: number) => void;
  onDownload: (invoice: Invoice) => void;
  onDelete: (id: number) => void;
}

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

  const [paymentStatus, setPaymentStatus] = useState(invoice.payment_status || 'unpaid');
  const [savingPayment, setSavingPayment] = useState(false);
  const pay = paymentBadge(paymentStatus, invoice.period_end);
  const isPaid = paymentStatus === 'paid';

  const togglePayment = async () => {
    const next = isPaid ? 'unpaid' : 'paid';
    setSavingPayment(true);
    const prev = paymentStatus;
    setPaymentStatus(next); // optimistic
    try {
      await api.updateInvoicePayment(invoice.id, next);
      notify.success(next === 'paid' ? t('billing.markedPaid') : t('billing.markedUnpaid'));
    } catch (err: any) {
      setPaymentStatus(prev);
      notify.error(t('billing.paymentUpdateFailed') + (err?.message ? ': ' + err.message : ''));
    } finally {
      setSavingPayment(false);
    }
  };

  return (
    <article
      aria-label={`Invoice ${invoice.invoice_number}`}
      style={{
        backgroundColor: isArchived ? '#f9fafb' : 'white',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '10px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      <div style={{ marginBottom: '12px' }}>
        <div style={{
          fontSize: '12px',
          fontFamily: 'monospace',
          color: '#9ca3af',
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
            <span style={{
              color: '#9ca3af',
              fontSize: '11px',
              marginLeft: '6px'
            }}>
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
          {' – '}
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{
            display: 'inline-block',
            padding: '3px 12px',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: '700',
            backgroundColor: statusColors.bg,
            color: statusColors.color
          }}>
            {invoice.status.toUpperCase()}
          </span>
          <span style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: '700',
            backgroundColor: pay.bg,
            color: pay.color,
            marginLeft: '6px'
          }}>
            {pay.label}
          </span>
        </div>

        <div style={{ fontSize: '12px', color: '#9ca3af' }}>
          {t('billing.generated')}: <time dateTime={invoice.generated_at}>
            {formatDate(invoice.generated_at)}
          </time>
        </div>
      </div>

      <button
        onClick={togglePayment}
        disabled={savingPayment}
        style={{
          width: '100%',
          marginBottom: '8px',
          padding: '9px',
          borderRadius: '8px',
          border: isPaid ? '1px solid rgba(16,185,129,0.3)' : '1px solid #e5e7eb',
          backgroundColor: isPaid ? 'rgba(16,185,129,0.1)' : 'white',
          color: isPaid ? '#059669' : '#6b7280',
          fontSize: '12px',
          fontWeight: 600,
          cursor: savingPayment ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px'
        }}
      >
        {isPaid ? <CheckCircle2 size={14} /> : <Circle size={14} />}
        {isPaid ? t('billing.markUnpaid') : t('billing.markPaid')}
      </button>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '8px',
        borderTop: '1px solid #f3f4f6',
        paddingTop: '12px'
      }}>
        <button
          onClick={() => onView(invoice.id)}
          title={t('billing.viewBtn')}
          style={{
            padding: '10px',
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            transition: 'all 0.2s',
            boxShadow: '0 1px 4px rgba(102,126,234,0.3)'
          }}
        >
          <Eye size={13} />
          <span>{t('billing.viewBtn')}</span>
        </button>

        <button
          onClick={() => onDownload(invoice)}
          title={t('billing.pdfBtn')}
          style={{
            padding: '10px',
            backgroundColor: 'rgba(16,185,129,0.1)',
            color: '#059669',
            border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            transition: 'all 0.2s'
          }}
        >
          <Download size={13} />
          <span>{t('billing.pdfBtn')}</span>
        </button>

        <button
          onClick={() => onDelete(invoice.id)}
          title={t('billing.deleteBtn')}
          style={{
            padding: '10px',
            backgroundColor: 'rgba(239,68,68,0.08)',
            color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.15)',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            transition: 'all 0.2s'
          }}
        >
          <Trash2 size={13} />
          <span>{t('billing.deleteBtn')}</span>
        </button>
      </div>
    </article>
  );
}
