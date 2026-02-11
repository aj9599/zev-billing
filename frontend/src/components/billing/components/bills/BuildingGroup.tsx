import { useState } from 'react';
import { Archive, Building as BuildingIcon, ChevronDown, ChevronRight } from 'lucide-react';
import type { Building, Invoice, User } from '../../../../types';
import { useTranslation } from '../../../../i18n';
import { organizeInvoicesByYear, organizeInvoicesByUser } from '../../utils/billingUtils';
import InvoiceTable from './InvoiceTable';
import InvoiceCard from './InvoiceCard';
import YearGroup from './YearGroup';

const STORAGE_KEY = 'zev_building_expanded_years';

const loadExpandedYears = (): Set<string> => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            return new Set(JSON.parse(saved));
        }
    } catch (e) {
        console.error('Failed to load expanded years:', e);
    }
    return new Set();
};

const saveExpandedYears = (years: Set<string>) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(years)));
    } catch (e) {
        console.error('Failed to save expanded years:', e);
    }
};

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
    const [expandedYears, setExpandedYears] = useState<Set<string>>(() => loadExpandedYears());

    const activeInvoices = invoices.filter(inv => {
        const user = users.find(u => u.id === inv.user_id);
        return user?.is_active;
    });

    const archivedInvoices = invoices.filter(inv => {
        const user = users.find(u => u.id === inv.user_id);
        return !user?.is_active;
    });

    const invoicesByYear = organizeInvoicesByYear(activeInvoices);
    const archivedByUser = organizeInvoicesByUser(archivedInvoices, users);

    const toggleYear = (year: string) => {
        const newExpanded = new Set(expandedYears);
        if (newExpanded.has(year)) {
            newExpanded.delete(year);
        } else {
            newExpanded.add(year);
        }
        setExpandedYears(newExpanded);
        saveExpandedYears(newExpanded);
    };

    if (invoices.length === 0) return null;

    return (
        <div style={{ marginBottom: '20px', animation: 'bl-fadeSlideIn 0.4s ease-out both' }}>
            {/* Building Header */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    backgroundColor: 'white',
                    padding: '16px 20px',
                    borderRadius: isExpanded ? '14px 14px 0 0' : '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid #e5e7eb',
                    borderBottom: isExpanded ? '1px solid #f3f4f6' : '1px solid #e5e7eb',
                    transition: 'all 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '10px',
                        backgroundColor: '#667eea15',
                        color: '#667eea',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                        <BuildingIcon size={18} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: '#1f2937' }}>
                            {building.name}
                        </h2>
                        <p style={{ fontSize: '13px', color: '#9ca3af', margin: '2px 0 0 0' }}>
                            {invoices.length} {invoices.length === 1 ? t('billing.invoice') : t('billing.invoicesPlural')}
                        </p>
                    </div>
                </div>
                <div style={{ color: '#9ca3af', transition: 'transform 0.2s' }}>
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>
            </div>

            {/* Building Content */}
            {isExpanded && (
                <div style={{
                    backgroundColor: 'white',
                    borderRadius: '0 0 14px 14px',
                    border: '1px solid #e5e7eb',
                    borderTop: 'none',
                    padding: '16px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                }}>
                    {/* Archived Section */}
                    {Object.keys(archivedByUser).length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                            <div
                                onClick={() => toggleYear('archive-' + building.id)}
                                style={{
                                    backgroundColor: '#fef3c715',
                                    padding: '10px 14px',
                                    borderRadius: '10px',
                                    marginBottom: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    border: '1px solid #f59e0b30'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Archive size={16} color="#d97706" />
                                    <h3 style={{
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        margin: 0,
                                        color: '#92400e'
                                    }}>
                                        {t('billing.archiveSection')}
                                    </h3>
                                </div>
                                <div style={{ color: '#d97706' }}>
                                    {expandedYears.has('archive-' + building.id) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                </div>
                            </div>

                            {expandedYears.has('archive-' + building.id) && (
                                <div style={{ paddingLeft: '12px' }}>
                                    {Object.entries(archivedByUser).map(([userName, userInvoices]) => (
                                        <div key={userName} style={{ marginBottom: '14px' }}>
                                            <h4 style={{
                                                fontSize: '13px',
                                                fontWeight: '600',
                                                marginBottom: '8px',
                                                color: '#6b7280'
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
