import { api } from '../../../api/client';

export function useUserDeletion(loadData: () => Promise<void>) {
  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this user?')) {
      try {
        await api.deleteUser(id);
        await loadData();
      } catch (err) {
        alert('Failed to delete user');
      }
    }
  };

  return { handleDelete };
}