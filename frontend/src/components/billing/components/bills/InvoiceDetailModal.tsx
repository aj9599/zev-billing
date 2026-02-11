import { useEffect, useRef } from 'react';
import { ExternalLink, X, Zap, Sun, Car } from 'lucide-react';
import type { Invoice } from '../../../../types';
import { useTranslation } from '../../../../i18n';
import { formatDate, getStatusColor } from '../../utils/billingUtils';

interface InvoiceDetailModalProps {
  invoice: Invoice;
  onClose: () => void;
  onOpenPDF: (invoice: Invoice) => void;
}

export default function InvoiceDetailModal({
  invoice,
  onClose,
  onOpenPDF
}: InvoiceDetailModalProps) {
  const { t } = useTranslation();
  const statusColors = getStatusColor(invoice.status);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    if (modalRef.current) modalRef.current.focus();
  }, []);

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
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.15)',
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
        tabIndex={-1}
        style={{
          backgroundColor: 'white',
          borderRadius: '20px',
          width: '90%',
          maxWidth: '800px',
          maxHeight: '90vh',
          outline: 'none',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          animation: 'bl-slideUp 0.3s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '24px 28px 18px',
          borderBottom: '1px solid #f3f4f6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexShrink: 0
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <h2 id="invoice-modal-title" style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: '#1f2937' }}>
                {t('billing.invoice')}
              </h2>
              <span style={{
                padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '700',
                backgroundColor: statusColors.bg, color: statusColors.color
              }}>
                {invoice.status.toUpperCase()}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>
              #{invoice.invoice_number}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '36px', height: '36px', borderRadius: '10px', border: 'none',
              backgroundColor: '#f3f4f6', color: '#6b7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding: '20px 28px',
          overflowY: 'auto',
          flex: 1,
          backgroundColor: '#f9fafb'
        }}>
          {/* Bill To + Period */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: invoice.user ? '1fr 1fr' : '1fr',
            gap: '14px',
            marginBottom: '18px'
          }}>
            {invoice.user && (
              <div style={{
                backgroundColor: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #e5e7eb'
              }}>
                <h3 style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  {t('billing.billTo')}
                </h3>
                <address style={{ fontSize: '14px', lineHeight: '1.6', fontStyle: 'normal', color: '#1f2937' }}>
                  <strong>{invoice.user.first_name} {invoice.user.last_name}</strong>
                  {!invoice.user.is_active && (
                    <span style={{ color: '#9ca3af', fontSize: '11px', marginLeft: '6px' }}>
                      ({t('billing.archived')})
                    </span>
                  )}
                  <br />
                  {invoice.user.address_street}<br />
                  {invoice.user.address_zip} {invoice.user.address_city}<br />
                  <span style={{ color: '#6b7280' }}>{invoice.user.email}</span>
                </address>
              </div>
            )}
            <div style={{
              backgroundColor: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                {t('billing.periodLabel')}
              </h3>
              <p style={{ fontSize: '14px', color: '#1f2937', margin: 0 }}>
                {formatDate(invoice.period_start)} {t('pricing.to')} {formatDate(invoice.period_end)}
              </p>
            </div>
          </div>

          {/* Line Items */}
          <div style={{
            backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{
                    padding: '12px 16px', textAlign: 'left', fontWeight: '600',
                    fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px'
                  }}>
                    {t('billing.description')}
                  </th>
                  <th style={{
                    padding: '12px 16px', textAlign: 'right', fontWeight: '600',
                    fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px'
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
                        <td colSpan={2} style={{ padding: '4px', borderTop: '1px solid #f3f4f6' }}></td>
                      </tr>
                    );
                  }

                  let backgroundColor = 'transparent';
                  if (isSolar) backgroundColor = '#fefce815';
                  else if (isNormal) backgroundColor = '#eff6ff15';
                  else if (isChargingNormal || isChargingPriority) backgroundColor = '#f0fdf415';

                  return (
                    <tr
                      key={item.id}
                      style={{ borderTop: '1px solid #f3f4f6', backgroundColor }}
                    >
                      <td style={{
                        padding: '12px 16px',
                        fontWeight: isHeader || isSolar || isNormal || isChargingNormal || isChargingPriority ? '600' : 'normal',
                        color: isInfo ? '#9ca3af' : '#1f2937',
                        fontSize: isInfo ? '13px' : '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        {isSolar && <Sun size={14} color="#f59e0b" />}
                        {isNormal && <Zap size={14} color="#3b82f6" />}
                        {(isChargingNormal || isChargingPriority) && <Car size={14} color="#10b981" />}
                        {item.description}
                      </td>
                      <td style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontWeight: item.total_price > 0 ? '700' : 'normal',
                        color: item.total_price > 0 ? '#1f2937' : '#9ca3af',
                        fontSize: '14px'
                      }}>
                        {item.total_price > 0 ? `${invoice.currency} ${item.total_price.toFixed(2)}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Total */}
            <div style={{
              textAlign: 'right',
              padding: '16px 20px',
              background: 'linear-gradient(135deg, #667eea08, #764ba208)',
              borderTop: '2px solid #667eea20'
            }}>
              <p style={{ fontSize: '20px', fontWeight: '800', margin: 0, color: '#1f2937' }}>
                {t('billing.total')} {invoice.currency} {invoice.total_amount.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 28px 20px',
          borderTop: '1px solid #f3f4f6',
          display: 'flex',
          gap: '12px',
          flexShrink: 0
        }}>
          <button
            onClick={() => onOpenPDF(invoice)}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: 'rgba(16,185,129,0.1)',
              color: '#059669',
              border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s'
            }}
          >
            <ExternalLink size={16} />
            {t('billing.openPdf')}
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.15s',
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.35)'
            }}
          >
            {t('common.close')}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes bl-slideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
