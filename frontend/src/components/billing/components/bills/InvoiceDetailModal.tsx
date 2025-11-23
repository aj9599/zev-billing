import { useEffect, useRef } from 'react';
import { ExternalLink, X } from 'lucide-react';
import type { Invoice } from '../../../types';
import { useTranslation } from '../../../i18n';
import { formatDate, getStatusColor } from '../../utils/billingUtils';

interface InvoiceDetailModalProps {
  invoice: Invoice;
  onClose: () => void;
  onOpenPDF: (invoice: Invoice) => void;
}

/**
 * Invoice Detail Modal
 * Displays full invoice details with line items
 * Features:
 * - ESC key to close
 * - Focus trap
 * - Keyboard navigation
 * - Accessible ARIA labels
 */
export default function InvoiceDetailModal({
  invoice,
  onClose,
  onOpenPDF
}: InvoiceDetailModalProps) {
  const { t } = useTranslation();
  const statusColors = getStatusColor(invoice.status);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // ESC key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Focus management - focus modal on mount
  useEffect(() => {
    if (modalRef.current) {
      modalRef.current.focus();
    }
  }, []);

  // Trap focus within modal
  useEffect(() => {
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const modal = modalRef.current;
      if (!modal) return;

      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener('keydown', handleTab);
    return () => window.removeEventListener('keydown', handleTab);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invoice-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '15px'
      }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="modal-content"
        tabIndex={-1}
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '40px',
          width: '90%',
          maxWidth: '800px',
          maxHeight: '90vh',
          overflow: 'auto',
          outline: 'none'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Close invoice details"
          title="Close (ESC)"
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <X size={24} aria-hidden="true" />
        </button>

        {/* Header */}
        <div style={{
          borderBottom: '2px solid #007bff',
          paddingBottom: '20px',
          marginBottom: '30px'
        }}>
          <h2 id="invoice-modal-title" style={{
            fontSize: '28px',
            fontWeight: 'bold',
            marginBottom: '8px'
          }}>
            {t('billing.invoice')}
          </h2>
          <p style={{ fontSize: '14px', color: '#666' }}>
            #{invoice.invoice_number}
          </p>
          <span
            role="status"
            aria-label={`Invoice status: ${invoice.status}`}
            style={{
              display: 'inline-block',
              padding: '6px 16px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: '600',
              marginTop: '10px',
              backgroundColor: statusColors.bg,
              color: statusColors.color
            }}
          >
            {invoice.status.toUpperCase()}
          </span>
        </div>

        {/* Bill To */}
        {invoice.user && (
          <div style={{ marginBottom: '30px' }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '600',
              marginBottom: '12px'
            }}>
              {t('billing.billTo')}
            </h3>
            <address style={{ fontSize: '15px', lineHeight: '1.6', fontStyle: 'normal' }}>
              {invoice.user.first_name} {invoice.user.last_name}
              {!invoice.user.is_active && (
                <span style={{
                  color: '#999',
                  fontSize: '13px',
                  marginLeft: '8px'
                }}>
                  ({t('billing.archived')})
                </span>
              )}
              <br />
              {invoice.user.address_street}<br />
              {invoice.user.address_zip} {invoice.user.address_city}<br />
              {invoice.user.email}
            </address>
          </div>
        )}

        {/* Period */}
        <div style={{ marginBottom: '30px' }}>
          <p style={{ fontSize: '14px', color: '#666' }}>
            <strong>{t('billing.periodLabel')}</strong>{' '}
            {formatDate(invoice.period_start)} {t('pricing.to')}{' '}
            {formatDate(invoice.period_end)}
          </p>
        </div>

        {/* Line Items */}
        <div style={{ overflowX: 'auto' }}>
          <table
            role="table"
            aria-label="Invoice line items"
            style={{
              width: '100%',
              marginBottom: '30px',
              minWidth: '400px'
            }}
          >
            <thead>
              <tr style={{
                backgroundColor: '#f9f9f9',
                borderBottom: '2px solid #ddd'
              }}>
                <th scope="col" style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontWeight: '600'
                }}>
                  {t('billing.description')}
                </th>
                <th scope="col" style={{
                  padding: '12px',
                  textAlign: 'right',
                  fontWeight: '600'
                }}>
                  {t('billing.amount')}
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.items?.map(item => {
                const isHeader = item.item_type === 'meter_info' || item.item_type === 'charging_header';
                const isInfo = item.item_type === 'meter_reading_from' ||
                  item.item_type === 'meter_reading_to' ||
                  item.item_type === 'total_consumption' ||
                  item.item_type === 'charging_session_from' ||
                  item.item_type === 'charging_session_to' ||
                  item.item_type === 'total_charged';
                const isSeparator = item.item_type === 'separator';
                const isSolar = item.item_type === 'solar_power';
                const isNormal = item.item_type === 'normal_power';
                const isChargingNormal = item.item_type === 'car_charging_normal';
                const isChargingPriority = item.item_type === 'car_charging_priority';

                if (isSeparator) {
                  return (
                    <tr key={item.id}>
                      <td colSpan={2} style={{ padding: '8px' }}></td>
                    </tr>
                  );
                }

                let backgroundColor = 'transparent';
                if (isSolar) backgroundColor = '#fffbea';
                else if (isNormal) backgroundColor = '#f0f4ff';
                else if (isChargingNormal || isChargingPriority) backgroundColor = '#f0fff4';

                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: '1px solid #eee',
                      backgroundColor
                    }}
                  >
                    <td style={{
                      padding: '12px',
                      fontWeight: isHeader || isSolar || isNormal || isChargingNormal || isChargingPriority ? '600' : 'normal',
                      color: isInfo ? '#666' : 'inherit',
                      fontSize: isInfo ? '14px' : '15px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      {isSolar && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="4" />
                          <path d="M12 2v2" />
                          <path d="M12 20v2" />
                          <path d="m4.93 4.93 1.41 1.41" />
                          <path d="m17.66 17.66 1.41 1.41" />
                          <path d="M2 12h2" />
                          <path d="M20 12h2" />
                          <path d="m6.34 17.66-1.41 1.41" />
                          <path d="m19.07 4.93-1.41 1.41" />
                        </svg>
                      )}
                      {isNormal && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                        </svg>
                      )}
                      {(isChargingNormal || isChargingPriority) && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                          <circle cx="7" cy="17" r="2" />
                          <path d="M9 17h6" />
                          <circle cx="17" cy="17" r="2" />
                        </svg>
                      )}
                      {item.description}
                    </td>
                    <td style={{
                      padding: '12px',
                      textAlign: 'right',
                      fontWeight: item.total_price > 0 ? '600' : 'normal'
                    }}>
                      {item.total_price > 0 ? `${invoice.currency} ${item.total_price.toFixed(2)}` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Total */}
        <div style={{
          textAlign: 'right',
          padding: '20px',
          backgroundColor: '#f9f9f9',
          borderRadius: '8px'
        }}>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {t('billing.total')} {invoice.currency} {invoice.total_amount.toFixed(2)}
          </p>
        </div>

        {/* Buttons */}
        <div className="button-group" style={{
          display: 'flex',
          gap: '12px',
          marginTop: '30px'
        }}>
          <button
            onClick={() => onOpenPDF(invoice)}
            aria-label="Open invoice PDF in new tab"
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#218838'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#28a745'}
          >
            <ExternalLink size={18} aria-hidden="true" />
            {t('billing.openPdf')}
          </button>
          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0056b3'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#007bff'}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}