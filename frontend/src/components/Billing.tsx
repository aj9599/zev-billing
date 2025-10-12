import { useState, useEffect } from 'react';
import { Plus, Eye, FileText, Download, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { Invoice, Building, User } from '../types';
import { useTranslation } from '../i18n';

export default function Billing() {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [formData, setFormData] = useState({
    building_ids: [] as number[],
    user_ids: [] as number[],
    start_date: '',
    end_date: ''
  });
  const [generating, setGenerating] = useState(false);
  const [expandedBuildings, setExpandedBuildings] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [invoicesData, buildingsData, usersData] = await Promise.all([
      api.getInvoices(),
      api.getBuildings(),
      api.getUsers()
    ]);
    setInvoices(invoicesData);
    setBuildings(buildingsData);
    setUsers(usersData);
    
    // Expand all buildings by default
    const buildingIds = new Set(buildingsData.map(b => b.id));
    setExpandedBuildings(buildingIds);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.building_ids.length === 0) {
      alert(t('billing.selectAtLeastOne'));
      return;
    }
    
    setGenerating(true);
    try {
      await api.generateBills(formData);
      setShowGenerateModal(false);
      resetForm();
      loadData();
      alert(t('billing.generatedSuccess'));
    } catch (err) {
      alert(t('billing.generateFailed') + ' ' + err);
    } finally {
      setGenerating(false);
    }
  };

  const viewInvoice = async (id: number) => {
    const invoice = await api.getInvoice(id);
    setSelectedInvoice(invoice);
  };

  const deleteInvoice = async (id: number) => {
    if (!confirm(t('billing.deleteConfirm'))) return;
    
    try {
      await api.deleteInvoice(id);
      loadData();
      alert(t('billing.deleteSuccess'));
    } catch (err) {
      alert(t('billing.deleteFailed') + ' ' + err);
    }
  };

  const downloadPDF = (invoice: Invoice) => {
    const user = users.find(u => u.id === invoice.user_id);
    const building = buildings.find(b => b.id === invoice.building_id);
    
    // Create a printable invoice HTML
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${t('billing.invoice')} ${invoice.invoice_number}</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            padding: 40px; 
            max-width: 800px; 
            margin: 0 auto;
          }
          .header { 
            border-bottom: 3px solid #007bff; 
            padding-bottom: 20px; 
            margin-bottom: 30px;
          }
          .header h1 { 
            margin: 0; 
            font-size: 32px; 
            color: #007bff;
          }
          .invoice-number { 
            color: #666; 
            font-size: 14px; 
            margin-top: 5px;
          }
          .info-section { 
            margin-bottom: 30px;
          }
          .info-section h3 { 
            font-size: 14px; 
            text-transform: uppercase; 
            color: #666; 
            margin-bottom: 10px;
          }
          .info-section p { 
            margin: 5px 0; 
            line-height: 1.6;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 30px 0;
          }
          th { 
            background-color: #f9f9f9; 
            padding: 12px; 
            text-align: left; 
            border-bottom: 2px solid #ddd;
            font-weight: 600;
          }
          td { 
            padding: 12px; 
            border-bottom: 1px solid #eee;
          }
          .text-right { 
            text-align: right;
          }
          .item-header { 
            font-weight: 600;
            background-color: #f5f5f5;
          }
          .item-info { 
            color: #666;
            font-size: 14px;
          }
          .item-cost { 
            font-weight: 500;
          }
          .total-section { 
            background-color: #f9f9f9; 
            padding: 20px; 
            text-align: right; 
            margin-top: 30px;
            border-radius: 8px;
          }
          .total-section p { 
            font-size: 24px; 
            font-weight: bold; 
            margin: 0;
          }
          @media print {
            body { padding: 20px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${t('billing.invoice')}</h1>
          <div class="invoice-number">#${invoice.invoice_number}</div>
        </div>

        <div class="info-section">
          <h3>${t('billing.billTo')}</h3>
          <p>
            <strong>${user?.first_name} ${user?.last_name}</strong><br>
            ${user?.address_street || ''}<br>
            ${user?.address_zip || ''} ${user?.address_city || ''}<br>
            ${user?.email || ''}
          </p>
        </div>

        <div class="info-section">
          <h3>${t('billing.invoiceDetails')}</h3>
          <p>
            <strong>${t('users.building')}:</strong> ${building?.name || 'N/A'}<br>
            <strong>${t('billing.periodLabel')}</strong> ${formatDate(invoice.period_start)} ${t('pricing.to')} ${formatDate(invoice.period_end)}<br>
            <strong>${t('billing.generatedLabel')}</strong> ${formatDate(invoice.generated_at)}<br>
            <strong>${t('billing.statusLabel')}</strong> ${invoice.status}
          </p>
        </div>

        <table>
          <thead>
            <tr>
              <th>${t('billing.description')}</th>
              <th class="text-right">${t('billing.amount')}</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.items?.map(item => {
              if (item.item_type === 'meter_info' || item.item_type === 'charging_header') {
                return `<tr class="item-header"><td colspan="2">${item.description}</td></tr>`;
              } else if (item.item_type === 'meter_reading_from' || item.item_type === 'meter_reading_to' || item.item_type === 'total_consumption') {
                return `<tr class="item-info"><td colspan="2">${item.description}</td></tr>`;
              } else if (item.item_type === 'separator') {
                return `<tr><td colspan="2" style="padding: 5px;"></td></tr>`;
              } else {
                return `<tr class="item-cost">
                  <td>${item.description}</td>
                  <td class="text-right">${invoice.currency} ${item.total_price.toFixed(2)}</td>
                </tr>`;
              }
            }).join('')}
          </tbody>
        </table>

        <div class="total-section">
          <p>${t('billing.total')} ${invoice.currency} ${invoice.total_amount.toFixed(2)}</p>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    
    printWindow.document.close();
  };

  const resetForm = () => {
    setFormData({
      building_ids: [],
      user_ids: [],
      start_date: '',
      end_date: ''
    });
  };

  const toggleBuilding = (id: number) => {
    if (formData.building_ids.includes(id)) {
      setFormData({ ...formData, building_ids: formData.building_ids.filter(bid => bid !== id) });
    } else {
      setFormData({ ...formData, building_ids: [...formData.building_ids, id] });
    }
  };

  const toggleUser = (id: number) => {
    if (formData.user_ids.includes(id)) {
      setFormData({ ...formData, user_ids: formData.user_ids.filter(uid => uid !== id) });
    } else {
      setFormData({ ...formData, user_ids: [...formData.user_ids, id] });
    }
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

  const formatDate = (dateStr: string | Date) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-CH');
  };

  // Group invoices by building
  const invoicesByBuilding = buildings.map(building => ({
    building,
    invoices: invoices.filter(inv => inv.building_id === building.id)
  })).filter(group => group.invoices.length > 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 style={{ 
            fontSize: '36px', 
            fontWeight: '800', 
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            <FileText size={36} style={{ color: '#667eea' }} />
            {t('billing.title')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            {t('billing.subtitle')}
          </p>
        </div>
        <button
          onClick={() => setShowGenerateModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
            backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
          }}
        >
          <Plus size={18} />
          {t('billing.generateBills')}
        </button>
      </div>

      {invoicesByBuilding.length === 0 ? (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', padding: '60px', textAlign: 'center', color: '#999' }}>
          {t('billing.noInvoices')}
        </div>
      ) : (
        invoicesByBuilding.map(({ building, invoices: buildingInvoices }) => (
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
                  {buildingInvoices.length} {buildingInvoices.length === 1 ? t('billing.invoices') : t('billing.invoicesPlural')}
                </p>
              </div>
              <span style={{ fontSize: '24px', color: '#666' }}>
                {expandedBuildings.has(building.id) ? '▼' : '▶'}
              </span>
            </div>

            {expandedBuildings.has(building.id) && (
              <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                <table style={{ width: '100%' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                      <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('billing.invoiceNumber')}</th>
                      <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('billing.user')}</th>
                      <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('billing.period')}</th>
                      <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('billing.amount')}</th>
                      <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('common.status')}</th>
                      <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('billing.generated')}</th>
                      <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildingInvoices.map(invoice => {
                      const user = users.find(u => u.id === invoice.user_id);
                      return (
                        <tr key={invoice.id} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '16px', fontFamily: 'monospace', fontSize: '13px' }}>{invoice.invoice_number}</td>
                          <td style={{ padding: '16px' }}>{user ? `${user.first_name} ${user.last_name}` : '-'}</td>
                          <td style={{ padding: '16px' }}>{formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}</td>
                          <td style={{ padding: '16px', fontWeight: '600' }}>{invoice.currency} {invoice.total_amount.toFixed(2)}</td>
                          <td style={{ padding: '16px' }}>
                            <span style={{
                              padding: '4px 12px', borderRadius: '12px', fontSize: '12px',
                              backgroundColor: '#fff3cd', color: '#856404'
                            }}>
                              {invoice.status}
                            </span>
                          </td>
                          <td style={{ padding: '16px', fontSize: '13px', color: '#666' }}>
                            {formatDate(invoice.generated_at)}
                          </td>
                          <td style={{ padding: '16px' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => viewInvoice(invoice.id)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }} title={t('billing.view')}>
                                <Eye size={16} color="#007bff" />
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
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}

      {showGenerateModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '12px', padding: '30px',
            width: '90%', maxWidth: '700px', maxHeight: '90vh', overflow: 'auto'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
              {t('billing.generateBills')}
            </h2>

            <form onSubmit={handleGenerate}>
              <div>
                <label style={{ display: 'block', marginBottom: '12px', fontWeight: '600', fontSize: '15px' }}>
                  {t('billing.selectBuildings')} * ({t('billing.atLeastOne')})
                </label>
                <div style={{ padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '8px', maxHeight: '200px', overflow: 'auto' }}>
                  {buildings.map(b => (
                    <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.building_ids.includes(b.id)}
                        onChange={() => toggleBuilding(b.id)}
                      />
                      <span>{b.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '20px' }}>
                <label style={{ display: 'block', marginBottom: '12px', fontWeight: '600', fontSize: '15px' }}>
                  {t('billing.selectUsers')} ({t('billing.leaveEmptyForAll')})
                </label>
                <div style={{ padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '8px', maxHeight: '200px', overflow: 'auto' }}>
                  {users.filter(u => formData.building_ids.includes(u.building_id || 0)).map(u => (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.user_ids.includes(u.id)}
                        onChange={() => toggleUser(u.id)}
                      />
                      <span>{u.first_name} {u.last_name} ({u.email})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('billing.startDate')} *</label>
                  <input type="date" required value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>{t('billing.endDate')} *</label>
                  <input type="date" required value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="submit" disabled={generating} style={{
                  flex: 1, padding: '12px', backgroundColor: '#28a745', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', opacity: generating ? 0.7 : 1, cursor: generating ? 'not-allowed' : 'pointer'
                }}>
                  {generating ? t('billing.generating') : t('billing.generateBills')}
                </button>
                <button type="button" onClick={() => { setShowGenerateModal(false); resetForm(); }} style={{
                  flex: 1, padding: '12px', backgroundColor: '#6c757d', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                }}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedInvoice && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={() => setSelectedInvoice(null)}>
          <div style={{
            backgroundColor: 'white', borderRadius: '12px', padding: '40px',
            width: '90%', maxWidth: '800px', maxHeight: '90vh', overflow: 'auto'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ borderBottom: '2px solid #007bff', paddingBottom: '20px', marginBottom: '30px' }}>
              <h2 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>{t('billing.invoice')}</h2>
              <p style={{ fontSize: '14px', color: '#666' }}>#{selectedInvoice.invoice_number}</p>
            </div>

            {selectedInvoice.user && (
              <div style={{ marginBottom: '30px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>{t('billing.billTo')}</h3>
                <p style={{ fontSize: '15px', lineHeight: '1.6' }}>
                  {selectedInvoice.user.first_name} {selectedInvoice.user.last_name}<br />
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

            <table style={{ width: '100%', marginBottom: '30px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>{t('billing.description')}</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>{t('billing.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {selectedInvoice.items?.map(item => {
                  const isHeader = item.item_type === 'meter_info' || item.item_type === 'charging_header';
                  const isInfo = item.item_type === 'meter_reading_from' || item.item_type === 'meter_reading_to' || item.item_type === 'total_consumption';
                  const isSeparator = item.item_type === 'separator';
                  
                  if (isSeparator) {
                    return <tr key={item.id}><td colSpan={2} style={{ padding: '8px' }}></td></tr>;
                  }
                  
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ 
                        padding: '12px',
                        fontWeight: isHeader ? '600' : 'normal',
                        color: isInfo ? '#666' : 'inherit',
                        fontSize: isInfo ? '14px' : '15px'
                      }}>
                        {item.description}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: item.total_price > 0 ? '500' : 'normal' }}>
                        {item.total_price > 0 ? `${selectedInvoice.currency} ${item.total_price.toFixed(2)}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ textAlign: 'right', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {t('billing.total')} {selectedInvoice.currency} {selectedInvoice.total_amount.toFixed(2)}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '30px' }}>
              <button onClick={() => downloadPDF(selectedInvoice)} style={{
                flex: 1, padding: '12px', backgroundColor: '#28a745', color: 'white',
                border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}>
                <Download size={18} />
                {t('billing.downloadPdf')}
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
    </div>
  );
}