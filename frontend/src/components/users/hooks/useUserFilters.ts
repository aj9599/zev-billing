import { useState } from 'react';

export function useUserFilters() {
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  return {
    selectedBuildingId,
    searchQuery,
    setSelectedBuildingId,
    setSearchQuery
  };
}