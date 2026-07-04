import { supabase } from '../lib/supabase';
import { debugLogger } from './debugLogger';

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

export async function checkUserStatus(userId: string, caller?: string): Promise<SecurityCheckResult> {
  const callerLabel = caller ?? 'unknown';
  debugLogger.log('checkUserStatus_request', { userId, caller: callerLabel });

  debugLogger.log('checkUserStatus_before_query', { caller: callerLabel, userId, t: Date.now() });
  const { data, error, status } = await supabase
    .from('users')
    .select('status, employment_status, role')
    .eq('id', userId)
    .single();
  debugLogger.log('checkUserStatus_after_query', { caller: callerLabel, userId, t: Date.now() });

  console.log('[STATUS CHECK]', {
    userId,
    data,
    error,
    code: (error as { code?: string })?.code,
    status: data?.status,
  });

  debugLogger.log('checkUserStatus_response', {
    userId,
    hasData: !!data,
    dataStatus: data?.status,
    hasError: !!error,
    errorCode: (error as { code?: string })?.code,
    errorMessage: error?.message,
  });

  if (error || !data) {
    const code = (error as { code?: string })?.code;
    console.warn('[SECURITY] checkUserStatus query failed', {
      userId,
      code,
      message: error?.message,
      httpStatus: status,
    });

    // If the profile row hasn't been created yet (PostgREST code PGRST116) let the
    // auth flow continue — syncUserProfile() runs immediately afterward and will
    // upsert the missing row. For any other error we fail closed as before.
    if (code === 'PGRST116') {
      debugLogger.log('checkUserStatus_PGRST116', { userId, allowed: true });
      return { allowed: true };
    }

    debugLogger.log('checkUserStatus_error', { userId, code, allowed: false });
    return { allowed: false, error: 'Unable to verify account status.' };
  }

  if (data.status === 'suspended') {
    debugLogger.log('checkUserStatus_suspended', { userId, allowed: false });
    return { allowed: false, error: 'Your account is suspended. Contact support.' };
  }
  console.log('[MODERATION]', { userId, status: data.status, path: 'checkUserStatus' });
  if (data.status === 'banned') {
    debugLogger.log('checkUserStatus_banned', { userId, allowed: false });
    return { allowed: false, error: 'Your account has been banned.' };
  }

  const staffRoles = ['moderator', 'support_agent', 'operations_staff'];
  if (staffRoles.includes(data.role ?? '') && data.employment_status !== 'active') {
    const friendly = {
      inactive: 'Your staff account is inactive. Please contact your administrator.',
      suspended: 'Your staff account is suspended. Please contact your administrator.',
      resigned: 'Your staff account has been marked as resigned. Access is no longer available.',
    };
    debugLogger.log('checkUserStatus_employment_status', { userId, status: data.employment_status, allowed: false });
    return {
      allowed: false,
      error: friendly[data.employment_status as keyof typeof friendly] ?? 'Your staff account is not active. Please contact your administrator.',
    };
  }

  debugLogger.log('checkUserStatus_allowed', { userId, status: data.status, allowed: true });
  return { allowed: true };
}
