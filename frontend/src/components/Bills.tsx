import { useState, useEffect } from 'react';
import { Eye, Download, Trash2, Archive, ExternalLink } from 'lucide-react';
import { api } from '../api/client';
import type { Invoice, Building as BuildingType, User } from '../types';
import { useTranslation } from '../i18n';

interface BillsProps {
    selectedBuildingId: number | null;
    buildings: BuildingType[];
    users: User[];
    onRefresh: () => void;
}

export default function Bills({ selectedBuildingId, buildings, users, onRefresh }: BillsProps) {
    const { t } = useTranslation();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [expandedBuildings, setExpandedBuildings] = useState<Set<number>>(new Set());
    const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());

    useEffect(() => {
        loadInvoices();

        // Load expanded years from localStorage
        const savedExpandedYears = localStorage.getItem('zev_expanded_years');
        if (savedExpandedYears) {
            try {
                setExpandedYears(new Set(JSON.parse(savedExpandedYears)));
            } catch (e) {
                console.error('Failed to parse expanded years:', e);
            }
        }

        // Expand all buildings by default
        const buildingIds = new Set(buildings.map(b => b.id));
        setExpandedBuildings(buildingIds);
    }, [buildings]);

    // Save expanded years to localStorage when they change
    useEffect(() => {
        if (expandedYears.size > 0) {
            localStorage.setItem('zev_expanded_years', JSON.stringify(Array.from(expandedYears)));
        }
    }, [expandedYears]);

    const loadInvoices = async () => {
        try {
            const data = await api.getInvoices();
            setInvoices(data);

            // Keep existing expanded years and add current year
            setExpandedYears(prev => {
                const newExpanded = new Set(prev);
                const currentYear = new Date().getFullYear().toString();
                newExpanded.add(currentYear);
                return newExpanded;
            });
        } catch (err) {
            console.error('Failed to load invoices:', err);
        }
    };

    const viewInvoice = async (id: number) => {
        try {
            const invoice = await api.getInvoice(id);
            console.log('Loaded invoice:', invoice);

            if (!invoice.items || invoice.items.length === 0) {
                console.warn('Invoice loaded but has no items');
            }

            setSelectedInvoice(invoice);
        } catch (err) {
            console.error('Failed to load invoice:', err);
            alert(t('billing.loadFailed'));
        }
    };

    const deleteInvoice = async (id: number) => {
        if (!confirm(t('billing.deleteConfirm'))) return;

        try {
            const currentExpandedBuildings = new Set(expandedBuildings);
            const currentExpandedYears = new Set(expandedYears);

            await api.deleteInvoice(id);
            await loadInvoices();
            onRefresh();

            setExpandedBuildings(currentExpandedBuildings);
            setExpandedYears(currentExpandedYears);

            alert(t('billing.deleteSuccess'));
        } catch (err) {
            alert(t('billing.deleteFailed') + ' ' + err);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'issued':
                return { bg: '#d4edda', color: '#155724' };
            case 'pending':
                return { bg: '#fff3cd', color: '#856404' };
            case 'paid':
                return { bg: '#d1ecf1', color: '#0c5460' };
            case 'draft':
                return { bg: '#f8d7da', color: '#721c24' };
            case 'archived':
                return { bg: '#e2e3e5', color: '#383d41' };
            default:
                return { bg: '#e2e3e5', color: '#383d41' };
        }
    };

    const downloadPDF = (invoice: Invoice) => {
        // Open PDF in new tab using backend endpoint
        const pdfUrl = api.downloadInvoicePDF(invoice.id);
        window.open(pdfUrl, '_blank');
    };

    const openPDFInNewTab = (invoice: Invoice) => {
        // Same as download but explicitly labeled
        downloadPDF(invoice);
    };

    const toggleBuildingExpand = (id: number) => {
        const newExpanded = new Set(expandedBuildings);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedBuildings(newExpanded);
    };

    const toggleYearExpand = (year: string) => {
        const newExpanded = new Set(expandedYears);
        if (newExpanded.has(year)) {
            newExpanded.delete(year);
        } else {
            newExpanded.add(year);
        }
        setExpandedYears(newExpanded);
    };

    const formatDate = (dateStr: string | Date) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('de-CH');
    };

    const filteredInvoices = selectedBuildingId
        ? invoices.filter(inv => inv.building_id === selectedBuildingId)
        : invoices;

    const organizedInvoices = buildings.map(building => {
        const buildingInvoices = filteredInvoices.filter(inv => inv.building_id === building.id);

        const activeInvoices = buildingInvoices.filter(inv => {
            const user = users.find(u => u.id === inv.user_id);
            return user?.is_active;
        });

        const archivedInvoices = buildingInvoices.filter(inv => {
            const user = users.find(u => u.id === inv.user_id);
            return !user?.is_active;
        });

        const invoicesByYear = activeInvoices.reduce((acc, inv) => {
            const year = new Date(inv.period_start).getFullYear().toString();
            if (!acc[year]) acc[year] = [];
            acc[year].push(inv);
            return acc;
        }, {} as Record<string, Invoice[]>);

        const archivedByUser = archivedInvoices.reduce((acc, inv) => {
            const user = users.find(u => u.id === inv.user_id);
            const userName = user ? `${user.first_name} ${user.last_name}` : 'Unknown User';
            if (!acc[userName]) acc[userName] = [];
            acc[userName].push(inv);
            return acc;
        }, {} as Record<string, Invoice[]>);

        return {
            building,
            invoicesByYear,
            archivedByUser,
            totalCount: buildingInvoices.length
        };
    }).filter(group => group.totalCount > 0);

    const renderInvoiceCard = (invoice: Invoice) => {
        const user = users.find(u => u.id === invoice.user_id);
        const statusColors = getStatusColor(invoice.status);
        const isArchived = !user?.is_active;

        return (
            <div key={invoice.id} style={{
                backgroundColor: isArchived ? '#f8f9fa' : 'white',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '12px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', fontFamily: 'monospace', color: '#6b7280', marginBottom: '4px' }}>
                        {invoice.invoice_number}
                    </div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
                        {user ? `${user.first_name} ${user.last_name}` : '-'}
                        {isArchived && <span style={{ color: '#999', fontSize: '12px', marginLeft: '8px' }}>({t('billing.archived')})</span>}
                    </h3>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
                        {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', marginBottom: '8px' }}>
                        {invoice.currency} {invoice.total_amount.toFixed(2)}
                    </div>
                    <span style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '600',
                        backgroundColor: statusColors.bg,
                        color: statusColors.color,
                        marginBottom: '8px'
                    }}>
                        {invoice.status.toUpperCase()}
                    </span>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                        {t('billing.generated')}: {formatDate(invoice.generated_at)}
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', borderTop: '1px solid #f3f4f6', paddingTop: '12px' }}>
                    <button
                        onClick={() => viewInvoice(invoice.id)}
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
                            gap: '4px'
                        }}
                    >
                        <Eye size={14} />
                        <span style={{ fontSize: '11px' }}>{t('billing.viewBtn')}</span>
                    </button>
                    <button
                        onClick={() => downloadPDF(invoice)}
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
                            gap: '4px'
                        }}
                    >
                        <Download size={14} />
                        <span style={{ fontSize: '11px' }}>{t('billing.pdfBtn')}</span>
                    </button>
                    <button
                        onClick={() => deleteInvoice(invoice.id)}
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
                            gap: '4px'
                        }}
                    >
                        <Trash2 size={14} />
                        <span style={{ fontSize: '11px' }}>{t('billing.deleteBtn')}</span>
                    </button>
                </div>
            </div>
        );
    };

    const renderInvoiceRow = (invoice: Invoice) => {
        const user = users.find(u => u.id === invoice.user_id);
        const statusColors = getStatusColor(invoice.status);
        const isArchived = !user?.is_active;

        return (
            <tr key={invoice.id} style={{ borderBottom: '1px solid #eee', backgroundColor: isArchived ? '#f8f9fa' : 'white' }}>
                <td style={{ padding: '16px', fontFamily: 'monospace', fontSize: '13px' }}>{invoice.invoice_number}</td>
                <td style={{ padding: '16px' }}>
                    {user ? `${user.first_name} ${user.last_name}` : '-'}
                    {isArchived && <span style={{ color: '#999', fontSize: '12px', marginLeft: '8px' }}>({t('billing.archived')})</span>}
                </td>
                <td style={{ padding: '16px' }}>{formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}</td>
                <td style={{ padding: '16px', fontWeight: '600' }}>{invoice.currency} {invoice.total_amount.toFixed(2)}</td>
                <td style={{ padding: '16px' }}>
                    <span style={{
                        padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600',
                        backgroundColor: statusColors.bg,
                        color: statusColors.color
                    }}>
                        {invoice.status.toUpperCase()}
                    </span>
                </td>
                <td style={{ padding: '16px', fontSize: '13px', color: '#666' }}>
                    {formatDate(invoice.generated_at)}
                </td>
                <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => viewInvoice(invoice.id)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }} title={t('billing.view')}>
                            <Eye size={16} color="#667EEA" />
                        </button>
                        <button onClick={() => downloadPDF(invoice)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }} title={t('billing.downloadPdf')}>
                            <Download size={16} color="#28a745" />
                        </button>
                        <button onClick={() => deleteInvoice(invoice.id)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }} title={t('common.delete')}>
                            <Trash2 size={16} color="#dc3545" />
                        </button>
                    </div>
                </td>
            </tr>
        );
    };

    return (
        <>
            {organizedInvoices.length === 0 ? (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', padding: '60px 20px', textAlign: 'center', color: '#999' }}>
                    {t('billing.noInvoices')}
                </div>
            ) : (
                organizedInvoices.map(({ building, invoicesByYear, archivedByUser, totalCount }) => (
                    <div key={building.id} style={{ marginBottom: '24px' }}>
                        <div
                            onClick={() => toggleBuildingExpand(building.id)}
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
                                    {totalCount} {totalCount === 1 ? t('billing.invoices') : t('billing.invoicesPlural')}
                                </p>
                            </div>
                            <span style={{ fontSize: '24px', color: '#666' }}>
                                {expandedBuildings.has(building.id) ? '▼' : '▶'}
                            </span>
                        </div>

                        {expandedBuildings.has(building.id) && (
                            <div style={{ paddingLeft: '20px' }}>
                                {Object.keys(archivedByUser).length > 0 && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <div
                                            onClick={() => toggleYearExpand('archive-' + building.id)}
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
                                                <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: '#856404' }}>
                                                    {t('billing.archiveSection')}
                                                </h3>
                                            </div>
                                            <span style={{ fontSize: '18px', color: '#856404' }}>
                                                {expandedYears.has('archive-' + building.id) ? '▼' : '▶'}
                                            </span>
                                        </div>

                                        {expandedYears.has('archive-' + building.id) && (
                                            <div style={{ paddingLeft: '20px' }}>
                                                {Object.entries(archivedByUser).map(([userName, userInvoices]) => (
                                                    <div key={userName} style={{ marginBottom: '16px' }}>
                                                        <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#666' }}>
                                                            {userName} ({userInvoices.length} {userInvoices.length === 1 ? t('billing.invoice') : t('billing.invoices')})
                                                        </h4>
                                                        <div className="desktop-table" style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden', width: '100%' }}>
                                                            <table style={{ width: '100%' }}>
                                                                <thead>
                                                                    <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                                                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>{t('billing.invoiceNumber')}</th>
                                                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>{t('billing.period')}</th>
                                                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>{t('billing.amount')}</th>
                                                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>{t('common.status')}</th>
                                                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>{t('billing.generated')}</th>
                                                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>{t('common.actions')}</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {userInvoices.map(renderInvoiceRow)}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                        <div className="mobile-cards">
                                                            {userInvoices.map(renderInvoiceCard)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {Object.entries(invoicesByYear)
                                    .sort(([a], [b]) => parseInt(b) - parseInt(a))
                                    .map(([year, yearInvoices]) => (
                                        <div key={year} style={{ marginBottom: '20px' }}>
                                            <div
                                                onClick={() => toggleYearExpand(year + '-' + building.id)}
                                                style={{
                                                    backgroundColor: '#e7f3ff',
                                                    padding: '12px 16px',
                                                    borderRadius: '8px',
                                                    marginBottom: '8px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    border: '1px solid #3b82f6'
                                                }}
                                            >
                                                <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: '#1f2937' }}>
                                                    {year} ({yearInvoices.length} {yearInvoices.length === 1 ? t('billing.invoice') : t('billing.invoices')})
                                                </h3>
                                                <span style={{ fontSize: '18px', color: '#666' }}>
                                                    {expandedYears.has(year + '-' + building.id) ? '▼' : '▶'}
                                                </span>
                                            </div>

                                            {expandedYears.has(year + '-' + building.id) && (
                                                <>
                                                    <div className="desktop-table" style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden', width: '100%' }}>
                                                        <table style={{ width: '100%' }}>
                                                            <thead>
                                                                <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                                                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>{t('billing.invoiceNumber')}</th>
                                                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>{t('billing.user')}</th>
                                                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>{t('billing.period')}</th>
                                                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>{t('billing.amount')}</th>
                                                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>{t('common.status')}</th>
                                                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>{t('billing.generated')}</th>
                                                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>{t('common.actions')}</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {yearInvoices.map(renderInvoiceRow)}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    <div className="mobile-cards">
                                                        {yearInvoices.map(renderInvoiceCard)}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>
                ))
            )}

            {/* Invoice Detail Modal - Shows preview and link to PDF */}
            {selectedInvoice && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                    padding: '15px'
                }} onClick={() => setSelectedInvoice(null)}>
                    <div className="modal-content" style={{
                        backgroundColor: 'white', borderRadius: '12px', padding: '40px',
                        width: '90%', maxWidth: '800px', maxHeight: '90vh', overflow: 'auto'
                    }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ borderBottom: '2px solid #007bff', paddingBottom: '20px', marginBottom: '30px' }}>
                            <h2 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>{t('billing.invoice')}</h2>
                            <p style={{ fontSize: '14px', color: '#666' }}>#{selectedInvoice.invoice_number}</p>
                            <span style={{
                                display: 'inline-block',
                                padding: '6px 16px',
                                borderRadius: '20px',
                                fontSize: '13px',
                                fontWeight: '600',
                                marginTop: '10px',
                                ...getStatusColor(selectedInvoice.status)
                            }}>
                                {selectedInvoice.status.toUpperCase()}
                            </span>
                        </div>

                        {selectedInvoice.user && (
                            <div style={{ marginBottom: '30px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>{t('billing.billTo')}</h3>
                                <p style={{ fontSize: '15px', lineHeight: '1.6' }}>
                                    {selectedInvoice.user.first_name} {selectedInvoice.user.last_name}
                                    {!selectedInvoice.user.is_active && <span style={{ color: '#999', fontSize: '13px', marginLeft: '8px' }}>({t('billing.archived')})</span>}
                                    <br />
                                    {selectedInvoice.user.address_street}<br />
                                    {selectedInvoice.user.address_zip} {selectedInvoice.user.address_city}<br />
                                    {selectedInvoice.user.email}
                                </p>
                            </div>
                        )}

                        <div style={{ marginBottom: '30px' }}>
                            <p style={{ fontSize: '14px', color: '#666' }}>
                                <strong>{t('billing.periodLabel')}</strong> {formatDate(selectedInvoice.period_start)} {t('pricing.to')} {formatDate(selectedInvoice.period_end)}
                            </p>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', marginBottom: '30px', minWidth: '400px' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #ddd' }}>
                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>{t('billing.description')}</th>
                                        <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>{t('billing.amount')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedInvoice.items?.map(item => {
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
                                            return <tr key={item.id}><td colSpan={2} style={{ padding: '8px' }}></td></tr>;
                                        }

                                        let backgroundColor = 'transparent';
                                        if (isSolar) backgroundColor = '#fffbea';
                                        else if (isNormal) backgroundColor = '#f0f4ff';
                                        else if (isChargingNormal || isChargingPriority) backgroundColor = '#f0fff4';

                                        return (
                                            <tr key={item.id} style={{
                                                borderBottom: '1px solid #eee',
                                                backgroundColor
                                            }}>
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
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                                                        </svg>
                                                    )}
                                                    {(isChargingNormal || isChargingPriority) && (
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                                                            <circle cx="7" cy="17" r="2" />
                                                            <path d="M9 17h6" />
                                                            <circle cx="17" cy="17" r="2" />
                                                        </svg>
                                                    )}
                                                    {item.description}
                                                </td>
                                                <td style={{ padding: '12px', textAlign: 'right', fontWeight: item.total_price > 0 ? '600' : 'normal' }}>
                                                    {item.total_price > 0 ? `${selectedInvoice.currency} ${item.total_price.toFixed(2)}` : ''}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ textAlign: 'right', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                            <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                                {t('billing.total')} {selectedInvoice.currency} {selectedInvoice.total_amount.toFixed(2)}
                            </p>
                        </div>

                        <div className="button-group" style={{ display: 'flex', gap: '12px', marginTop: '30px' }}>
                            <button onClick={() => openPDFInNewTab(selectedInvoice)} style={{
                                flex: 1, padding: '12px', backgroundColor: '#28a745', color: 'white',
                                border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                            }}>
                                <ExternalLink size={18} />
                                {t('billing.openPdf')}
                            </button>
                            <button onClick={() => setSelectedInvoice(null)} style={{
                                flex: 1, padding: '12px', backgroundColor: '#007bff', color: 'white',
                                border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                            }}>
                                {t('common.close')}
                            </button>
                        </div>
                    </div>
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
        </>
    );
}