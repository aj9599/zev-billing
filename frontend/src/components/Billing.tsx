import { useState, useEffect } from 'react';
import { Plus, Eye, FileText, Download, Trash2, Building, Search, Sun, Zap, Car, HelpCircle, X, Archive, Settings, DollarSign } from 'lucide-react';
import { api } from '../api/client';
import type { Invoice, Building as BuildingType, User } from '../types';
import { useTranslation } from '../i18n';
import BillConfiguration from './BillConfiguration';
import SharedMeterConfig from './SharedMeterConfig';
import CustomItemModal from './CustomItemModal';

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
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [currentView, setCurrentView] = useState<'invoices' | 'shared-meters' | 'custom-items'>('invoices');
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  
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
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());

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

    // Load expanded years from localStorage
    const savedExpandedYears = localStorage.getItem('zev_expanded_years');
    if (savedExpandedYears) {
      try {
        const parsed = JSON.parse(savedExpandedYears);
        setExpandedYears(new Set(parsed));
      } catch (e) {
        console.error('Failed to parse expanded years:', e);
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

  // Save expanded years to localStorage when they change
  useEffect(() => {
    if (expandedYears.size > 0) {
      localStorage.setItem('zev_expanded_years', JSON.stringify(Array.from(expandedYears)));
    }
  }, [expandedYears]);

  // Auto-fill sender and banking info when buildings are selected
  useEffect(() => {
    if (formData.building_ids.length > 0) {
      loadAdminInfoForBuildings(formData.building_ids);
    }
  }, [formData.building_ids]);

  const loadAdminInfoForBuildings = async (buildingIds: number[]) => {
    try {
      const allBuildingIds = new Set<number>(buildingIds);
      
      // Add complex IDs if any of the selected buildings belong to a complex
      for (const building of buildings) {
        if (building.is_group && building.group_buildings) {
          const groupBuildings = Array.isArray(building.group_buildings) 
            ? building.group_buildings 
            : JSON.parse(building.group_buildings as any);
          
          for (const bid of buildingIds) {
            if (groupBuildings.includes(bid)) {
              allBuildingIds.add(building.id);
              break;
            }
          }
        }
      }
      
      const buildingIdsParam = Array.from(allBuildingIds).join(',');
      console.log('Looking for admin users for buildings:', buildingIdsParam);
      
      const adminUsers = await api.getAdminUsersForBuildings(buildingIdsParam);
      
      if (adminUsers && adminUsers.length > 0) {
        const admin = adminUsers[0];
        console.log('Found admin user:', admin.email, admin.first_name, admin.last_name);
        
        if (admin.first_name && admin.last_name) {
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
          console.log('Auto-filled sender info from admin');
        }
        
        if (admin.bank_iban) {
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
          console.log('Auto-filled banking info from admin');
        }
        
        console.log('Successfully auto-filled billing info from admin user:', admin.email);
      } else {
        console.log('No admin users found for the selected buildings');
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
        api.getUsers(undefined, true)
      ]);
      setInvoices(invoicesData);
      setBuildings(buildingsData.filter(b => !b.is_group));
      setUsers(usersData);
      
      const buildingIds = new Set(buildingsData.filter(b => !b.is_group).map(b => b.id));
      setExpandedBuildings(buildingIds);
      
      // Keep existing expanded years and add current year
      setExpandedYears(prev => {
        const newExpanded = new Set(prev);
        const currentYear = new Date().getFullYear().toString();
        newExpanded.add(currentYear);
        return newExpanded;
      });
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
      
      // Expand the years for the newly generated invoices
      if (result && result.length > 0) {
        const generatedYears = new Set<string>();
        result.forEach(invoice => {
          const year = new Date(invoice.period_start).getFullYear().toString();
          generatedYears.add(year);
        });
        
        setExpandedYears(prev => {
          const newExpanded = new Set(prev);
          generatedYears.forEach(year => {
            formData.building_ids.forEach(buildingId => {
              newExpanded.add(`${year}-${buildingId}`);
            });
          });
          return newExpanded;
        });
      }
      
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
      const currentExpandedBuildings = new Set(expandedBuildings);
      const currentExpandedYears = new Set(expandedYears);
      
      await api.deleteInvoice(id);
      await loadData();
      
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

  const generateSwissQRData = (invoice: Invoice, sender: any, banking: any) => {
    const user = invoice.user;
    if (!user || !banking.iban || !banking.holder) {
      console.error('Missing required data for QR code generation');
      return '';
    }

    const iban = banking.iban.replace(/\s/g, '').toUpperCase();
    
    if (!iban.match(/^(CH|LI)[0-9]{2}[A-Z0-9]{1,21}$/)) {
      console.error('Invalid IBAN format - must be Swiss (CH) or Liechtenstein (LI) IBAN');
      return '';
    }
    
    const amount = invoice.total_amount.toFixed(2);
    
    const senderAddress = (sender.address || '').trim();
    const senderAddressMatch = senderAddress.match(/^(.+?)\s+(\d+.*)$/);
    const senderStreet = (senderAddressMatch ? senderAddressMatch[1] : senderAddress).substring(0, 70);
    const senderHouseNo = (senderAddressMatch ? senderAddressMatch[2] : '').substring(0, 16);
    
    const userAddress = (user.address_street || '').trim();
    const userAddressMatch = userAddress.match(/^(.+?)\s+(\d+.*)$/);
    const userStreet = (userAddressMatch ? userAddressMatch[1] : userAddress).substring(0, 70);
    const userHouseNo = (userAddressMatch ? userAddressMatch[2] : '').substring(0, 16);
    
    const qrParts = [
      'SPC',
      '0200',
      '1',
      iban,
      'S',
      banking.holder.substring(0, 70),
      senderStreet || '',
      senderHouseNo || '',
      (sender.zip || '').substring(0, 16),
      (sender.city || '').substring(0, 35),
      (sender.country || 'CH').substring(0, 2),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      amount,
      (invoice.currency || 'CHF').substring(0, 3),
      'S',
      `${user.first_name} ${user.last_name}`.substring(0, 70),
      userStreet || '',
      userHouseNo || '',
      (user.address_zip || '').substring(0, 16),
      (user.address_city || '').substring(0, 35),
      (user.address_country || 'CH').substring(0, 2),
      'NON',
      '',
      `Invoice ${invoice.invoice_number}`.substring(0, 140),
      'EPD'
    ];
    
    const qrData = qrParts.join('\r\n');
    
    const lines = qrData.split('\r\n');
    if (lines.length !== 31) {
      console.error(`Invalid QR data structure: expected 31 lines, got ${lines.length}`);
      return '';
    }
    
    console.log('✓ Generated valid Swiss QR data with 31 elements');
    return qrData;
  };

  const downloadPDF = async (invoice: Invoice, senderInfoOverride?: any, bankingInfoOverride?: any) => {
    let invoiceWithItems = invoice;
    if (!invoice.items || invoice.items.length === 0) {
      try {
        invoiceWithItems = await api.getInvoice(invoice.id);
        if (!invoiceWithItems.items || invoiceWithItems.items.length === 0) {
          alert(t('billing.viewFirstWarning'));
          return;
        }
      } catch (err) {
        console.error('Failed to load invoice items:', err);
        alert('Failed to load invoice details. Please try again.');
        return;
      }
    }
    
    const user = users.find(u => u.id === invoiceWithItems.user_id);
    const building = buildings.find(b => b.id === invoiceWithItems.building_id);
    
    const sender = senderInfoOverride || senderInfo;
    const banking = bankingInfoOverride || bankingInfo;
    
    const hasBankingDetails = banking.iban && banking.holder;
    const isArchived = !user?.is_active;
    
    const qrData = hasBankingDetails ? generateSwissQRData(invoiceWithItems, sender, banking) : '';
    const hasValidQR = qrData && qrData.length > 0;
    
    if (hasBankingDetails && !hasValidQR) {
      console.warn('Banking details present but QR generation failed - will show QR page without code');
    }
    
    const qrCodeId = `qrcode-${invoiceWithItems.id}-${Date.now()}`;
    
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    
    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) {
      alert('Failed to create PDF. Please try again.');
      return;
    }
    
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${t('billing.invoice')} ${invoiceWithItems.invoice_number}</title>
        <meta charset="UTF-8">
        <style>
          @page {
            size: A4;
            margin: 15mm;
          }
          
          body { 
            font-family: Arial, sans-serif; 
            padding: 0;
            margin: 0;
            max-width: 210mm;
            font-size: 10pt;
          }
          
          .page {
            page-break-after: always;
            padding: 20px;
            min-height: 297mm;
            max-height: 297mm;
            position: relative;
            box-sizing: border-box;
          }
          
          .page:last-child {
            page-break-after: auto;
          }
          
          .header { 
            border-bottom: 2px solid #007bff; 
            padding-bottom: 15px; 
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          
          .header-left h1 { 
            margin: 0; 
            font-size: 24pt; 
            color: #007bff;
          }
          
          .header-left .invoice-number { 
            color: #666; 
            font-size: 10pt; 
            margin-top: 4px;
          }
          
          .header-right {
            text-align: right;
            font-size: 9pt;
            line-height: 1.4;
          }
          
          .header-right strong {
            display: block;
            font-size: 10pt;
            margin-bottom: 3px;
          }
          
          .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 15px;
            font-size: 9pt;
            font-weight: 600;
            margin-top: 8px;
            ${(() => {
              const colors = getStatusColor(invoiceWithItems.status);
              return `background-color: ${colors.bg}; color: ${colors.color};`;
            })()}
          }
          
          ${isArchived ? `
          .archived-banner {
            background-color: #f8d7da;
            color: #721c24;
            padding: 10px;
            text-align: center;
            font-weight: bold;
            border-radius: 6px;
            margin-bottom: 15px;
            border: 2px solid #f5c6cb;
            font-size: 10pt;
          }
          ` : ''}
          
          .addresses {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
          }
          
          .info-section { 
            flex: 1;
          }
          
          .info-section h3 { 
            font-size: 10pt; 
            text-transform: uppercase; 
            color: #666; 
            margin-bottom: 8px;
            font-weight: 600;
          }
          
          .info-section p { 
            margin: 3px 0; 
            line-height: 1.4;
            font-size: 9pt;
          }
          
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 20px 0;
            font-size: 9pt;
          }
          
          th { 
            background-color: #f9f9f9; 
            padding: 8px; 
            text-align: left; 
            border-bottom: 2px solid #ddd;
            font-weight: 600;
            font-size: 9pt;
          }
          
          td { 
            padding: 8px; 
            border-bottom: 1px solid #eee;
            font-size: 9pt;
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
            font-size: 8pt;
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
            padding: 15px; 
            text-align: right; 
            margin-top: 20px;
            border-radius: 6px;
            margin-bottom: 20px;
          }
          
          .total-section p { 
            font-size: 18pt; 
            font-weight: bold; 
            margin: 0;
          }
          
          .payment-details-bottom {
            position: absolute;
            bottom: 15mm;
            left: 20px;
            right: 20px;
            padding: 15px 0;
            border-top: 2px solid #ddd;
            font-size: 8pt;
            color: #666;
            background: white;
          }
          
          .payment-details-bottom h4 {
            font-size: 9pt;
            font-weight: 600;
            margin: 0 0 8px 0;
            color: #333;
          }
          
          .payment-details-bottom p {
            margin: 2px 0;
            line-height: 1.4;
            font-size: 8pt;
          }
          
          .footer-timestamp {
            text-align: right;
            font-size: 7pt;
            color: #999;
            margin-top: 8px;
          }
          
          .qr-page {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 297mm;
            text-align: center;
            padding: 30px;
          }
          
          .qr-title {
            font-size: 18pt;
            font-weight: bold;
            margin-bottom: 15px;
            color: #007bff;
          }
          
          .qr-container {
            border: 2px solid #007bff;
            padding: 25px;
            border-radius: 8px;
            background: white;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          
          .qr-info {
            margin-top: 15px;
            font-size: 10pt;
            line-height: 1.6;
            text-align: left;
          }
          
          #${qrCodeId} {
            margin: 15px auto;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 280px;
          }
          
          #${qrCodeId} canvas {
            image-rendering: pixelated;
          }
          
          @media print {
            body { 
              padding: 0; 
              font-size: 10pt; 
            }
            
            .page { 
              padding: 15px;
              min-height: 297mm;
              max-height: 297mm;
            }
            
            @page { 
              margin: 10mm;
              size: A4 portrait;
            }
            
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
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
              <div class="invoice-number">#${invoiceWithItems.invoice_number}</div>
              <div class="status-badge">${invoiceWithItems.status.toUpperCase()}</div>
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
                <strong>${t('billing.periodLabel')}</strong> ${formatDate(invoiceWithItems.period_start)} ${t('pricing.to')} ${formatDate(invoiceWithItems.period_end)}<br>
                <strong>${t('billing.generatedLabel')}</strong> ${formatDate(invoiceWithItems.generated_at)}<br>
                <strong>${t('billing.statusLabel')}</strong> ${invoiceWithItems.status}
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
              ${invoiceWithItems.items?.map(item => {
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
            <p>${t('billing.total')} ${invoiceWithItems.currency} ${invoiceWithItems.total_amount.toFixed(2)}</p>
          </div>

          ${hasBankingDetails ? `
            <div class="payment-details-bottom">
              <h4>${t('billing.paymentDetails')}</h4>
              <p><strong>${t('billing.bankName')}:</strong> ${banking.name}</p>
              <p><strong>${t('billing.accountHolder')}:</strong> ${banking.holder}</p>
              <p><strong>${t('billing.iban')}:</strong> ${banking.iban}</p>
              <div class="footer-timestamp">
                <p>${t('billing.generated')}: ${new Date().toLocaleString('de-CH', { 
                  year: 'numeric', 
                  month: '2-digit', 
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false 
                })}</p>
              </div>
            </div>
          ` : ''}
        </div>

        ${hasBankingDetails ? `
          <div class="page qr-page">
            <div class="qr-title">${t('billing.swissQR')}</div>
            <div class="qr-container">
              <div id="${qrCodeId}">
                ${!hasValidQR ? `
                  <div style="padding: 20px; color: #dc3545; text-align: center;">
                    <p style="margin: 0; font-size: 12pt;">QR Code could not be generated</p>
                    <p style="margin: 5px 0 0 0; font-size: 9pt;">Please check banking details</p>
                  </div>
                ` : ''}
              </div>
              <div class="qr-info">
                <p><strong>${t('billing.invoice')}:</strong> ${invoiceWithItems.invoice_number}</p>
                <p><strong>${t('billing.amount')}:</strong> ${invoiceWithItems.currency} ${invoiceWithItems.total_amount.toFixed(2)}</p>
                <p><strong>${t('billing.iban')}:</strong> ${banking.iban}</p>
                <p><strong>${t('billing.accountHolder')}:</strong> ${banking.holder}</p>
              </div>
            </div>
          </div>
        ` : ''}

        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        <script>
          ${hasBankingDetails && hasValidQR ? `
            const qrData = ${JSON.stringify(qrData)};
            
            console.log('Generating Swiss QR Code...');
            console.log('QR Data length:', qrData.length, 'characters');
            
            window.addEventListener('load', function() {
              const qrCodeDiv = document.getElementById('${qrCodeId}');
              
              if (qrCodeDiv && typeof QRCode !== 'undefined') {
                try {
                  qrCodeDiv.innerHTML = '';
                  
                  new QRCode(qrCodeDiv, {
                    text: qrData,
                    width: 280,
                    height: 280,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                  });
                  
                  console.log('✓ Swiss QR Code generated successfully');
                  
                  setTimeout(() => {
                    window.print();
                  }, 1500);
                } catch (error) {
                  console.error('✗ QR Code generation error:', error);
                  qrCodeDiv.innerHTML = '<p style="color: red; padding: 20px;">Error generating QR code</p>';
                  setTimeout(() => {
                    window.print();
                  }, 1000);
                }
              } else {
                console.error('✗ QRCode library not loaded or div not found');
                setTimeout(() => {
                  window.print();
                }, 1000);
              }
            });
          ` : `
            window.addEventListener('load', function() {
              console.log('Printing invoice without QR code...');
              setTimeout(() => {
                window.print();
              }, 500);
            });
          `}
        </script>
      </body>
      </html>
    `);
    
    iframeDoc.close();
    
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 5000);
  };

  const resetForm = () => {
    setFormData({
      building_ids: [],
      user_ids: [],
      start_date: '',
      end_date: '',
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

  const filteredBuildings = buildings.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
              <li><strong>{t('billing.instructions.important5')}</strong></li>
              <li><strong>{t('billing.instructions.important6')}</strong></li>
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
  };

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
            color: '#1f2937'
          }}>
            <FileText size={36} style={{ color: '#007bff' }} />
            {t('billing.title')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            {t('billing.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* View Switcher */}
          <div style={{ 
            display: 'flex', 
            backgroundColor: '#f0f0f0', 
            borderRadius: '6px', 
            padding: '4px' 
          }}>
            <button
              onClick={() => setCurrentView('invoices')}
              style={{
                padding: '8px 16px',
                backgroundColor: currentView === 'invoices' ? '#007bff' : 'transparent',
                color: currentView === 'invoices' ? 'white' : '#666',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <FileText size={14} />
              {t('billing.tabs.invoices')}
            </button>
            <button
              onClick={() => setCurrentView('shared-meters')}
              style={{
                padding: '8px 16px',
                backgroundColor: currentView === 'shared-meters' ? '#007bff' : 'transparent',
                color: currentView === 'shared-meters' ? 'white' : '#666',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Settings size={14} />
              {t('billing.tabs.sharedMeters')}
            </button>
            <button
              onClick={() => setCurrentView('custom-items')}
              style={{
                padding: '8px 16px',
                backgroundColor: currentView === 'custom-items' ? '#007bff' : 'transparent',
                color: currentView === 'custom-items' ? 'white' : '#666',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <DollarSign size={14} />
              {t('billing.tabs.customItems')}
            </button>
          </div>

          {/* Action Buttons (only show for invoices view) */}
          {currentView === 'invoices' && (
            <>
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
                onClick={() => setShowAdvancedConfig(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
                  backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
                }}
              >
                <Plus size={18} />
                <span className="button-text">{t('billing.createBill')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Conditionally render based on current view */}
      {currentView === 'shared-meters' ? (
        <SharedMeterConfig />
      ) : currentView === 'custom-items' ? (
        <CustomItemModal
          isOpen={true}
          onClose={() => setCurrentView('invoices')}
          onSave={() => {
            loadData();
          }}
        />
      ) : (
        <>
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
            backgroundColor: selectedBuildingId === null ? '#007bff' : 'white',
            color: selectedBuildingId === null ? 'white' : '#1f2937',
            borderRadius: '12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: selectedBuildingId === null ? '2px solid #007bff' : '2px solid transparent'
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
                backgroundColor: selectedBuildingId === building.id ? '#007bff' : 'white',
                color: selectedBuildingId === building.id ? 'white' : '#1f2937',
                borderRadius: '12px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                border: selectedBuildingId === building.id ? '2px solid #007bff' : '2px solid transparent'
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

      {showInstructions && <InstructionsModal />}

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

      {/* End of conditional invoices view */}
      </>
      )}

      {/* Advanced Bill Configuration Modal */}
      <BillConfiguration
        isOpen={showAdvancedConfig}
        onClose={() => setShowAdvancedConfig(false)}
        onGenerate={() => {
          loadData();
          setShowAdvancedConfig(false);
        }}
      />

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