import { useState, useEffect } from 'react';
import { Upload, Database, AlertCircle, FileSpreadsheet, CheckCircle } from 'lucide-react';
import { useTranslation } from '../i18n';
import type { Charger } from '../types';

export default function CSVUpload() {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCharger, setSelectedCharger] = useState<number | null>(null);
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    loadChargers();
  }, []);

  const loadChargers = async () => {
    try {
      const response = await fetch('/api/chargers', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch chargers');
      }
      
      const data = await response.json();
      setChargers(data);
    } catch (err) {
      console.error('Failed to load chargers:', err);
      setMessage('Failed to load chargers');
      setMessageType('error');
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.csv')) {
        setSelectedFile(file);
        setMessage('');
        await previewCSV(file);
      } else {
        setMessage(t('csvUpload.invalidFileType') || 'Please select a CSV file');
        setMessageType('error');
        setSelectedFile(null);
        setCsvPreview([]);
        setShowPreview(false);
      }
    }
  };

  const previewCSV = async (file: File) => {
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        setMessage('CSV file is empty or invalid');
        setMessageType('error');
        return;
      }

      // Parse header
      const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      // Parse first 5 data rows for preview
      const preview = lines.slice(1, 6).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const row: any = {};
        header.forEach((key, index) => {
          row[key] = values[index] || '';
        });
        return row;
      });

      setCsvPreview(preview);
      setShowPreview(true);
      setMessage(`CSV loaded: ${lines.length - 1} sessions found`);
      setMessageType('info');
    } catch (err) {
      console.error('Failed to preview CSV:', err);
      setMessage('Failed to read CSV file');
      setMessageType('error');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage('Please select a CSV file');
      setMessageType('error');
      return;
    }

    if (!selectedCharger) {
      setMessage('Please select a charger');
      setMessageType('error');
      return;
    }

    setUploading(true);
    setMessage('Uploading and processing CSV...');
    setMessageType('info');

    try {
      const formData = new FormData();
      formData.append('csv', selectedFile);

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
      
      setMessage(`âœ… Import successful! Processed: ${result.processed}, Imported: ${result.imported}, Deleted: ${result.deleted_count} old sessions`);
      setMessageType('success');
      setUploading(false);
      setSelectedFile(null);
      setSelectedCharger(null);
      setCsvPreview([]);
      setShowPreview(false);
      
      // Reset file input
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (err: any) {
      setMessage(`Import failed: ${err.message}`);
      setMessageType('error');
      setUploading(false);
    }
  };

  const selectedChargerData = chargers.find(c => c.id === selectedCharger);

  return (
    <div className="csv-upload-container" style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
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
          Charger Sessions Import
        </h1>
        <p style={{ color: '#6b7280', fontSize: '16px' }}>
          Import charging sessions from CSV file for a specific charger
        </p>
      </div>

      {message && (
        <div style={{
          padding: '18px 24px',
          marginBottom: '32px',
          borderRadius: '16px',
          backgroundColor: messageType === 'success' ? '#d4edda' : messageType === 'error' ? '#f8d7da' : '#d1ecf1',
          color: messageType === 'success' ? '#155724' : messageType === 'error' ? '#721c24' : '#0c5460',
          border: `2px solid ${messageType === 'success' ? '#c3e6cb' : messageType === 'error' ? '#f5c6cb' : '#bee5eb'}`,
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
                Select Charger
              </h2>
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                Choose the charger to import sessions for
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
              Charger *
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
              <option value="">-- Select a charger --</option>
              {chargers.map(charger => (
                <option key={charger.id} value={charger.id}>
                  {charger.name} - {charger.brand}
                </option>
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
                Selected Charger Details:
              </h3>
              <div style={{ fontSize: '13px', color: '#047857' }}>
                <p><strong>Name:</strong> {selectedChargerData.name}</p>
                <p><strong>Brand:</strong> {selectedChargerData.brand}</p>
                <p><strong>Type:</strong> {selectedChargerData.connection_type}</p>
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
                Upload CSV File
              </h2>
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                Select your charger sessions CSV file
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
              previewCSV(file);
            } else {
              setMessage('Please select a CSV file');
              setMessageType('error');
            }
          }}>
            <FileSpreadsheet size={48} color="#9ca3af" style={{ margin: '0 auto 16px' }} />
            <p style={{ fontSize: '16px', color: '#4b5563', marginBottom: '8px', fontWeight: '500' }}>
              {selectedFile ? selectedFile.name : 'Drag & drop CSV file here'}
            </p>
            <p style={{ fontSize: '13px', color: '#9ca3af' }}>
              or click to select file
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

          <button
            onClick={handleUpload}
            disabled={!selectedFile || !selectedCharger || uploading}
            style={{
              width: '100%', 
              padding: '16px', 
              background: (!selectedFile || !selectedCharger || uploading) ? '#9ca3af' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none', 
              borderRadius: '12px', 
              fontSize: '16px', 
              fontWeight: '700',
              cursor: (!selectedFile || !selectedCharger || uploading) ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: (!selectedFile || !selectedCharger || uploading) ? 'none' : '0 8px 20px rgba(102, 126, 234, 0.3)',
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
                Processing...
              </>
            ) : (
              <>
                <Upload size={20} />
                Import Sessions
              </>
            )}
          </button>
        </div>
      </div>

      {/* CSV Preview */}
      {showPreview && csvPreview.length > 0 && (
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
            gap: '16px', 
            marginBottom: '24px',
            paddingBottom: '16px',
            borderBottom: '2px solid #f3f4f6'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(245, 158, 11, 0.3)'
            }}>
              <FileSpreadsheet size={24} color="white" strokeWidth={2.5} />
            </div>
            <div>
              <h2 style={{ 
                fontSize: '20px', 
                fontWeight: '700', 
                marginBottom: '4px',
                color: '#1f2937'
              }}>
                CSV Preview (First 5 rows)
              </h2>
              <p style={{ fontSize: '13px', color: '#6b7280' }}>
                Review the data before importing
              </p>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              fontSize: '13px'
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  {Object.keys(csvPreview[0]).map((key, idx) => (
                    <th key={idx} style={{ 
                      padding: '12px', 
                      textAlign: 'left',
                      fontWeight: '600',
                      color: '#374151'
                    }}>
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvPreview.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    {Object.values(row).map((value: any, cellIdx) => (
                      <td key={cellIdx} style={{ 
                        padding: '12px',
                        color: '#6b7280'
                      }}>
                        {value}
                      </td>
                    ))}
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