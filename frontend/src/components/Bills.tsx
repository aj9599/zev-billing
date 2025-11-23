import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { Invoice, Building as BuildingType, User } from '../types';
import { useInvoiceOperations } from './billing/hooks/useInvoiceOperations';
import BuildingGroup from './billing/components/bills/BuildingGroup';
import InvoiceDetailModal from './billing/components/bills/InvoiceDetailModal';
import { TableSkeleton } from './billing/components/common/LoadingSkeleton';
import { useTranslation } from '../i18n';

interface BillsProps {
  selectedBuildingId: number | null;
  buildings: BuildingType[];
  users: User[];
  onRefresh: () => void;
}

/**
 * Bills component - displays and manages invoices
 * Features:
 * - Building-based organization
 * - Year grouping
 * - Archive support
 * - Loading skeletons for better UX
 * - Responsive design
 */
export default function Bills({
  selectedBuildingId,
  buildings,
  users,
  onRefresh
}: BillsProps) {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const {
    selectedInvoice,
    viewInvoice,
    deleteInvoice,
    downloadPDF,
    closeModal
  } = useInvoiceOperations(onRefresh);

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
  }, []);

  // Save expanded years to localStorage when they change
  useEffect(() => {
    if (expandedYears.size > 0) {
      localStorage.setItem('zev_expanded_years', JSON.stringify(Array.from(expandedYears)));
    }
  }, [expandedYears]);

  const loadInvoices = async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    const currentExpandedYears = new Set(expandedYears);
    await deleteInvoice(id);
    await loadInvoices();
    setExpandedYears(currentExpandedYears);
  };

  // Show loading skeleton while data is being fetched
  if (loading) {
    return <TableSkeleton />;
  }

  // Filter invoices based on selected building
  const filteredInvoices = selectedBuildingId
    ? invoices.filter(inv => inv.building_id === selectedBuildingId)
    : invoices;

  // Organize invoices by building
  const organizedInvoices = buildings.map(building => {
    const buildingInvoices = filteredInvoices.filter(
      inv => inv.building_id === building.id
    );
    return {
      building,
      invoices: buildingInvoices,
      totalCount: buildingInvoices.length
    };
  }).filter(group => group.totalCount > 0);

  return (
    <>
      {organizedInvoices.length === 0 ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            padding: '60px 20px',
            textAlign: 'center',
            color: '#999'
          }}
        >
          {t('billing.noInvoices')}
        </div>
      ) : (
        <div role="region" aria-label="Invoice list">
          {organizedInvoices.map(({ building, invoices: buildingInvoices }) => (
            <BuildingGroup
              key={building.id}
              building={building}
              invoices={buildingInvoices}
              users={users}
              onView={viewInvoice}
              onDownload={downloadPDF}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          onClose={closeModal}
          onOpenPDF={downloadPDF}
        />
      )}
    </>
  );
}