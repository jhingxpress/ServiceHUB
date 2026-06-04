import { supabase } from '../lib/supabase';

export type RateLimitAction =
  | 'login'
  | 'register'
  | 'booking_create'
  | 'message_send'
  | 'review_create'
  | 'report_create'
  | 'password_reset';

export interface SecurityCheckResult {
  allowed: boolean;
  error?: string;
  remaining?: number;
}

/**
 * Check if login is rate-limited or account is locked
 */
export async function checkLoginAllowed(email: string): Promise<SecurityCheckResult> {
  const { data, error } = await supabase.rpc('is_account_locked', { p_email: email });
  if (error) {
    console.error('is_account_locked error:', error);
    return { allowed: true }; // Fail open on RPC error
  }
  if (data === true) {
    return {
      allowed: false,
      error: 'Too many failed attempts. Account locked for 15 minutes.',
    };
  }
  return { allowed: true };
}

/**
 * Log a login attempt to the database
 */
export async function logLoginAttempt(
  email: string,
  success: boolean
): Promise<void> {
  try {
    await supabase.rpc('log_login_attempt', {
      p_email: email,
      p_ip: null, // Supabase edge functions can fill IP; client lacks direct access
      p_ua: null,
      p_success: success,
    });
  } catch (e) {
    console.error('logLoginAttempt error:', e);
  }
}

/**
 * Check if registration is rate-limited
 */
export async function checkRegistrationAllowed(): Promise<SecurityCheckResult> {
  try {
    const { data, error } = await supabase.rpc('is_registration_rate_limited', { p_ip: null });
    if (error) {
      console.error('is_registration_rate_limited error:', error);
      return { allowed: true };
    }
    if (data === true) {
      return {
        allowed: false,
        error: 'Registration limit reached from this device. Please try again in 1 hour.',
      };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

/**
 * Log a registration attempt
 */
export async function logRegistrationAttempt(email: string): Promise<void> {
  try {
    await supabase.rpc('log_registration_attempt', {
      p_ip: null,
      p_ua: null,
      p_email: email,
    });
  } catch (e) {
    console.error('logRegistrationAttempt error:', e);
  }
}

/**
 * Verify a reCAPTCHA v3 token via Supabase Edge Function.
 */
export async function verifyRecaptchaToken(
  token: string,
  action: string
): Promise<SecurityCheckResult> {
  try {
    const { data, error } = await supabase.functions.invoke('verify-recaptcha', {
      body: { token, action },
    });
    if (error) {
      let errorBody = null;
      try {
        const ctx = (error as unknown as { context?: { bodyUsed?: boolean; text?: () => Promise<string> } }).context;
        if (ctx && !ctx.bodyUsed) {
          errorBody = await ctx.text?.();
        }
      } catch {
        // Unable to read error body
      }
      const parsed = errorBody ? JSON.parse(errorBody) : null;
      return { allowed: false, error: parsed?.error || 'Verification service unavailable.' };
    }
    if (!data?.success) {
      return {
        allowed: false,
        error: data?.error || 'reCAPTCHA verification failed. Please try again.',
      };
    }
    return { allowed: true };
  } catch (e) {
    console.error('[verifyRecaptchaToken] Network error during verification');
    return { allowed: false, error: 'Network error during verification.' };
  }
}

export async function checkUserStatus(userId: string): Promise<SecurityCheckResult> {
  const { data, error } = await supabase
    .from('users')
    .select('status')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return { allowed: false, error: 'Unable to verify account status.' };
  }

  if (data.status === 'suspended') {
    return { allowed: false, error: 'Your account is suspended. Contact support.' };
  }
  if (data.status === 'banned') {
    return { allowed: false, error: 'Your account has been banned.' };
  }

  return { allowed: true };
}
