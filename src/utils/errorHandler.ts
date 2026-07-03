import { PostgrestError } from '@supabase/supabase-js';
import { useToast } from '../hooks/useToast';

const NETWORK_ERROR_PATTERNS = [
  /network request failed/i,
  /failed to fetch/i,
  /unable to resolve host/i,
  /no internet/i,
  /offline/i,
  /timeout/i,
  /abort/i,
  /connection refused/i,
  /could not connect/i,
  /ssl/i,
  /network error/i,
];

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (typeof error === 'string') return NETWORK_ERROR_PATTERNS.some((p) => p.test(error));
  if (error instanceof Error) return NETWORK_ERROR_PATTERNS.some((p) => p.test(error.message));
  if (error && typeof error === 'object' && 'message' in error) {
    return NETWORK_ERROR_PATTERNS.some((p) => p.test(String(error.message)));
  }
  if (error && typeof error === 'object' && 'code' in error) {
    return String(error.code).toLowerCase().includes('network') || String(error.code).toLowerCase().includes('timeout');
  }
  return false;
}

export function getNetworkErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    if (/timeout/i.test(error)) return 'The request timed out. Please check your connection and try again.';
    if (/abort/i.test(error)) return 'The request was cancelled. Please try again.';
  }
  if (error instanceof Error || (error && typeof error === 'object' && 'message' in error)) {
    const message = String((error as Error).message ?? '');
    if (/timeout/i.test(message)) return 'The request timed out. Please check your connection and try again.';
    if (/abort/i.test(message)) return 'The request was cancelled. Please try again.';
  }
  return 'No internet connection or server unavailable. Please check your connection and try again.';
}

export function getErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return getNetworkErrorMessage(error);
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

  const showNetworkError = (error?: unknown, context?: string) => {
    const base = getNetworkErrorMessage(error);
    const message = context ? `${context} ${base}` : base;
    console.error('Network error:', error);
    showToast(message, 'error');
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

  return { showError, showNetworkError, showSuccess, showWarning, showInfo };
}
