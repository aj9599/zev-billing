import { Building, Search } from 'lucide-react';
import type { User as UserType, Building as BuildingType } from '../../types';
import { getUserCountForBuilding } from './utils/userUtils';

interface BuildingFilterCardsProps {
  buildings: BuildingType[];
  users: UserType[];
  selectedBuildingId: number | 'all';
  searchQuery: string;
  setSelectedBuildingId: (id: number | 'all') => void;
  setSearchQuery: (query: string) => void;
  isMobile: boolean;
  t: (key: string) => string;
}

export default function BuildingFilterCards({
  buildings,
  users,
  selectedBuildingId,
  searchQuery,
  setSelectedBuildingId,
  setSearchQuery,
  isMobile,
  t
}: BuildingFilterCardsProps) {
  const filteredBuildingsForCards = buildings.filter(b =>
    !b.is_group && b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Search bar - card style */}
      <div style={{
        backgroundColor: 'white',
        padding: isMobile ? '12px' : '12px 16px',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <Search size={18} color="#9ca3af" style={{ flexShrink: 0 }} />
        <input
          type="text"
          placeholder={t('users.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            padding: '8px 0',
            border: 'none',
            fontSize: '14px',
            outline: 'none',
            backgroundColor: 'transparent',
            color: '#1f2937'
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '0 4px',
              lineHeight: 1
            }}
          >
            &times;
          </button>
        )}
      </div>

      {/* Building Filter Pills */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '20px',
        flexWrap: 'wrap'
      }}>
        {/* All users pill */}
        <button
          onClick={() => setSelectedBuildingId('all')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: isMobile ? '6px 12px' : '8px 16px',
            backgroundColor: selectedBuildingId === 'all' ? '#667eea' : 'white',
            color: selectedBuildingId === 'all' ? 'white' : '#374151',
            borderRadius: '20px',
            border: selectedBuildingId === 'all' ? '1px solid #667eea' : '1px solid #e5e7eb',
            boxShadow: selectedBuildingId === 'all' ? '0 2px 8px rgba(102, 126, 234, 0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap'
          }}
        >
          <Building size={14} />
          {t('users.allUsers')}
          <span style={{
            fontSize: '11px',
            fontWeight: '700',
            padding: '1px 6px',
            borderRadius: '10px',
            backgroundColor: selectedBuildingId === 'all' ? 'rgba(255,255,255,0.2)' : '#f3f4f6'
          }}>
            {users.filter(u => u.is_active).length}
          </span>
        </button>

        {filteredBuildingsForCards.map(building => {
          const userCount = getUserCountForBuilding(building.id, users);
          const isSelected = selectedBuildingId === building.id;
          return (
            <button
              key={building.id}
              onClick={() => setSelectedBuildingId(building.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: isMobile ? '6px 12px' : '8px 16px',
                backgroundColor: isSelected ? '#667eea' : 'white',
                color: isSelected ? 'white' : '#374151',
                borderRadius: '20px',
                border: isSelected ? '1px solid #667eea' : '1px solid #e5e7eb',
                boxShadow: isSelected ? '0 2px 8px rgba(102, 126, 234, 0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '600',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap'
              }}
            >
              {building.name}
              <span style={{
                fontSize: '11px',
                fontWeight: '700',
                padding: '1px 6px',
                borderRadius: '10px',
                backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : '#f3f4f6'
              }}>
                {userCount}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
