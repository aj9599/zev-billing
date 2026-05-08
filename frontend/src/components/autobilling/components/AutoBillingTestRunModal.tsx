import { CheckCircle, AlertTriangle, FileText, Mail, X, Loader2, FlaskConical, ExternalLink } from 'lucide-react';
import { useTranslation } from '../../../i18n';

export interface TestRunResult {
  config_id: number;
  config_name: string;
  period_start: string;
  period_end: string;
  invoices_generated: number;
  pdfs_generated: number;
  emails_sent: number;
  emails_failed: number;
  email_requested: boolean;
  smtp_configured: boolean;
  first_invoice_id: number;
  invoice_ids: number[];
  warnings: string[] | null;
}

interface Props {
  isOpen: boolean;
  running: boolean;
  result: TestRunResult | null;
  error: string;
  onClose: () => void;
}

export default function AutoBillingTestRunModal({ isOpen, running, result, error, onClose }: Props) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const overallSuccess = !error && result && result.invoices_generated > 0 && result.emails_failed === 0;
  const partialSuccess = !error && result && (result.invoices_generated > 0 || (result.warnings && result.warnings.length > 0));

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: '20px', backdropFilter: 'blur(2px)'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: '14px',
          width: '100%', maxWidth: '520px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          animation: 'ab-modal-in 0.2s ease-out'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px',
          borderBottom: '1px solid #f3f4f6',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FlaskConical size={20} color="#ea580c" />
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#9a3412' }}>
              {t('autoBilling.testRunTitle')}
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={running}
            style={{
              border: 'none', background: 'transparent',
              cursor: running ? 'not-allowed' : 'pointer',
              color: '#9a3412', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '4px', borderRadius: '6px',
              opacity: running ? 0.4 : 1
            }}
            title={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px' }}>
          {running && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px 0' }}>
              <Loader2 size={32} color="#ea580c" style={{ animation: 'ab-spin 1s linear infinite' }} />
              <div style={{ fontSize: '14px', color: '#374151', fontWeight: '600' }}>
                {t('autoBilling.testRunInProgress')}
              </div>
              <div style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', maxWidth: '380px' }}>
                {t('autoBilling.testRunInProgressHint')}
              </div>
            </div>
          )}

          {!running && error && (
            <div style={{
              padding: '14px 16px',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              display: 'flex', alignItems: 'flex-start', gap: '10px'
            }}>
              <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: '1px' }} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#b91c1c', marginBottom: '4px' }}>
                  {t('autoBilling.testRunFailed')}
                </div>
                <div style={{ fontSize: '12px', color: '#7f1d1d', wordBreak: 'break-word' }}>
                  {error}
                </div>
              </div>
            </div>
          )}

          {!running && !error && result && (
            <>
              {/* Overall status banner */}
              <div style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: overallSuccess
                  ? 'rgba(16, 185, 129, 0.1)'
                  : partialSuccess
                    ? 'rgba(245, 158, 11, 0.1)'
                    : 'rgba(239, 68, 68, 0.08)',
                border: `1px solid ${overallSuccess ? 'rgba(16, 185, 129, 0.3)' : partialSuccess ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.25)'}`,
                marginBottom: '16px',
                display: 'flex', alignItems: 'center', gap: '10px'
              }}>
                {overallSuccess ? (
                  <CheckCircle size={18} color="#059669" style={{ flexShrink: 0 }} />
                ) : (
                  <AlertTriangle size={18} color={partialSuccess ? '#d97706' : '#dc2626'} style={{ flexShrink: 0 }} />
                )}
                <div style={{
                  fontSize: '13px', fontWeight: '700',
                  color: overallSuccess ? '#065f46' : partialSuccess ? '#92400e' : '#b91c1c'
                }}>
                  {overallSuccess
                    ? t('autoBilling.testRunSuccess')
                    : partialSuccess
                      ? t('autoBilling.testRunPartial')
                      : t('autoBilling.testRunNoBills')}
                </div>
              </div>

              {/* Period summary */}
              <div style={{ marginBottom: '14px', fontSize: '12px', color: '#6b7280' }}>
                <strong style={{ color: '#374151' }}>{result.config_name}</strong>
                {' · '}
                {t('autoBilling.testRunPeriod')}: {result.period_start} → {result.period_end}
              </div>

              {/* Result rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                <ResultRow
                  icon={<FileText size={15} color="#667eea" />}
                  label={t('autoBilling.testRunBillsGenerated')}
                  value={`${result.invoices_generated}`}
                />
                <ResultRow
                  icon={<FileText size={15} color="#667eea" />}
                  label={t('autoBilling.testRunPdfsGenerated')}
                  value={`${result.pdfs_generated}`}
                />
                {result.email_requested && (
                  <>
                    <ResultRow
                      icon={<Mail size={15} color="#10b981" />}
                      label={t('autoBilling.testRunEmailsSent')}
                      value={`${result.emails_sent}`}
                      success={result.emails_sent > 0 && result.emails_failed === 0}
                    />
                    {result.emails_failed > 0 && (
                      <ResultRow
                        icon={<Mail size={15} color="#dc2626" />}
                        label={t('autoBilling.testRunEmailsFailed')}
                        value={`${result.emails_failed}`}
                        warning
                      />
                    )}
                  </>
                )}
                {!result.email_requested && (
                  <div style={{
                    fontSize: '11px', color: '#9ca3af', fontStyle: 'italic',
                    padding: '6px 0', borderTop: '1px dashed #e5e7eb'
                  }}>
                    {t('autoBilling.testRunEmailDisabled')}
                  </div>
                )}
              </div>

              {/* Warnings list */}
              {result.warnings && result.warnings.length > 0 && (
                <div style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'rgba(245, 158, 11, 0.06)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  marginBottom: '16px'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#92400e', marginBottom: '6px' }}>
                    {t('autoBilling.testRunWarnings')}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11px', color: '#78350f', lineHeight: '1.5' }}>
                    {result.warnings.map((w, i) => (
                      <li key={i} style={{ wordBreak: 'break-word' }}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action buttons */}
              {result.first_invoice_id > 0 && (
                <a
                  href={`/api/billing/invoices/${result.first_invoice_id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    padding: '10px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white', borderRadius: '8px',
                    textDecoration: 'none', fontSize: '13px', fontWeight: '700',
                    boxShadow: '0 2px 8px rgba(102, 126, 234, 0.35)'
                  }}
                >
                  <ExternalLink size={14} />
                  {t('autoBilling.testRunOpenPDF')}
                </a>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!running && (
          <div style={{
            padding: '14px 22px',
            borderTop: '1px solid #f3f4f6',
            display: 'flex', justifyContent: 'flex-end', gap: '8px'
          }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 18px',
                background: '#f3f4f6', color: '#374151',
                border: 'none', borderRadius: '8px',
                fontSize: '13px', fontWeight: '600', cursor: 'pointer'
              }}
            >
              {t('common.close')}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes ab-modal-in {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function ResultRow({ icon, label, value, success, warning }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  success?: boolean;
  warning?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
      padding: '10px 12px',
      background: '#f9fafb',
      borderRadius: '8px',
      border: '1px solid #f3f4f6'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {icon}
        <span style={{ fontSize: '13px', color: '#374151', fontWeight: '500' }}>{label}</span>
      </div>
      <span style={{
        fontSize: '14px', fontWeight: '700',
        color: success ? '#059669' : warning ? '#dc2626' : '#1f2937'
      }}>
        {value}
      </span>
    </div>
  );
}
