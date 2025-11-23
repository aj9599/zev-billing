import { UsersIcon, Plus, Archive, HelpCircle } from 'lucide-react';

interface UsersHeaderProps {
  showArchive: boolean;
  setShowArchive: (show: boolean) => void;
  setShowInstructions: (show: boolean) => void;
  openModal: () => void;
  t: (key: string) => string;
}

export default function UsersHeader({
  showArchive,
  setShowArchive,
  setShowInstructions,
  openModal,
  t
}: UsersHeaderProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', gap: '15px', flexWrap: 'wrap' }}>
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
          <UsersIcon size={36} style={{ color: '#667eea' }} />
          {t('users.title')}
        </h1>
        <p style={{ color: '#6b7280', fontSize: '16px' }}>
          {showArchive ? t('users.archivedUsersSubtitle') : t('users.subtitle')}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setShowArchive(!showArchive)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
            backgroundColor: showArchive ? '#6b7280' : '#8b5cf6', color: 'white',
            border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
          }}
        >
          <Archive size={18} />
          {showArchive ? t('users.showActive') : t('users.showArchive')}
        </button>
        <button
          onClick={() => setShowInstructions(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
            backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
          }}
        >
          <HelpCircle size={18} />
          {t('users.setupInstructions')}
        </button>
        <button
          onClick={openModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          <Plus size={18} />
          {t('users.addUser')}
        </button>
      </div>
    </div>
  );
}