import { useState, useEffect, useCallback } from 'react';
import { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface UseSupabaseQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: PostgrestError | null;
  refetch: () => Promise<void>;
}

export function useSupabaseQuery<T>(
  query: () => Promise<{ data: T | null; error: PostgrestError | null }>,
  dependencies: any[] = []
): UseSupabaseQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PostgrestError | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: result, error: err } = await query();
    if (err) setError(err);
    else setData(result);
    setLoading(false);
  }, dependencies);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

interface UseSupabaseMutationResult<T> {
  data: T | null;
  loading: boolean;
  error: PostgrestError | null;
  mutate: (variables?: any) => Promise<void>;
  reset: () => void;
}

export function useSupabaseMutation<T>(
  mutation: (variables?: any) => Promise<{ data: T | null; error: PostgrestError | null }>
): UseSupabaseMutationResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  const mutate = useCallback(async (variables?: any) => {
    setLoading(true);
    setError(null);
    const { data: result, error: err } = await mutation(variables);
    if (err) setError(err);
    else setData(result);
    setLoading(false);
  }, [mutation]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, mutate, reset };
}
