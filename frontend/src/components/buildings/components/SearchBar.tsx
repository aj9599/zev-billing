import { Search } from 'lucide-react';
import { useTranslation } from '../../../i18n';

interface SearchBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isMobile: boolean;
}

export default function SearchBar({ searchQuery, setSearchQuery, isMobile }: SearchBarProps) {
  const { t } = useTranslation();

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ position: 'relative', maxWidth: isMobile ? '100%' : '400px' }}>
        <Search
          size={20}
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#6b7280'
          }}
        />
        <input
          type="text"
          placeholder={t('buildings.searchPlaceholder')}
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
  );
}