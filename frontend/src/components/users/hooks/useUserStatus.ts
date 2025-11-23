import type { User as UserType } from '../../../types';
import { api } from '../../../api/client';

export function useUserStatus(loadData: () => Promise<void>) {
  const handleToggleActive = async (user: UserType) => {
    try {
      await api.updateUser(user.id, { ...user, is_active: !user.is_active });
      await loadData();
    } catch (err) {
      alert('Failed to update user status');
    }
  };

  return { handleToggleActive };
}