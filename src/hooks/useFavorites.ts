import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { FavoriteProvider } from '../types';

export function useFavorites() {
  const { user } = useAuthStore();
  const [favorites, setFavorites] = useState<FavoriteProvider[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFavorites = useCallback(async () => {
    if (!user || user.role !== 'customer') return;
    setLoading(true);
    const { data } = await supabase
      .from('favorite_providers')
      .select('*, provider:providers(*)')
      .eq('customer_id', user.id);
    setFavorites(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchFavorites(); }, [fetchFavorites]);

  const isFavorite = useCallback((providerId: string) => {
    return favorites.some((f) => f.provider_id === providerId);
  }, [favorites]);

  const toggleFavorite = useCallback(async (providerId: string) => {
    if (!user || user.role !== 'customer') return;

    const existing = favorites.find((f) => f.provider_id === providerId);
    if (existing) {
      await supabase.from('favorite_providers').delete().eq('id', existing.id);
      setFavorites((prev) => prev.filter((f) => f.provider_id !== providerId));
    } else {
      const { data } = await supabase
        .from('favorite_providers')
        .insert({ customer_id: user.id, provider_id: providerId })
        .select('*, provider:providers(*)')
        .single();
      if (data) setFavorites((prev) => [...prev, data]);
    }
  }, [favorites, user]);

  return { favorites, loading, isFavorite, toggleFavorite, refresh: fetchFavorites };
}
