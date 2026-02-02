import { api } from '../../../api/client';

export function useUserDeletion(loadData: () => Promise<void>) {
  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this user?')) {
      try {
        await api.deleteUser(id);
        await loadData();
      } catch (err) {
        let message = 'Failed to delete user';
        if (err instanceof Error) {
          try {
            const parsed = JSON.parse(err.message);
            if (parsed.detail) {
              message = parsed.detail;
            }
          } catch {
            if (err.message) {
              message = err.message;
            }
          }
        }
        alert(message);
      }
    }
  };

  return { handleDelete };
}