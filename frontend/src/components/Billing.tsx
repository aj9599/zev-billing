import { useState, useEffect } from 'react';
import { Plus, Eye, FileText, Download, Trash2, Building, Search, Sun, Zap, Car, HelpCircle, X } from 'lucide-react';
import { api } from '../api/client';
import type { Invoice, Building as BuildingType, User } from '../types';
import { useTranslation } from '../i18n';

export default function Billing() {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  
  // Persistent sender and banking info
  const [senderInfo, setSenderInfo] = useState({
    name: '',
    address: '',
    city: '',
    zip: '',
    country: 'Switzerland'
  });
  
  const [bankingInfo, setBankingInfo] = useState({
    name: '',
    iban: '',
    holder: ''
  });
  
  const [formData, setFormData] = useState({
    building_ids: [] as number[],
    user_ids: [] as number[],
    start_date: '',
    end_date: '',
    sender_name: '',
    sender_address: '',
    sender_city: '',
    sender_zip: '',
    sender_country: 'Switzerland',
    bank_name: '',
    bank_iban: '',
    bank_account_holder: ''
  });
  const [generating, setGenerating] = useState(false);
  const [expandedBuildings, setExpandedBuildings] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadData();
    
    // Load saved sender/banking info from sessionStorage
    const savedSender = sessionStorage.getItem('zev_sender_info');
    const savedBanking = sessionStorage.getItem('zev_banking_info');
    
    if (savedSender) {
      try {
        const parsed = JSON.parse(savedSender);
        setSenderInfo(parsed);
        setFormData(prev => ({
          ...prev,
          sender_name: parsed.name || '',
          sender_address: parsed.address || '',
          sender_city: parsed.city || '',
          sender_zip: parsed.zip || '',
          sender_country: parsed.country || 'Switzerland'
        }));
      } catch (e) {
        console.error('Failed to parse sender info:', e);
      }
    }
    
    if (savedBanking) {
      try {
        const parsed = JSON.parse(savedBanking);
        setBankingInfo(parsed);
        setFormData(prev => ({
          ...prev,
          bank_name: parsed.name || '',
          bank_iban: parsed.iban || '',
          bank_account_holder: parsed.holder || ''
        }));
      } catch (e) {
        console.error('Failed to parse banking info:', e);
      }
    }
  }, []);

  // Save sender info to sessionStorage when it changes
  useEffect(() => {
    if (senderInfo.name || senderInfo.address) {
      sessionStorage.setItem('zev_sender_info', JSON.stringify(senderInfo));
    }
  }, [senderInfo]);

  // Save banking info to sessionStorage when it changes
  useEffect(() => {
    if (bankingInfo.iban || bankingInfo.holder) {
      sessionStorage.setItem('zev_banking_info', JSON.stringify(bankingInfo));
    }
  }, [bankingInfo]);

  // NEW: Auto-fill sender and banking info when buildings are selected
  useEffect(() => {
    if (formData.building_ids.length > 0) {
      loadAdminInfoForBuildings(formData.building_ids);
    }
  }, [formData.building_ids]);

  const loadAdminInfoForBuildings = async (buildingIds: number[]) => {
    try {
      // Find admin users for the selected buildings
      const buildingIdsParam = buildingIds.join(',');
      const adminUsers = await api.getAdminUsersForBuildings(buildingIdsParam);
      
      if (adminUsers && adminUsers.length > 0) {
        // Use the first admin user found
        const admin = adminUsers[0];
        
        // Only auto-fill if current values are empty
        if (!formData.sender_name && admin.first_name && admin.last_name) {
          const newSenderInfo = {
            name: `${admin.first_name} ${admin.last_name}`,
            address: admin.address_street || '',
            city: admin.address_city || '',
            zip: admin.address_zip || '',
            country: admin.address_country || 'Switzerland'
          };
          
          setSenderInfo(newSenderInfo);
          setFormData(prev => ({
            ...prev,
            sender_name: newSenderInfo.name,
            sender_address: newSenderInfo.address,
            sender_city: newSenderInfo.city,
            sender_zip: newSenderInfo.zip,
            sender_country: newSenderInfo.country
          }));
        }
        
        if (!formData.bank_iban && admin.bank_iban) {
          const newBankingInfo = {
            name: admin.bank_name || '',
            iban: admin.bank_iban || '',
            holder: admin.bank_account_holder || ''
          };
          
          setBankingInfo(newBankingInfo);
          setFormData(prev => ({
            ...prev,
            bank_name: newBankingInfo.name,
            bank_iban: newBankingInfo.iban,
            bank_account_holder: newBankingInfo.holder
          }));
        }
        
        console.log('Auto-filled billing info from admin user:', admin.email);
      }
    } catch (err) {
      console.error('Failed to load admin info:', err);
    }
  };

  const loadData = async () => {
    try {
      const [invoicesData, buildingsData, usersData] = await Promise.all([
        api.getInvoices(),
        api.getBuildings(),
        api.getUsers(undefined, true) // Include inactive users for display
      ]);
      setInvoices(invoicesData);
      setBuildings(buildingsData.filter(b => !b.is_group));
      setUsers(usersData);
      
      const buildingIds = new Set(buildingsData.filter(b => !b.is_group).map(b => b.id));
      setExpandedBuildings(buildingIds);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.building_ids.length === 0) {
      alert(t('billing.selectAtLeastOne'));
      return;
    }
    
    // Save sender and banking info to persistent state
    const newSenderInfo = {
      name: formData.sender_name,
      address: formData.sender_address,
      city: formData.sender_city,
      zip: formData.sender_zip,
      country: formData.sender_country
    };
    
    const newBankingInfo = {
      name: formData.bank_name,
      iban: formData.bank_iban,
      holder: formData.bank_account_holder
    };
    
    setSenderInfo(newSenderInfo);
    setBankingInfo(newBankingInfo);
    
    setGenerating(true);
    try {
      const result = await api.generateBills(formData);
      console.log('Generated invoices:', result);
      setShowGenerateModal(false);
      resetForm();
      setTimeout(() => {
        loadData();
      }, 500);
      alert(t('billing.generatedSuccess') + ` (${result.length} ${t('billing.invoicesPlural')})`);
    } catch (err: any) {
      console.error('Generation error:', err);
      alert(t('billing.generateFailed') + '\n' + (err.message || err));
    } finally {
      setGenerating(false);
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
      await api.deleteInvoice(id);
      loadData();
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

  // IMPROVED: Swiss QR code generation following proper specification
  const generateSwissQRData = (invoice: Invoice, sender: any, banking: any) => {
    const user = invoice.user;
    if (!user || !banking.iban || !banking.holder) return '';

    // Format IBAN (remove spaces and convert to uppercase)
    const iban = banking.iban.replace(/\s/g, '').toUpperCase();
    
    // Format amount with exactly 2 decimal places
    const amount = invoice.total_amount.toFixed(2);
    
    // Split address into street and house number if possible
    const addressParts = (sender.address || '').match(/^(.+?)\s+(\d+.*)$/) || [null, sender.address || '', ''];
    const street = addressParts[1];
    const houseNo = addressParts[2];
    
    // Split user address
    const userAddressParts = (user.address_street || '').match(/^(.+?)\s+(\d+.*)$/) || [null, user.address_street || '', ''];
    const userStreet = userAddressParts[1];
    const userHouseNo = userAddressParts[2];
    
    // Swiss QR code structure (SPC Version 2.0)
    // Each field MUST be separated by CRLF (\r\n)
    const parts = [
      'SPC',                                    // QR Type
      '0200',                                   // Version
      '1',                                      // Coding Type (UTF-8)
      iban,                                     // IBAN
      'S',                                      // Creditor Address Type (S=Structured)
      banking.holder,                           // Creditor Name (max 70 chars)
      street,                                   // Creditor Street (max 70 chars)
      houseNo,                                  // Creditor Building Number (max 16 chars)
      sender.zip || '',                         // Creditor Postal Code (max 16 chars)
      sender.city || '',                        // Creditor Town (max 35 chars)
      sender.country || 'CH',                   // Creditor Country (ISO)
      '',                                       // Ultimate Creditor Address Type (empty=none)
      '',                                       // Ultimate Creditor Name
      '',                                       // Ultimate Creditor Street
      '',                                       // Ultimate Creditor Building Number
      '',                                       // Ultimate Creditor Postal Code
      '',                                       // Ultimate Creditor Town
      '',                                       // Ultimate Creditor Country
      amount,                                   // Amount
      invoice.currency,                         // Currency
      'S',                                      // Debtor Address Type (S=Structured)
      `${user.first_name} ${user.last_name}`,  // Debtor Name (max 70 chars)
      userStreet,                               // Debtor Street (max 70 chars)
      userHouseNo,                              // Debtor Building Number (max 16 chars)
      user.address_zip || '',                   // Debtor Postal Code (max 16 chars)
      user.address_city || '',                  // Debtor Town (max 35 chars)
      user.address_country || 'CH',             // Debtor Country (ISO)
      'NON',                                    // Reference Type (NON=without reference)
      '',                                       // Reference (empty for NON)
      `${t('billing.invoice')} ${invoice.invoice_number}`, // Additional Information (max 140 chars)
      'EPD',                                    // Trailer
      ''                                        // Billing Information (empty)
    ];
    
    // Join with CRLF as per Swiss QR specification
    return parts.join('\r\n');
  };

  // Download PDF function
  const downloadPDF = (invoice: Invoice, senderInfoOverride?: any, bankingInfoOverride?: any) => {
    // Check if invoice has items
    if (!invoice.items || invoice.items.length === 0) {
      alert(t('billing.viewFirstWarning'));
      return;
    }
    
    const user = users.find(u => u.id === invoice.user_id);
    const building = buildings.find(b => b.id === invoice.building_id);
    
    // Use override if provided, otherwise use persistent state
    const sender = senderInfoOverride || senderInfo;
    const banking = bankingInfoOverride || bankingInfo;
    
    const hasBankingDetails = banking.iban && banking.holder;
    
    // Get year from invoice for filename
    const invoiceYear = new Date(invoice.period_start).getFullYear();
    const buildingName = building?.name?.replace(/[^a-z0-9]/gi, '_') || 'Building';
    const isArchived = !user?.is_active;
    
    // Create a new window for PDF generation
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert(t('billing.allowPopups'));
      return;
    }
    
    // Generate QR code data for Swiss QR bill
    const qrData = generateSwissQRData(invoice, sender, banking);
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${t('billing.invoice')} ${invoice.invoice_number}</title>
        <meta charset="UTF-8">
        <style>
          @page {
            size: A4;
            margin: 20mm;
          }
          
          body { 
            font-family: Arial, sans-serif; 
            padding: 0;
            margin: 0;
            max-width: 210mm;
          }
          
          .page {
            page-break-after: always;
            padding: 40px;
            min-height: 100vh;
          }
          
          .page:last-child {
            page-break-after: auto;
          }
          
          .header { 
            border-bottom: 3px solid #007bff; 
            padding-bottom: 20px; 
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          
          .header-left h1 { 
            margin: 0; 
            font-size: 32px; 
            color: #007bff;
          }
          
          .header-left .invoice-number { 
            color: #666; 
            font-size: 14px; 
            margin-top: 5px;
          }
          
          .header-right {
            text-align: right;
            font-size: 12px;
            line-height: 1.6;
          }
          
          .header-right strong {
            display: block;
            font-size: 14px;
            margin-bottom: 5px;
          }
          
          .status-badge {
            display: inline-block;
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            margin-top: 10px;
            ${(() => {
              const colors = getStatusColor(invoice.status);
              return `background-color: ${colors.bg}; color: ${colors.color};`;
            })()}
          }
          
          ${isArchived ? `
          .archived-banner {
            background-color: #f8d7da;
            color: #721c24;
            padding: 15px;
            text-align: center;
            font-weight: bold;
            border-radius: 8px;
            margin-bottom: 20px;
            border: 2px solid #f5c6cb;
          }
          ` : ''}
          
          .addresses {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
          }
          
          .info-section { 
            flex: 1;
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
          
          td svg {
            flex-shrink: 0;
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
          
          .solar-highlight {
            background-color: #fffbea;
          }
          
          .normal-highlight {
            background-color: #f0f4ff;
          }
          
          .charging-highlight {
            background-color: #f0fff4;
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
          
          .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            font-size: 12px;
            color: #666;
            text-align: center;
          }
          
          .qr-page {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
            padding: 40px;
          }
          
          .qr-title {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 20px;
            color: #007bff;
          }
          
          .qr-container {
            border: 2px solid #007bff;
            padding: 30px;
            border-radius: 10px;
            background: white;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          
          .qr-info {
            margin-top: 20px;
            font-size: 14px;
            line-height: 1.8;
            text-align: left;
          }
          
          #qrcode {
            margin: 20px auto;
          }
          
          @media print {
            body { padding: 0; }
            .page { padding: 20px; }
            @page { margin: 10mm; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          ${isArchived ? `
            <div class="archived-banner">
              ⚠️ ARCHIVED USER - This invoice is for an archived user
            </div>
          ` : ''}
          
          <div class="header">
            <div class="header-left">
              <h1>${t('billing.invoice')}</h1>
              <div class="invoice-number">#${invoice.invoice_number}</div>
              <div class="status-badge">${invoice.status.toUpperCase()}</div>
            </div>
            ${sender.name ? `
              <div class="header-right">
                <strong>${sender.name}</strong>
                ${sender.address ? `${sender.address}<br>` : ''}
                ${sender.zip ? `${sender.zip} ` : ''}${sender.city ? `${sender.city}<br>` : ''}
                ${sender.country || ''}
              </div>
            ` : ''}
          </div>

          <div class="addresses">
            <div class="info-section">
              <h3>${t('billing.billTo')}</h3>
              <p>
                <strong>${user?.first_name} ${user?.last_name}</strong>${!user?.is_active ? ' <em>(Archived)</em>' : ''}<br>
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
                  return `<tr class="item-header"><td colspan="2"><strong>${item.description}</strong></td></tr>`;
                } 
                else if (item.item_type === 'meter_reading_from' || 
                         item.item_type === 'meter_reading_to' || 
                         item.item_type === 'total_consumption' ||
                         item.item_type === 'charging_session_from' ||
                         item.item_type === 'charging_session_to' ||
                         item.item_type === 'total_charged') {
                  return `<tr class="item-info"><td colspan="2">${item.description}</td></tr>`;
                } 
                else if (item.item_type === 'separator') {
                  return `<tr><td colspan="2" style="padding: 8px;"></td></tr>`;
                } 
                else if (item.item_type === 'solar_power') {
                  return `<tr class="item-cost solar-highlight">
                    <td style="display: flex; align-items: center; gap: 8px;">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="4"/>
                        <path d="M12 2v2"/>
                        <path d="M12 20v2"/>
                        <path d="m4.93 4.93 1.41 1.41"/>
                        <path d="m17.66 17.66 1.41 1.41"/>
                        <path d="M2 12h2"/>
                        <path d="M20 12h2"/>
                        <path d="m6.34 17.66-1.41 1.41"/>
                        <path d="m19.07 4.93-1.41 1.41"/>
                      </svg>
                      <strong>${item.description}</strong>
                    </td>
                    <td class="text-right"><strong>${invoice.currency} ${item.total_price.toFixed(2)}</strong></td>
                  </tr>`;
                } 
                else if (item.item_type === 'normal_power') {
                  return `<tr class="item-cost normal-highlight">
                    <td style="display: flex; align-items: center; gap: 8px;">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
                      </svg>
                      <strong>${item.description}</strong>
                    </td>
                    <td class="text-right"><strong>${invoice.currency} ${item.total_price.toFixed(2)}</strong></td>
                  </tr>`;
                }
                else if (item.item_type === 'car_charging_normal') {
                  return `<tr class="item-cost charging-highlight">
                    <td style="display: flex; align-items: center; gap: 8px;">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
                        <circle cx="7" cy="17" r="2"/>
                        <path d="M9 17h6"/>
                        <circle cx="17" cy="17" r="2"/>
                      </svg>
                      <strong>${item.description}</strong>
                    </td>
                    <td class="text-right"><strong>${invoice.currency} ${item.total_price.toFixed(2)}</strong></td>
                  </tr>`;
                }
                else if (item.item_type === 'car_charging_priority') {
                  return `<tr class="item-cost charging-highlight">
                    <td style="display: flex; align-items: center; gap: 8px;">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
                        <circle cx="7" cy="17" r="2"/>
                        <path d="M9 17h6"/>
                        <circle cx="17" cy="17" r="2"/>
                      </svg>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: -4px;">
                        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
                      </svg>
                      <strong>${item.description}</strong>
                    </td>
                    <td class="text-right"><strong>${invoice.currency} ${item.total_price.toFixed(2)}</strong></td>
                  </tr>`;
                }
                else if (item.total_price > 0) {
                  return `<tr class="item-cost">
                    <td><strong>${item.description}</strong></td>
                    <td class="text-right"><strong>${invoice.currency} ${item.total_price.toFixed(2)}</strong></td>
                  </tr>`;
                }
                else {
                  return `<tr class="item-info">
                    <td colspan="2">${item.description}</td>
                  </tr>`;
                }
              }).join('')}
            </tbody>
          </table>

          <div class="total-section">
            <p>${t('billing.total')} ${invoice.currency} ${invoice.total_amount.toFixed(2)}</p>
          </div>

          ${hasBankingDetails ? `
            <div class="info-section" style="margin-top: 30px;">
              <h3>${t('billing.paymentDetails')}</h3>
              <p>
                <strong>${t('billing.bankName')}:</strong> ${banking.name}<br>
                <strong>${t('billing.accountHolder')}:</strong> ${banking.holder}<br>
                <strong>${t('billing.iban')}:</strong> ${banking.iban}
              </p>
            </div>
          ` : ''}

          <div class="footer">
            <p>${t('billing.pdfGenerated')} ${new Date().toLocaleString()}</p>
            <p>${t('billing.pdfFooter')}</p>
          </div>
        </div>

        ${hasBankingDetails && qrData ? `
          <div class="page qr-page">
            <div class="qr-title">${t('billing.swissQR')}</div>
            <div class="qr-container">
              <canvas id="qrcode"></canvas>
              <div class="qr-info">
                <p><strong>${t('billing.invoice')}:</strong> ${invoice.invoice_number}</p>
                <p><strong>${t('billing.amount')}:</strong> ${invoice.currency} ${invoice.total_amount.toFixed(2)}</p>
                <p><strong>${t('billing.iban')}:</strong> ${banking.iban}</p>
                <p><strong>${t('billing.accountHolder')}:</strong> ${banking.holder}</p>
              </div>
            </div>
          </div>
        ` : ''}

        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        <script>
          ${hasBankingDetails && qrData ? `
            // Generate Swiss QR Code with proper format
            const qrData = ${JSON.stringify(qrData)};
            
            window.addEventListener('load', function() {
              const qrCodeDiv = document.getElementById('qrcode');
              
              if (qrCodeDiv && typeof QRCode !== 'undefined') {
                try {
                  new QRCode(qrCodeDiv, {
                    text: qrData,
                    width: 256,
                    height: 256,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                  });
                  
                  console.log('Swiss QR Code generated successfully');
                  console.log('QR Data length:', qrData.length, 'bytes');
                  
                  setTimeout(() => {
                    window.print();
                    setTimeout(() => window.close(), 100);
                  }, 1000);
                } catch (error) {
                  console.error('QR Code generation error:', error);
                  setTimeout(() => {
                    window.print();
                    setTimeout(() => window.close(), 100);
                  }, 1000);
                }
              } else {
                console.error('QRCode library not loaded');
                setTimeout(() => {
                  window.print();
                  setTimeout(() => window.close(), 100);
                }, 1000);
              }
            });
          ` : `
            window.addEventListener('load', function() {
              window.print();
              setTimeout(() => window.close(), 100);
            });
          `}
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
      end_date: '',
      // Keep sender and banking info from persistent state
      sender_name: senderInfo.name,
      sender_address: senderInfo.address,
      sender_city: senderInfo.city,
      sender_zip: senderInfo.zip,
      sender_country: senderInfo.country,
      bank_name: bankingInfo.name,
      bank_iban: bankingInfo.iban,
      bank_account_holder: bankingInfo.holder
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

  const filteredBuildings = buildings.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredInvoices = selectedBuildingId
    ? invoices.filter(inv => inv.building_id === selectedBuildingId)
    : invoices;

  const invoicesByBuilding = buildings.map(building => ({
    building,
    invoices: filteredInvoices.filter(inv => inv.building_id === building.id)
  })).filter(group => group.invoices.length > 0);

  // IMPROVED: Filter users to show only active ones (exclude archived) in the selection
  const activeUsersForBuildings = users.filter(u => 
    u.is_active && formData.building_ids.includes(u.building_id || 0)
  );

  const InstructionsModal = () => (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', 
      justifyContent: 'center', zIndex: 2000, padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '30px',
        maxWidth: '700px', maxHeight: '90vh', overflow: 'auto', width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>{t('billing.instructions.title')}</h2>
          <button onClick={() => setShowInstructions(false)} 
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ lineHeight: '1.8', color: '#374151' }}>
          <div style={{ backgroundColor: '#dbeafe', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '2px solid #3b82f6' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={20} color="#3b82f6" />
              {t('billing.instructions.whatIsBilling')}
            </h3>
            <p>{t('billing.instructions.billingDescription')}</p>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            {t('billing.instructions.howBillingWorks')}
          </h3>
          <ul style={{ marginLeft: '20px' }}>
            <li>{t('billing.instructions.work1')}</li>
            <li>{t('billing.instructions.work2')}</li>
            <li>{t('billing.instructions.work3')}</li>
            <li>{t('billing.instructions.work4')}</li>
          </ul>

          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '20px', marginBottom: '10px', color: '#1f2937' }}>
            {t('billing.instructions.howToUse')}
          </h3>
          <ul style={{ marginLeft: '20px' }}>
            <li>{t('billing.instructions.step1')}</li>
            <li>{t('billing.instructions.step2')}</li>
            <li>{t('billing.instructions.step3')}</li>
            <li>{t('billing.instructions.step4')}</li>
            <li>{t('billing.instructions.step5')}</li>
            <li>{t('billing.instructions.step6')}</li>
          </ul>

          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '1px solid #f59e0b' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('billing.instructions.important')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('billing.instructions.important1')}</li>
              <li>{t('billing.instructions.important2')}</li>
              <li>{t('billing.instructions.important3')}</li>
              <li>{t('billing.instructions.important4')}</li>
              <li><strong>Archived users are excluded from billing automatically</strong></li>
            </ul>
          </div>

          <div style={{ backgroundColor: '#f0fdf4', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '1px solid #10b981' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('billing.instructions.invoiceContents')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('billing.instructions.invoice1')}</li>
              <li>{t('billing.instructions.invoice2')}</li>
              <li>{t('billing.instructions.invoice3')}</li>
              <li>{t('billing.instructions.invoice4')}</li>
              <li>{t('billing.instructions.invoice5')}</li>
            </ul>
          </div>

          <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', marginTop: '16px', border: '1px solid #f59e0b' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
              {t('billing.instructions.tips')}
            </h3>
            <ul style={{ marginLeft: '20px', fontSize: '14px' }}>
              <li>{t('billing.instructions.tip1')}</li>
              <li>{t('billing.instructions.tip2')}</li>
              <li>{t('billing.instructions.tip3')}</li>
              <li>{t('billing.instructions.tip4')}</li>
              <li>{t('billing.instructions.tip5')}</li>
            </ul>
          </div>
        </div>

        <button onClick={() => setShowInstructions(false)} style={{
          width: '100%', marginTop: '24px', padding: '12px',
          backgroundColor: '#007bff', color: 'white', border: 'none',
          borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
        }}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="billing-container" style={{ width: '100%', maxWidth: '100%' }}>
      <div className="billing-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', gap: '15px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
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
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={() => setShowInstructions(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <HelpCircle size={18} />
            {t('billing.setupInstructions')}
          </button>
          <button
            onClick={() => setShowGenerateModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <Plus size={18} />
            <span className="button-text">{t('billing.generateBills')}</span>
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
          <input
            type="text"
            placeholder={t('billing.searchBuildings')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 10px 10px 40px',
              border: '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '14px'
            }}
          />
        </div>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', 
        gap: '16px', 
        marginBottom: '30px' 
      }}>
        <div
          onClick={() => setSelectedBuildingId(null)}
          style={{
            padding: '20px',
            backgroundColor: selectedBuildingId === null ? '#667eea' : 'white',
            color: selectedBuildingId === null ? 'white' : '#1f2937',
            borderRadius: '12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: selectedBuildingId === null ? '2px solid #667eea' : '2px solid transparent'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Building size={24} />
            <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
              {t('billing.allBuildings')}
            </h3>
          </div>
          <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>
            {invoices.length} {invoices.length === 1 ? t('billing.invoices') : t('billing.invoicesPlural')}
          </p>
        </div>

        {filteredBuildings.map(building => {
          const buildingInvoiceCount = invoices.filter(inv => inv.building_id === building.id).length;
          return (
            <div
              key={building.id}
              onClick={() => setSelectedBuildingId(building.id)}
              style={{
                padding: '20px',
                backgroundColor: selectedBuildingId === building.id ? '#667eea' : 'white',
                color: selectedBuildingId === building.id ? 'white' : '#1f2937',
                borderRadius: '12px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                border: selectedBuildingId === building.id ? '2px solid #667eea' : '2px solid transparent'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <Building size={24} />
                <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
                  {building.name}
                </h3>
              </div>
              <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>
                {buildingInvoiceCount} {buildingInvoiceCount === 1 ? t('billing.invoices') : t('billing.invoicesPlural')}
              </p>
            </div>
          );
        })}
      </div>

      {invoicesByBuilding.length === 0 ? (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', padding: '60px 20px', textAlign: 'center', color: '#999' }}>
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
              <>
                <div className="desktop-table" style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden', width: '100%' }}>
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
                        const statusColors = getStatusColor(invoice.status);
                        const isArchived = !user?.is_active;
                        return (
                          <tr key={invoice.id} style={{ borderBottom: '1px solid #eee', backgroundColor: isArchived ? '#f8f9fa' : 'white' }}>
                            <td style={{ padding: '16px', fontFamily: 'monospace', fontSize: '13px' }}>{invoice.invoice_number}</td>
                            <td style={{ padding: '16px' }}>
                              {user ? `${user.first_name} ${user.last_name}` : '-'}
                              {isArchived && <span style={{ color: '#999', fontSize: '12px', marginLeft: '8px' }}>(Archived)</span>}
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
                                  <Eye size={16} color="#007bff" />
                                </button>
                                <button onClick={() => downloadPDF(invoice, senderInfo, bankingInfo)} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer' }} title={t('billing.downloadPdf')}>
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

                <div className="mobile-cards">
                  {buildingInvoices.map(invoice => {
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
                            {isArchived && <span style={{ color: '#999', fontSize: '12px', marginLeft: '8px' }}>(Archived)</span>}
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
                              backgroundColor: '#007bff',
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
                            onClick={() => downloadPDF(invoice, senderInfo, bankingInfo)}
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
                  })}
                </div>
              </>
            )}
          </div>
        ))
      )}

      {showInstructions && <InstructionsModal />}

      {showGenerateModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          padding: '15px', overflow: 'auto'
        }}>
          <div className="modal-content" style={{
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
                  <span style={{ fontSize: '13px', fontWeight: 'normal', color: '#666', marginLeft: '8px' }}>
                    (Only active users shown - archived users are excluded)
                  </span>
                </label>
                <div style={{ padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '8px', maxHeight: '200px', overflow: 'auto' }}>
                  {activeUsersForBuildings.length === 0 ? (
                    <p style={{ color: '#666', fontSize: '14px', textAlign: 'center', margin: '8px 0' }}>
                      No active users in selected buildings
                    </p>
                  ) : (
                    activeUsersForBuildings.map(u => (
                      <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={formData.user_ids.includes(u.id)}
                          onChange={() => toggleUser(u.id)}
                        />
                        <span style={{ fontSize: '14px' }}>{u.first_name} {u.last_name} ({u.email})</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '20px' }}>
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

              <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f0f4ff', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
                  {t('billing.senderInfo')}
                  {formData.building_ids.length > 0 && formData.sender_name && (
                    <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#10b981', marginLeft: '8px' }}>
                      ✓ Auto-filled from admin
                    </span>
                  )}
                </h3>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>{t('billing.senderName')}</label>
                  <input 
                    type="text" 
                    value={formData.sender_name} 
                    onChange={(e) => setFormData({ ...formData, sender_name: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }} 
                    placeholder={t('billing.senderNamePlaceholder')}
                  />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>{t('billing.senderAddress')}</label>
                  <input 
                    type="text" 
                    value={formData.sender_address} 
                    onChange={(e) => setFormData({ ...formData, sender_address: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }} 
                    placeholder={t('billing.senderAddressPlaceholder')}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>{t('billing.zip')}</label>
                    <input 
                      type="text" 
                      value={formData.sender_zip} 
                      onChange={(e) => setFormData({ ...formData, sender_zip: e.target.value })}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }} 
                      placeholder={t('billing.zipPlaceholder')}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>{t('billing.city')}</label>
                    <input 
                      type="text" 
                      value={formData.sender_city} 
                      onChange={(e) => setFormData({ ...formData, sender_city: e.target.value })}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }} 
                      placeholder={t('billing.cityPlaceholder')}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f0fff4', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
                  {t('billing.bankingInfo')}
                  {formData.building_ids.length > 0 && formData.bank_iban && (
                    <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#10b981', marginLeft: '8px' }}>
                      ✓ Auto-filled from admin
                    </span>
                  )}
                </h3>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>{t('billing.bankName')}</label>
                  <input 
                    type="text" 
                    value={formData.bank_name} 
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }} 
                    placeholder={t('billing.bankNamePlaceholder')}
                  />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>{t('billing.iban')}</label>
                  <input 
                    type="text" 
                    value={formData.bank_iban} 
                    onChange={(e) => setFormData({ ...formData, bank_iban: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }} 
                    placeholder={t('billing.ibanPlaceholder')}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>{t('billing.accountHolder')}</label>
                  <input 
                    type="text" 
                    value={formData.bank_account_holder} 
                    onChange={(e) => setFormData({ ...formData, bank_account_holder: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }} 
                    placeholder={t('billing.accountHolderPlaceholder')}
                  />
                </div>
                <p style={{ fontSize: '12px', color: '#666', marginTop: '8px', fontStyle: 'italic' }}>
                  {t('billing.qrNote')}
                </p>
              </div>

              <div className="button-group" style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
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
                  {!selectedInvoice.user.is_active && <span style={{ color: '#999', fontSize: '13px', marginLeft: '8px' }}>(Archived)</span>}
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
                          {isSolar && <Sun size={16} color="#f59e0b" />}
                          {isNormal && <Zap size={16} color="#3b82f6" />}
                          {(isChargingNormal || isChargingPriority) && <Car size={16} color="#10b981" />}
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
              <button onClick={() => downloadPDF(selectedInvoice, senderInfo, bankingInfo)} style={{
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

          .billing-container h1 {
            font-size: 24px !important;
          }

          .billing-container h1 svg {
            width: 24px !important;
            height: 24px !important;
          }

          .billing-container p {
            font-size: 14px !important;
          }

          .billing-header {
            flex-direction: column !important;
            align-items: stretch !important;
          }

          .billing-header > div:last-child {
            width: 100%;
          }

          .billing-header button {
            width: 100% !important;
            justify-content: center !important;
          }

          .modal-content {
            padding: 20px !important;
          }

          .modal-content h2 {
            font-size: 20px !important;
          }

          .modal-content h3 {
            font-size: 14px !important;
          }

          .form-row {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 480px) {
          .billing-container h1 {
            font-size: 20px !important;
          }

          .billing-container h1 svg {
            width: 20px !important;
            height: 20px !important;
          }

          .button-text {
            display: inline !important;
          }

          .modal-content {
            padding: 15px !important;
          }

          .modal-content table {
            font-size: 13px !important;
          }

          .modal-content table th,
          .modal-content table td {
            padding: 8px !important;
          }
        }
      `}</style>
    </div>
  );
}