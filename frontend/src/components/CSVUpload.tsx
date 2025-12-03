import { useState } from 'react';
import { Upload, Database, AlertCircle, FileSpreadsheet, CheckCircle } from 'lucide-react';
import { useTranslation } from '../i18n';

export default function CSVUpload() {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.csv')) {
        setSelectedFile(file);
        setMessage('');
      } else {
        setMessage(t('csvUpload.invalidFileType'));
        setMessageType('error');
        setSelectedFile(null);
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage(t('csvUpload.noFileSelected'));
      setMessageType('error');
      return;
    }

    setUploading(true);
    setMessage(t('csvUpload.uploading'));
    setMessageType('info');

    try {
      // TODO: Implement CSV upload API endpoint
      // const formData = new FormData();
      // formData.append('csv', selectedFile);
      // await api.uploadCSV(formData);
      
      // Placeholder success message
      setTimeout(() => {
        setMessage(t('csvUpload.uploadSuccess'));
        setMessageType('success');
        setUploading(false);
        setSelectedFile(null);
      }, 2000);
    } catch (err) {
      setMessage(t('csvUpload.uploadFailed'));
      setMessageType('error');
      setUploading(false);
    }
  };

  return (
    <div className="csv-upload-container" style={{ maxWidth: '1200px', margin: '0 auto' }}>
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
          {t('csvUpload.title')}
        </h1>
        <p style={{ color: '#6b7280', fontSize: '16px' }}>
          {t('csvUpload.subtitle')}
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

      <div className="csv-upload-grid" style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', 
        gap: '30px' 
      }}>
        {/* Upload Card */}
        <div className="upload-card" style={{ 
          backgroundColor: 'white', 
          borderRadius: '20px', 
          padding: '40px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
          border: '1px solid #f3f4f6',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.12)';
          e.currentTarget.style.transform = 'translateY(-4px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.08)';
          e.currentTarget.style.transform = 'translateY(0)';
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
                {t('csvUpload.uploadFile')}
              </h2>
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                {t('csvUpload.selectCSVFile')}
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
            transition: 'all 0.3s ease'
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

          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            style={{
              width: '100%', 
              padding: '16px', 
              background: (!selectedFile || uploading) ? '#9ca3af' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none', 
              borderRadius: '12px', 
              fontSize: '16px', 
              fontWeight: '700',
              cursor: (!selectedFile || uploading) ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: (!selectedFile || uploading) ? 'none' : '0 8px 20px rgba(102, 126, 234, 0.3)',
              letterSpacing: '0.5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => {
              if (selectedFile && !uploading) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 12px 30px rgba(102, 126, 234, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedFile && !uploading) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.3)';
              }
            }}
          >
            <Upload size={20} />
            {uploading ? t('csvUpload.uploading') : t('csvUpload.upload')}
          </button>
        </div>

        {/* Instructions Card */}
        <div className="instructions-card" style={{ 
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
                {t('csvUpload.instructions')}
              </h2>
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                {t('csvUpload.importantInfo')}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              { title: t('csvUpload.step1Title'), desc: t('csvUpload.step1Desc'), color: '#667eea' },
              { title: t('csvUpload.step2Title'), desc: t('csvUpload.step2Desc'), color: '#10b981' },
              { title: t('csvUpload.step3Title'), desc: t('csvUpload.step3Desc'), color: '#f59e0b' },
              { title: t('csvUpload.step4Title'), desc: t('csvUpload.step4Desc'), color: '#ef4444' }
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
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
                e.currentTarget.style.transform = 'translateX(8px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#f9fafb';
                e.currentTarget.style.transform = 'translateX(0)';
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
              {t('csvUpload.warning')}
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

        @media (max-width: 768px) {
          .csv-upload-container {
            padding: 0 !important;
          }

          .csv-upload-header h1 {
            font-size: 24px !important;
          }

          .csv-upload-header h1 svg {
            width: 24px !important;
            height: 24px !important;
          }

          .csv-upload-header p {
            font-size: 14px !important;
          }

          .csv-upload-grid {
            grid-template-columns: 1fr !important;
            gap: 20px !important;
          }

          .upload-card, .instructions-card {
            padding: 24px !important;
          }

          .upload-card > div:first-child,
          .instructions-card > div:first-child {
            flex-direction: column;
            align-items: flex-start !important;
            text-align: left;
          }

          .upload-card > div:first-child > div:first-child,
          .instructions-card > div:first-child > div:first-child {
            width: 48px !important;
            height: 48px !important;
          }

          .upload-card > div:first-child > div:first-child svg,
          .instructions-card > div:first-child > div:first-child svg {
            width: 24px !important;
            height: 24px !important;
          }

          .upload-card h2, .instructions-card h2 {
            font-size: 20px !important;
          }

          .upload-card h3, .instructions-card h3 {
            font-size: 14px !important;
          }

          .upload-card p, .instructions-card p {
            font-size: 12px !important;
          }

          .upload-card button {
            font-size: 15px !important;
            padding: 14px !important;
          }
        }

        @media (max-width: 480px) {
          .csv-upload-header h1 {
            font-size: 20px !important;
            gap: 8px !important;
          }

          .csv-upload-header h1 svg {
            width: 20px !important;
            height: 20px !important;
          }

          .upload-card, .instructions-card {
            padding: 20px !important;
            border-radius: 16px !important;
          }

          .upload-card > div:first-child,
          .instructions-card > div:first-child {
            margin-bottom: 24px !important;
            padding-bottom: 16px !important;
          }

          .upload-card h2, .instructions-card h2 {
            font-size: 18px !important;
          }
        }
      `}</style>
    </div>
  );
}