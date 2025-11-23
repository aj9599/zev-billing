import { useState } from 'react';
import { Archive, ChevronDown, ChevronRight } from 'lucide-react';
import type { Building, Invoice, User } from '../../../../types';
import { useTranslation } from '../../../../i18n';
import { organizeInvoicesByYear, organizeInvoicesByUser } from '../../utils/billingUtils';
import InvoiceTable from './InvoiceTable';
import InvoiceCard from './InvoiceCard';
import YearGroup from './YearGroup';

interface BuildingGroupProps {
    building: Building;
    invoices: Invoice[];
    users: User[];
    onView: (id: number) => void;
    onDownload: (invoice: Invoice) => void;
    onDelete: (id: number) => void;
}

export default function BuildingGroup({
    building,
    invoices,
    users,
    onView,
    onDownload,
    onDelete
}: BuildingGroupProps) {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(true);
    const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());

    // Separate active and archived invoices
    const activeInvoices = invoices.filter(inv => {
        const user = users.find(u => u.id === inv.user_id);
        return user?.is_active;
    });

    const archivedInvoices = invoices.filter(inv => {
        const user = users.find(u => u.id === inv.user_id);
        return !user?.is_active;
    });

    // Organize active invoices by year
    const invoicesByYear = organizeInvoicesByYear(activeInvoices);

    // Organize archived invoices by user
    const archivedByUser = organizeInvoicesByUser(archivedInvoices, users);

    const toggleYear = (year: string) => {
        const newExpanded = new Set(expandedYears);
        if (newExpanded.has(year)) {
            newExpanded.delete(year);
        } else {
            newExpanded.add(year);
        }
        setExpandedYears(newExpanded);
    };

    if (invoices.length === 0) return null;

    return (
        <div style={{ marginBottom: '24px' }}>
            {/* Building Header */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    backgroundColor: '#f8f9fa',
                    padding: '16px 20px',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '2px solid #e9ecef'
                }}
            >
                <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>
                        {building.name}
                    </h2>
                    <p style={{ fontSize: '14px', color: '#666', margin: '4px 0 0 0' }}>
                        {invoices.length} {invoices.length === 1 ? t('billing.invoices') : t('billing.invoicesPlural')}
                    </p>
                </div>
                <span style={{ fontSize: '24px', color: '#666' }}>
                    {isExpanded ? (
                        <ChevronDown size={24} color="#666" />
                    ) : (
                        <ChevronRight size={24} color="#666" />
                    )}
                </span>
            </div>

            {/* Building Content */}
            {isExpanded && (
                <div style={{ paddingLeft: '20px' }}>
                    {/* Archived Section */}
                    {Object.keys(archivedByUser).length > 0 && (
                        <div style={{ marginBottom: '20px' }}>
                            <div
                                onClick={() => toggleYear('archive-' + building.id)}
                                style={{
                                    backgroundColor: '#fff3cd',
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    marginBottom: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    border: '1px solid #ffc107'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Archive size={18} color="#856404" />
                                    <h3 style={{
                                        fontSize: '16px',
                                        fontWeight: '600',
                                        margin: 0,
                                        color: '#856404'
                                    }}>
                                        {t('billing.archiveSection')}
                                    </h3>
                                </div>
                                <span style={{ fontSize: '18px', color: '#856404' }}>
                                    {expandedYears.has('archive-' + building.id) ? 'â–¼' : 'â–¶'}
                                </span>
                            </div>

                            {expandedYears.has('archive-' + building.id) && (
                                <div style={{ paddingLeft: '20px' }}>
                                    {Object.entries(archivedByUser).map(([userName, userInvoices]) => (
                                        <div key={userName} style={{ marginBottom: '16px' }}>
                                            <h4 style={{
                                                fontSize: '14px',
                                                fontWeight: '600',
                                                marginBottom: '8px',
                                                color: '#666'
                                            }}>
                                                {userName} ({userInvoices.length}{' '}
                                                {userInvoices.length === 1 ? t('billing.invoice') : t('billing.invoices')})
                                            </h4>
                                            <div className="desktop-table">
                                                <InvoiceTable
                                                    invoices={userInvoices}
                                                    users={users}
                                                    onView={onView}
                                                    onDownload={onDownload}
                                                    onDelete={onDelete}
                                                />
                                            </div>
                                            <div className="mobile-cards">
                                                {userInvoices.map(invoice => (
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
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Year Groups */}
                    {Object.entries(invoicesByYear)
                        .sort(([a], [b]) => parseInt(b) - parseInt(a))
                        .map(([year, yearInvoices]) => (
                            <YearGroup
                                key={year}
                                year={year}
                                buildingId={building.id}
                                invoices={yearInvoices}
                                users={users}
                                isExpanded={expandedYears.has(year + '-' + building.id)}
                                onToggle={() => toggleYear(year + '-' + building.id)}
                                onView={onView}
                                onDownload={onDownload}
                                onDelete={onDelete}
                            />
                        ))}
                </div>
            )}

            <style>{`
        @media (min-width: 769px) {
          .mobile-cards {
            display: none;
          }
        }

        @media (max-width: 768px) {
          .desktop-table {
            display: none;
          }
        }
      `}</style>
        </div>
    );
}