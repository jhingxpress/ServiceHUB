import { PostgrestError } from '@supabase/supabase-js';
import { useToast } from '../hooks/useToast';

export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'An unexpected error occurred';
}

export function handleSupabaseError(error: PostgrestError | null): string {
  if (!error) return 'An unexpected error occurred';
  
  switch (error.code) {
    case '23505':
      return 'This record already exists';
    case '23503':
      return 'Referenced record not found';
    case '23514':
      return 'Invalid data provided';
    case 'PGRST116':
      return 'Record not found';
    case 'PGRST301':
      return 'Permission denied';
    default:
      return error.message || 'An unexpected error occurred';
  }
}

export function useErrorHandler() {
  const { showToast } = useToast();

  const showError = (error: unknown, fallbackMessage?: string) => {
    const message = getErrorMessage(error);
    console.error('Error:', error);
    showToast(fallbackMessage || message, 'error');
  };

  const showSuccess = (message: string) => {
    showToast(message, 'success');
  };

  const showWarning = (message: string) => {
    showToast(message, 'warning');
  };

  const showInfo = (message: string) => {
    showToast(message, 'info');
  };

  return { showError, showSuccess, showWarning, showInfo };
}
