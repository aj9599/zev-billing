import { useState } from 'react';
import { api } from '../../api/client';
import type { Invoice } from '../../types';
import { useTranslation } from '../../i18n';

export function useInvoiceOperations(onRefresh: () => void) {
  const { t } = useTranslation();
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);

  const viewInvoice = async (id: number) => {
    try {
      setLoading(true);
      const invoice = await api.getInvoice(id);
      
      if (!invoice.items || invoice.items.length === 0) {
        console.warn('Invoice loaded but has no items');
      }
      
      setSelectedInvoice(invoice);
    } catch (err) {
      console.error('Failed to load invoice:', err);
      alert(t('billing.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const deleteInvoice = async (id: number) => {
    if (!confirm(t('billing.deleteConfirm'))) return;
    
    try {
      setLoading(true);
      await api.deleteInvoice(id);
      onRefresh();
      alert(t('billing.deleteSuccess'));
    } catch (err) {
      console.error('Failed to delete invoice:', err);
      alert(t('billing.deleteFailed') + ' ' + err);
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async (invoice: Invoice) => {
    try {
      const pdfUrl = await api.downloadInvoicePDF(invoice.id);
      window.open(pdfUrl, '_blank');
    } catch (err) {
      console.error('Failed to download PDF:', err);
      alert('Failed to download PDF');
    }
  };

  const closeModal = () => setSelectedInvoice(null);

  return {
    selectedInvoice,
    loading,
    viewInvoice,
    deleteInvoice,
    downloadPDF,
    closeModal
  };
}