import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import type { Building, User } from '../../../types';

export function useBillingData() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [buildingsData, usersData] = await Promise.all([
        api.getBuildings(),
        api.getUsers(undefined, true)
      ]);
      setBuildings(buildingsData.filter(b => !b.is_group));
      setUsers(usersData);
    } catch (err) {
      console.error('Failed to load billing data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return {
    buildings,
    users,
    loading,
    error,
    refresh: loadData
  };
}