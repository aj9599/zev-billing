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
  t: (key: string) => string;
}

export default function BuildingFilterCards({
  buildings,
  users,
  selectedBuildingId,
  searchQuery,
  setSelectedBuildingId,
  setSearchQuery,
  t
}: BuildingFilterCardsProps) {
  const filteredBuildingsForCards = buildings.filter(b =>
    !b.is_group && b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Search bar */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
          <input
            type="text"
            placeholder={t('users.searchPlaceholder')}
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

      {/* Building Filter Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: '16px',
        marginBottom: '30px'
      }}>
        <div
          onClick={() => setSelectedBuildingId('all')}
          style={{
            padding: '20px',
            backgroundColor: selectedBuildingId === 'all' ? '#667eea' : 'white',
            color: selectedBuildingId === 'all' ? 'white' : '#1f2937',
            borderRadius: '12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: selectedBuildingId === 'all' ? '2px solid #667eea' : '2px solid transparent'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Building size={24} />
            <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
              {t('users.allUsers')}
            </h3>
          </div>
          <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>
            {users.filter(u => u.is_active).length} {t('users.active')}
          </p>
        </div>

        {filteredBuildingsForCards.map(building => {
          const userCount = getUserCountForBuilding(building.id, users);
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
                {userCount} {t('users.active')} {userCount === 1 ? t('users.user') : t('users.users')}
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}