import { UsersIcon, Plus, Archive, HelpCircle } from 'lucide-react';

interface UsersHeaderProps {
  showArchive: boolean;
  setShowArchive: (show: boolean) => void;
  setShowInstructions: (show: boolean) => void;
  openModal: () => void;
  isMobile: boolean;
  t: (key: string) => string;
}

export default function UsersHeader({
  showArchive,
  setShowArchive,
  setShowInstructions,
  openModal,
  isMobile,
  t
}: UsersHeaderProps) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: isMobile ? '20px' : '28px',
      gap: '15px',
      flexWrap: 'wrap'
    }}>
      <div>
        <h1 style={{
          fontSize: isMobile ? '24px' : '32px',
          fontWeight: '800',
          marginBottom: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? '8px' : '12px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          <UsersIcon size={isMobile ? 24 : 32} style={{ color: '#667eea' }} />
          {t('users.title')}
        </h1>
        <p style={{ color: '#6b7280', fontSize: isMobile ? '13px' : '15px', margin: 0 }}>
          {showArchive ? t('users.archivedUsersSubtitle') : t('users.subtitle')}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setShowArchive(!showArchive)}
          className="u-btn-secondary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: isMobile ? '8px 14px' : '8px 16px',
            backgroundColor: showArchive ? '#6b7280' : 'white',
            color: showArchive ? 'white' : '#667eea',
            border: showArchive ? 'none' : '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <Archive size={16} />
          {!isMobile && (showArchive ? t('users.showActive') : t('users.showArchive'))}
        </button>
        <button
          onClick={() => setShowInstructions(true)}
          className="u-btn-secondary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: isMobile ? '8px 14px' : '8px 16px',
            backgroundColor: 'white',
            color: '#667eea',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <HelpCircle size={16} />
          {!isMobile && t('users.setupInstructions')}
        </button>
        <button
          onClick={openModal}
          className="u-btn-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: isMobile ? '8px 14px' : '8px 16px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
          }}
        >
          <Plus size={16} />
          {isMobile ? '+' : t('users.addUser')}
        </button>
      </div>
    </div>
  );
}
