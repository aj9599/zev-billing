import { useState, useEffect } from 'react';
import { Upload, Database, AlertCircle, FileSpreadsheet, CheckCircle, Edit2, Save, X, Plus, Trash2, Download } from 'lucide-react';
import { useTranslation } from '../i18n';
import { api } from '../api/client';
import type { Charger, Building } from '../types';

interface CSVRow {
  [key: string]: string;
}

interface ChargersByBuilding {
  [buildingName: string]: Charger[];
}

export default function CSVUpload() {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCharger, setSelectedCharger] = useState<number | null>(null);
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editedData, setEditedData] = useState<CSVRow>({});

  useEffect(() => {
    loadChargers();
    loadBuildings();
  }, []);

  const loadBuildings = async () => {
    try {
      let data: Building[];
      
      if (typeof api === 'object' && 'getBuildings' in api && typeof api.getBuildings === 'function') {
        data = await api.getBuildings();
      } else {
        const response = await fetch('/api/buildings', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch buildings');
        }
        
        data = await response.json();
      }
      
      setBuildings(data);
    } catch (err) {
      console.error('Failed to load buildings:', err);
    }
  };

  const loadChargers = async () => {
    try {
      let data: Charger[];
      
      if (typeof api === 'object' && 'getChargers' in api && typeof api.getChargers === 'function') {
        data = await api.getChargers();
      } else {
        const response = await fetch('/api/chargers', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch chargers');
        }
        
        data = await response.json();
      }
      
      setChargers(data);
    } catch (err) {
      console.error('Failed to load chargers:', err);
      setMessage(t('csvUpload.failedToLoadChargers'));
      setMessageType('error');
    }
  };

  // Group chargers by building
  const chargersByBuilding: ChargersByBuilding = chargers.reduce((acc, charger) => {
    const building = buildings.find(b => b.id === charger.building_id);
    const buildingName = building ? building.name : 'Unknown Building';
    
    if (!acc[buildingName]) {
      acc[buildingName] = [];
    }
    acc[buildingName].push(charger);
    return acc;
  }, {} as ChargersByBuilding);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.csv')) {
        setSelectedFile(file);
        setMessage('');
        await parseCSV(file);
      } else {
        setMessage(t('csvUpload.invalidFileType'));
        setMessageType('error');
        setSelectedFile(null);
        setCsvData([]);
        setCsvHeaders([]);
        setShowPreview(false);
      }
    }
  };

  const parseCSV = async (file: File) => {
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        setMessage(t('csvUpload.csvEmpty'));
        setMessageType('error');
        return;
      }

      // Parse header
      const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      setCsvHeaders(header);
      
      // Parse all data rows
      const data = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const row: CSVRow = {};
        header.forEach((key, index) => {
          row[key] = values[index] || '';
        });
        return row;
      });

      setCsvData(data);
      setShowPreview(true);
      setMessage(t('csvUpload.csvLoaded').replace('{count}', data.length.toString()));
      setMessageType('info');
    } catch (err) {
      console.error('Failed to parse CSV:', err);
      setMessage(t('csvUpload.failedToRead'));
      setMessageType('error');
    }
  };

  const startEditing = (index: number) => {
    setEditingRow(index);
    setEditedData({ ...csvData[index] });
  };

  const cancelEditing = () => {
    setEditingRow(null);
    setEditedData({});
  };

  const saveEdit = (index: number) => {
    const newData = [...csvData];
    newData[index] = editedData;
    setCsvData(newData);
    setEditingRow(null);
    setEditedData({});
    setMessage(t('csvUpload.rowUpdated'));
    setMessageType('success');
  };

  const deleteRow = (index: number) => {
    if (confirm(t('csvUpload.deleteConfirm'))) {
      const newData = csvData.filter((_, i) => i !== index);
      setCsvData(newData);
      setMessage(t('csvUpload.rowDeleted').replace('{count}', newData.length.toString()));
      setMessageType('info');
    }
  };

  const addNewRow = () => {
    const newRow: CSVRow = {};
    csvHeaders.forEach(header => {
      newRow[header] = '';
    });
    setCsvData([...csvData, newRow]);
    setEditingRow(csvData.length);
    setEditedData(newRow);
    setMessage(t('csvUpload.newRowAdded'));
    setMessageType('info');
  };

  const downloadEditedCSV = () => {
    const csvContent = [
      csvHeaders.join(','),
      ...csvData.map(row => 
        csvHeaders.map(header => {
          const value = row[header] || '';
          return value.includes(',') ? `"${value}"` : value;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edited_${selectedFile?.name || 'sessions.csv'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setMessage(t('csvUpload.csvDownloaded'));
    setMessageType('success');
  };

  const handleUpload = async () => {
    if (csvData.length === 0) {
      setMessage(t('csvUpload.noDataToUpload'));
      setMessageType('error');
      return;
    }

    if (!selectedCharger) {
      setMessage(t('csvUpload.pleaseSelectCharger'));
      setMessageType('error');
      return;
    }

    setUploading(true);
    setMessage(t('csvUpload.uploadingProcessing'));
    setMessageType('info');

    try {
      const csvContent = [
        csvHeaders.join(','),
        ...csvData.map(row => 
          csvHeaders.map(header => {
            const value = row[header] || '';
            return value.includes(',') ? `"${value}"` : value;
          }).join(',')
        )
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const formData = new FormData();
      formData.append('csv', blob, selectedFile?.name || 'sessions.csv');

      const response = await fetch(`/api/chargers/${selectedCharger}/import-sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Import failed');
      }

      const result = await response.json();
      
      setMessage(t('csvUpload.importSuccess')
        .replace('{processed}', result.processed.toString())
        .replace('{imported}', result.imported.toString())
        .replace('{deleted}', result.deleted_count.toString()));
      setMessageType('success');
      setUploading(false);
      setSelectedFile(null);
      setSelectedCharger(null);
      setCsvData([]);
      setCsvHeaders([]);
      setShowPreview(false);
      
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (err: any) {
      setMessage(t('csvUpload.importFailed').replace('{error}', err.message));
      setMessageType('error');
      setUploading(false);
    }
  };

  const selectedChargerData = chargers.find(c => c.id === selectedCharger);

  return (
    <div className="csv-upload-container" style={{ maxWidth: '1600px', margin: '0 auto', padding: '20px' }}>
      <div className="csv-upload-header" style={{ marginBottom: '40px' }}>
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
          <Database size={36} style={{ color: '#667eea' }} />
          {t('csvUpload.pageTitle')}
        </h1>
        <p style={{ color: '#6b7280', fontSize: '16px' }}>
          {t('csvUpload.pageSubtitle')}
        </p>
      </div>

      {message && (
        <div style={{
          padding: '18px 24px',
          marginBottom: '32px',
          borderRadius: '16px',
          backgroundColor: messageType === 'success' ? '#d4edda' : messageType === 'error' ? '#f8d7da' : '#d1ecf1',
          color: messageType === 'success' ? '#155724' : messageType === 'error' ? '#721c24' : '#0c5460',
          border: `2px solid ${messageType === 'success' ? '#c3e6cb' : messageType === 'error' ? '#f5c6cb' : '#bee5eb'}',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '15px',
          fontWeight: '500',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          animation: 'slideDown 0.4s ease-out'
        }}>
          {messageType === 'success' ? <CheckCircle size={22} /> : 
           messageType === 'error' ? <AlertCircle size={22} /> : 
           <FileSpreadsheet size={22} />}
          {message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
        {/* Charger Selection Card */}
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '20px', 
          padding: '40px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
          border: '1px solid #f3f4f6',
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '16px', 
            marginBottom: '32px',
            paddingBottom: '24px',
            borderBottom: '2px solid #f3f4f6'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)'
            }}>
              <Database size={28} color="white" strokeWidth={2.5} />
            </div>
            <div>
              <h2 style={{ 
                fontSize: '24px', 
                fontWeight: '700', 
                marginBottom: '4px',
                color: '#1f2937'
              }}>
                {t('csvUpload.selectCharger')}
              </h2>
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                {t('csvUpload.selectChargerDesc')}
              </p>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px', 
              fontWeight: '600', 
              color: '#374151',
              fontSize: '14px'
            }}>
              {t('csvUpload.chargerLabel')} *
            </label>
            <select
              value={selectedCharger || ''}
              onChange={(e) => setSelectedCharger(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '2px solid #e5e7eb',
                fontSize: '15px',
                backgroundColor: 'white',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#667eea'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
            >
              <option value="">{t('csvUpload.selectChargerPlaceholder')}</option>
              {Object.entries(chargersByBuilding).map(([buildingName, buildingChargers]) => (
                <optgroup key={buildingName} label={buildingName}>
                  {buildingChargers.map(charger => (
                    <option key={charger.id} value={charger.id}>
                      {charger.name} - {charger.brand}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {selectedChargerData && (
            <div style={{
              padding: '16px',
              backgroundColor: '#f0fdf4',
              borderRadius: '12px',
              border: '2px solid #86efac'
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#065f46' }}>
                {t('csvUpload.selectedChargerDetails')}
              </h3>
              <div style={{ fontSize: '13px', color: '#047857' }}>
                <p><strong>{t('csvUpload.chargerName')}:</strong> {selectedChargerData.name}</p>
                <p><strong>{t('csvUpload.chargerBrand')}:</strong> {selectedChargerData.brand}</p>
                <p><strong>{t('csvUpload.chargerType')}:</strong> {selectedChargerData.connection_type}</p>
              </div>
            </div>
          )}
        </div>

        {/* File Upload Card */}
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '20px', 
          padding: '40px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
          border: '1px solid #f3f4f6',
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '16px', 
            marginBottom: '32px',
            paddingBottom: '24px',
            borderBottom: '2px solid #f3f4f6'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(102, 126, 234, 0.3)'
            }}>
              <Upload size={28} color="white" strokeWidth={2.5} />
            </div>
            <div>
              <h2 style={{ 
                fontSize: '24px', 
                fontWeight: '700', 
                marginBottom: '4px',
                color: '#1f2937'
              }}>
                {t('csvUpload.uploadCSVFile')}
              </h2>
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                {t('csvUpload.uploadCSVFileDesc')}
              </p>
            </div>
          </div>

          <div style={{
            border: '2px dashed #d1d5db',
            borderRadius: '12px',
            padding: '40px',
            textAlign: 'center',
            marginBottom: '24px',
            backgroundColor: '#f9fafb',
            transition: 'all 0.3s ease',
            position: 'relative'
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.style.borderColor = '#667eea';
            e.currentTarget.style.backgroundColor = '#eef2ff';
          }}
          onDragLeave={(e) => {
            e.currentTarget.style.borderColor = '#d1d5db';
            e.currentTarget.style.backgroundColor = '#f9fafb';
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.style.borderColor = '#d1d5db';
            e.currentTarget.style.backgroundColor = '#f9fafb';
            const file = e.dataTransfer.files[0];
            if (file && file.name.endsWith('.csv')) {
              setSelectedFile(file);
              setMessage('');
              parseCSV(file);
            } else {
              setMessage(t('csvUpload.invalidFileType'));
              setMessageType('error');
            }
          }}>
            <FileSpreadsheet size={48} color="#9ca3af" style={{ margin: '0 auto 16px' }} />
            <p style={{ fontSize: '16px', color: '#4b5563', marginBottom: '8px', fontWeight: '500' }}>
              {selectedFile ? selectedFile.name : t('csvUpload.dragDropFile')}
            </p>
            <p style={{ fontSize: '13px', color: '#9ca3af' }}>
              {t('csvUpload.orClickToSelect')}
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              style={{
                position: 'absolute',
                opacity: 0,
                width: '100%',
                height: '100%',
                top: 0,
                left: 0,
                cursor: 'pointer'
              }}
            />
          </div>

          {showPreview && csvData.length > 0 && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <button
                onClick={addNewRow}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                }}
              >
                <Plus size={18} />
                {t('csvUpload.addRow')}
              </button>
              <button
                onClick={downloadEditedCSV}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
                }}
              >
                <Download size={18} />
                {t('csvUpload.download')}
              </button>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={csvData.length === 0 || !selectedCharger || uploading}
            style={{
              width: '100%', 
              padding: '16px', 
              background: (csvData.length === 0 || !selectedCharger || uploading) ? '#9ca3af' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none', 
              borderRadius: '12px', 
              fontSize: '16px', 
              fontWeight: '700',
              cursor: (csvData.length === 0 || !selectedCharger || uploading) ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: (csvData.length === 0 || !selectedCharger || uploading) ? 'none' : '0 8px 20px rgba(102, 126, 234, 0.3)',
              letterSpacing: '0.5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {uploading ? (
              <>
                <div style={{
                  width: '20px',
                  height: '20px',
                  border: '3px solid rgba(255,255,255,0.3)',
                  borderTop: '3px solid white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                {t('csvUpload.processing')}
              </>
            ) : (
              <>
                <Upload size={20} />
                {t('csvUpload.importSessions').replace('{count}', csvData.length.toString())}
              </>
            )}
          </button>
        </div>
      </div>

      {/* CSV Editor */}
      {showPreview && csvData.length > 0 && (
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '20px', 
          padding: '40px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
          border: '1px solid #f3f4f6',
          marginBottom: '30px'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '24px',
            paddingBottom: '16px',
            borderBottom: '2px solid #f3f4f6'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 20px rgba(102, 126, 234, 0.3)'
              }}>
                <Edit2 size={24} color="white" strokeWidth={2.5} />
              </div>
              <div>
                <h2 style={{ 
                  fontSize: '20px', 
                  fontWeight: '700', 
                  marginBottom: '4px',
                  color: '#1f2937'
                }}>
                  {t('csvUpload.csvDataEditor')}
                </h2>
                <p style={{ fontSize: '13px', color: '#6b7280' }}>
                  {t('csvUpload.csvDataEditorDesc').replace('{count}', csvData.length.toString())}
                </p>
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              fontSize: '13px'
            }}>
              <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f9fafb', zIndex: 10 }}>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ 
                    padding: '12px', 
                    textAlign: 'left',
                    fontWeight: '600',
                    color: '#374151',
                    width: '50px'
                  }}>
                    {t('csvUpload.rowNumber')}
                  </th>
                  {csvHeaders.map((header, idx) => (
                    <th key={idx} style={{ 
                      padding: '12px', 
                      textAlign: 'left',
                      fontWeight: '600',
                      color: '#374151'
                    }}>
                      {header}
                    </th>
                  ))}
                  <th style={{ 
                    padding: '12px', 
                    textAlign: 'center',
                    fontWeight: '600',
                    color: '#374151',
                    width: '120px'
                  }}>
                    {t('csvUpload.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {csvData.map((row, rowIdx) => (
                  <tr key={rowIdx} style={{ 
                    borderBottom: '1px solid #f3f4f6',
                    backgroundColor: editingRow === rowIdx ? '#f0f9ff' : 'white'
                  }}>
                    <td style={{ 
                      padding: '12px',
                      color: '#9ca3af',
                      fontWeight: '600'
                    }}>
                      {rowIdx + 1}
                    </td>
                    {csvHeaders.map((header, cellIdx) => (
                      <td key={cellIdx} style={{ padding: '12px' }}>
                        {editingRow === rowIdx ? (
                          <input
                            type="text"
                            value={editedData[header] || ''}
                            onChange={(e) => setEditedData({ ...editedData, [header]: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              border: '2px solid #667eea',
                              borderRadius: '8px',
                              fontSize: '13px'
                            }}
                          />
                        ) : (
                          <span style={{ color: '#6b7280' }}>{row[header]}</span>
                        )}
                      </td>
                    ))}
                    <td style={{ padding: '12px' }}>
                      {editingRow === rowIdx ? (
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            onClick={() => saveEdit(rowIdx)}
                            style={{
                              padding: '6px 12px',
                              background: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}
                          >
                            <Save size={14} />
                            {t('csvUpload.save')}
                          </button>
                          <button
                            onClick={cancelEditing}
                            style={{
                              padding: '6px 12px',
                              background: '#6b7280',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}
                          >
                            <X size={14} />
                            {t('csvUpload.cancel')}
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            onClick={() => startEditing(rowIdx)}
                            style={{
                              padding: '6px 12px',
                              background: '#667eea',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}
                          >
                            <Edit2 size={14} />
                            {t('csvUpload.edit')}
                          </button>
                          <button
                            onClick={() => deleteRow(rowIdx)}
                            style={{
                              padding: '6px 12px',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Instructions Card */}
      <div style={{ 
        backgroundColor: 'white', 
        borderRadius: '20px', 
        padding: '40px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
        border: '1px solid #f3f4f6',
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '16px', 
          marginBottom: '32px',
          paddingBottom: '24px',
          borderBottom: '2px solid #f3f4f6'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(240, 147, 251, 0.3)'
          }}>
            <AlertCircle size={28} color="white" strokeWidth={2.5} />
          </div>
          <div>
            <h2 style={{ 
              fontSize: '24px', 
              fontWeight: '700', 
              marginBottom: '4px',
              color: '#1f2937'
            }}>
              Important Instructions
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280' }}>
              Read before importing
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[
            { 
              title: 'Select Target Charger', 
              desc: 'Choose the charger you want to import sessions for. All existing sessions for this charger will be deleted.',
              color: '#667eea' 
            },
            { 
              title: 'CSV Format Options', 
              desc: 'Simplified format (recommended): Session Time, User ID, Power (kWh), Mode, State. Or use full format: Charger ID, Charger Name, Brand, Building, Session Time, User ID, Power (kWh), Mode, State',
              color: '#10b981' 
            },
            { 
              title: 'Simplified Format Benefits', 
              desc: 'Since you\'ve already selected the target charger, you only need to provide session data. Charger info, brand, and building are automatically taken from your selection.',
              color: '#f59e0b' 
            },
            { 
              title: 'Data Replacement', 
              desc: 'This operation will DELETE all existing sessions for the selected charger and replace them with CSV data. This cannot be undone!',
              color: '#ef4444' 
            }
          ].map((step, idx) => (
            <div key={idx} style={{
              padding: '16px',
              backgroundColor: '#f9fafb',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'start',
              gap: '16px',
              transition: 'all 0.3s ease'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: step.color + '20',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontWeight: '700',
                fontSize: '16px',
                color: step.color
              }}>
                {idx + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ 
                  fontSize: '15px', 
                  fontWeight: '600', 
                  marginBottom: '4px',
                  color: '#1f2937'
                }}>
                  {step.title}
                </h3>
                <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.5', margin: 0 }}>
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: '24px',
          padding: '16px',
          backgroundColor: '#fef3c7',
          border: '2px solid #fbbf24',
          borderRadius: '12px'
        }}>
          <p style={{ 
            fontSize: '13px', 
            color: '#92400e', 
            margin: 0,
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={18} />
            <strong>WARNING:</strong> This operation permanently deletes all sessions for the selected charger. Make sure you have a backup before proceeding!
          </p>
        </div>

        <div style={{
          marginTop: '24px',
          padding: '20px',
          backgroundColor: '#f0f9ff',
          border: '2px solid #3b82f6',
          borderRadius: '12px'
        }}>
          <h3 style={{ 
            fontSize: '15px', 
            fontWeight: '600', 
            marginBottom: '12px',
            color: '#1e40af',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <FileSpreadsheet size={18} />
            CSV Format Examples
          </h3>
          
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '8px' }}>
              Simplified Format (Recommended):
            </p>
            <pre style={{ 
              backgroundColor: '#1f2937', 
              color: '#10b981',
              padding: '12px', 
              borderRadius: '8px', 
              fontSize: '12px',
              overflowX: 'auto',
              fontFamily: 'monospace',
              margin: 0
            }}>
{`Session Time,User ID,Power (kWh),Mode,State
2025-11-22 11:00:00,user123,15.5,normal,charging
2025-11-22 14:30:00,user456,22.3,priority,charging
2025-11-22 18:00:00,,10.2,normal,idle`}
            </pre>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px', fontStyle: 'italic' }}>
              Note: User ID can be empty. Charger info is automatically taken from your selection above.
            </p>
          </div>

          <div>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '8px' }}>
              Full Format (Legacy):
            </p>
            <pre style={{ 
              backgroundColor: '#1f2937', 
              color: '#60a5fa',
              padding: '12px', 
              borderRadius: '8px', 
              fontSize: '12px',
              overflowX: 'auto',
              fontFamily: 'monospace',
              margin: 0
            }}>
{`Charger ID,Charger Name,Brand,Building,Session Time,User ID,Power (kWh),Mode,State
5,Main Charger,Tesla,Building A,2025-11-22 11:00:00,user123,15.5,normal,charging
5,Main Charger,Tesla,Building A,2025-11-22 14:30:00,user456,22.3,priority,charging`}
            </pre>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px', fontStyle: 'italic' }}>
              Note: Only rows matching the selected Charger ID will be imported.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 1024px) {
          .csv-upload-container {
            padding: 20px 10px !important;
          }

          .csv-upload-container > div[style*="grid"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}