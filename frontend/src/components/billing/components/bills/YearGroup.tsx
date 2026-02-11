import { Calendar, ChevronDown, ChevronRight } from 'lucide-react';
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
        <div style={{ marginBottom: '14px' }}>
            <div
                onClick={onToggle}
                style={{
                    backgroundColor: '#667eea08',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    marginBottom: isExpanded ? '10px' : '0',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid #667eea20',
                    transition: 'all 0.2s'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={16} color="#667eea" />
                    <h3 style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        margin: 0,
                        color: '#1f2937'
                    }}>
                        {year}
                    </h3>
                    <span style={{
                        backgroundColor: '#667eea15',
                        color: '#667eea',
                        padding: '1px 8px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: '700'
                    }}>
                        {invoices.length}
                    </span>
                </div>
                <div style={{ color: '#667eea' }}>
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </div>
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
