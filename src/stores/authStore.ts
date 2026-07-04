import { create } from 'zustand';
import { Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../lib/supabase';
import { User, Provider } from '../types';
import { registerPushToken, removePushToken } from '../services/notificationService';
import { checkLoginAllowed, logLoginAttempt, checkUserStatus } from '../services/securityService';
import { useNotificationStore } from './notificationStore';
import { BETA_MODE } from '../config/featureFlags';
import { debugLogger } from '../services/debugLogger';

let _moderationAlertShown = false;

function showModerationAlert(error?: string) {
  console.log('[MODERATION ALERT]', error);
  if (_moderationAlertShown) return;
  const lower = error?.toLowerCase() ?? '';
  if (lower.includes('suspended')) {
    _moderationAlertShown = true;
    Alert.alert(
      'Account Suspended',
      'Your account has been temporarily suspended.\n\nPlease contact TAGA support for assistance.'
    );
    return;
  }
  if (lower.includes('banned')) {
    _moderationAlertShown = true;
    Alert.alert(
      'Account Banned',
      'Your account has been permanently banned due to violations of TAGA policies.\n\nIf you believe this is a mistake, please contact TAGA support.'
    );
    return;
  }
}

function resetModerationAlert() {
  _moderationAlertShown = false;
}

function unsubscribeFromModerationRealtime(
  getState: () => AuthState,
  setState: (partial: Partial<AuthState>) => void,
) {
  const unsub = getState().realtimeModerationUnsubscribe;
  if (unsub) {
    unsub();
    setState({ realtimeModerationUnsubscribe: null });
  }
}

function subscribeToModerationRealtime(
  userId: string,
  getState: () => AuthState,
  setState: (partial: Partial<AuthState>) => void,
) {
  unsubscribeFromModerationRealtime(getState, setState);
  console.log('[REALTIME MODERATION] subscribed', { userId });
  const channel = supabase
    .channel(`moderation-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${userId}`,
      },
      (payload) => {
        const newStatus = (payload.new as { status?: string })?.status;
        console.log('[REALTIME MODERATION] status changed', { userId, newStatus });
        if (newStatus === 'suspended' || newStatus === 'banned') {
          console.log('[REALTIME MODERATION] signing out', { userId, newStatus });
          showModerationAlert(
            newStatus === 'banned'
              ? 'Your account has been banned.'
              : 'Your account is suspended. Contact support.',
          );
          getState().signOut().catch((e) =>
            console.error('[REALTIME MODERATION] signOut error:', e),
          );
        }
      },
    )
    .subscribe();
  setState({
    realtimeModerationUnsubscribe: () => {
      supabase.removeChannel(channel);
    },
  });
}

interface SignUpData {
  email: string;
  password: string;
  fullName: string;
  role: 'customer' | 'provider';
  phone?: string;
  acceptedTerms?: boolean;
}

interface VerificationResult {
  verified: boolean;
  role?: User['role'];
  providerStatus?: Provider['status'] | null;
}

interface AuthState {
  user: User | null;
  providerProfile: Provider | null;
  isLoading: boolean;
  isInitialized: boolean;
  isAuthenticating: boolean;
  sessionExpiresAt: number | null;
  authListenerUnsubscribe: (() => void) | null;
  realtimeModerationUnsubscribe: (() => void) | null;
  emailJustVerified: boolean;
  setEmailJustVerified: (val: boolean) => void;
  passwordResetMode: boolean;
  setPasswordResetMode: (val: boolean) => void;
  mustChangePassword: boolean;
  setMustChangePassword: (val: boolean) => void;
  currentPassword: string | null;
  changePassword: (newPassword: string, currentPassword?: string) => Promise<{ success: boolean; error?: string }>;
  initialize: () => Promise<void>;
  validateSession: () => Promise<void>;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (data: SignUpData, captchaToken?: string) => Promise<void>;
  resendVerificationEmail: (email: string) => Promise<void>;
  checkEmailVerified: () => Promise<VerificationResult>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Omit<User, 'id' | 'created_at'>>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshProviderProfile: () => Promise<void>;
  completeProfileSetup: (data: {
    full_name: string;
    phone: string;
    role: 'customer' | 'provider';
    accepted_terms_at: string;
    accepted_privacy_at: string;
    accepted_terms_version: string;
  }) => Promise<void>;
}

async function fetchProviderProfile(userId: string): Promise<Provider | null> {
  const { data } = await supabase
    .from('providers')
    .select('*')
    .eq('id', userId)
    .single();
  return data as Provider | null;
}

async function syncUserProfile(sessionUser: { id: string; email?: string; user_metadata?: Record<string, unknown>; email_confirmed_at?: string | null }): Promise<{ profile: User | null; providerProfile: Provider | null }> {
  const t0 = Date.now();
  debugLogger.log('syncUserProfile_enter', { userId: sessionUser.id, t: t0 });
  console.log('[TRACE][syncUserProfile] start', {
    userId: sessionUser.id,
    email: sessionUser.email ?? null,
    email_confirmed_at: sessionUser.email_confirmed_at ?? null,
  });
  const isVerified = !!sessionUser.email_confirmed_at;

  debugLogger.log('syncUserProfile_before_select', { userId: sessionUser.id, t: Date.now() });
  let { data: profile, error: selectError } = await supabase
    .from('users')
    .select('*')
    .eq('id', sessionUser.id)
    .single();
  debugLogger.log('syncUserProfile_after_select', { hasProfile: !!profile, error: selectError?.code, ms: Date.now() - t0 });

  if (!profile) {
    // Trigger may not have fired; create profile manually
    debugLogger.log('syncUserProfile_before_upsert', { userId: sessionUser.id, t: Date.now() });
    const { data: newProfile, error: upsertError } = await supabase
      .from('users')
      .upsert({
        id: sessionUser.id,
        email: sessionUser.email ?? '',
        full_name: (sessionUser.user_metadata?.full_name as string | undefined) ?? (sessionUser.user_metadata?.name as string | undefined) ?? '',
        avatar_url: (sessionUser.user_metadata?.avatar_url as string | undefined) ?? (sessionUser.user_metadata?.picture as string | undefined) ?? null,
        role: (sessionUser.user_metadata?.role as string | undefined) ?? 'customer',
        email_verified: isVerified,
      })
      .select()
      .single();
    debugLogger.log('syncUserProfile_after_upsert', { hasProfile: !!newProfile, error: upsertError?.code, ms: Date.now() - t0 });
    profile = newProfile as User | null;
  } else if (profile.email_verified !== isVerified) {
    // public.users.email_verified is stale (e.g. user verified email after initial signup)
    console.log('[AUTH] syncUserProfile: syncing email_verified', {
      id: sessionUser.id,
      old: profile.email_verified,
      new: isVerified,
    });
    debugLogger.log('syncUserProfile_before_update', { userId: sessionUser.id, t: Date.now() });
    const { data: updatedProfile, error: updateError } = await supabase
      .from('users')
      .update({ email_verified: isVerified, updated_at: new Date().toISOString() })
      .eq('id', sessionUser.id)
      .select()
      .single();
    debugLogger.log('syncUserProfile_after_update', { hasProfile: !!updatedProfile, error: updateError?.code, ms: Date.now() - t0 });
    if (!updateError && updatedProfile) {
      profile = updatedProfile as User | null;
    } else {
      console.log('[AUTH] syncUserProfile: DB update failed, correcting in-memory:', updateError?.message);
      profile.email_verified = isVerified;
    }
  }

  debugLogger.log('syncUserProfile_before_providerFetch', { role: profile?.role, t: Date.now() });
  const providerProfile =
    profile?.role === 'provider'
      ? await fetchProviderProfile(sessionUser.id)
      : null;
  debugLogger.log('syncUserProfile_after_providerFetch', { hasProviderProfile: !!providerProfile, totalMs: Date.now() - t0 });
  console.log('[TRACE][syncUserProfile] result', {
    userId: sessionUser.id,
    hasProfile: !!profile,
    role: profile?.role ?? null,
    email_verified: profile?.email_verified ?? null,
    providerStatus: providerProfile?.status ?? null,
    totalMs: Date.now() - t0,
  });
  return { profile: profile as User | null, providerProfile };
}

// Runs all post-login DB work OUTSIDE the onAuthStateChange callback.
// Supabase JS holds an internal auth lock while notifying subscribers; any
// supabase.from() / supabase.auth call made from inside the callback tries to
// re-acquire that lock and deadlocks indefinitely. By scheduling this function
// via setTimeout(fn, 0) from SIGNED_IN we guarantee it only runs after the
// callback's promise resolves and the lock is fully released.
async function bootstrapAuthenticatedUser(
  sessionUser: { id: string; email?: string; user_metadata?: Record<string, unknown>; email_confirmed_at?: string | null },
  sessionExpiresAt: number | null,
  get: () => AuthState,
  set: (partial: Partial<AuthState>) => void,
): Promise<void> {
  const _tb0 = Date.now();
  debugLogger.log('bootstrapAuthenticatedUser_start', { userId: sessionUser.id, t: _tb0 });
  console.log('[BOOTSTRAP] start — userId:', sessionUser.id);
  try {
    const statusCheck = await checkUserStatus(sessionUser.id, 'SIGNED_IN');
    debugLogger.log('bootstrapAuthenticatedUser_after_checkUserStatus', { allowed: statusCheck.allowed, error: statusCheck.error, ms: Date.now() - _tb0 });
    if (!statusCheck.allowed) {
      console.log('Moderation status:', statusCheck.error);
      console.log('[BOOTSTRAP] status check failed — signing out');
      showModerationAlert(statusCheck.error);
      console.log('[MODERATION SIGNOUT]', { reason: statusCheck.error });
      unsubscribeFromModerationRealtime(get, set);
      await supabase.auth.signOut();
      set({ user: null, providerProfile: null, sessionExpiresAt: null, emailJustVerified: false, passwordResetMode: false, mustChangePassword: false, currentPassword: null });
      useNotificationStore.getState().unsubscribeFromNotifications();
      return;
    }
    const { profile, providerProfile } = await syncUserProfile(sessionUser);
    debugLogger.log('bootstrapAuthenticatedUser_after_syncUserProfile', { hasProfile: !!profile, role: profile?.role, ms: Date.now() - _tb0 });
    resetModerationAlert();
    const needsPasswordChange = profile?.must_change_password === true;
    set({ user: profile, providerProfile, sessionExpiresAt: sessionExpiresAt, mustChangePassword: needsPasswordChange });
    if (profile) {
      subscribeToModerationRealtime(profile.id, get, set);
      registerPushToken(profile.id)
        .then(() => debugLogger.log('bootstrapAuthenticatedUser_registerPushToken_done', { ms: Date.now() - _tb0 }))
        .catch((e) => console.error('[AUTH] registerPushToken error:', e instanceof Error ? e.message : String(e)));
      useNotificationStore.getState().subscribeToNotifications(profile.id);
    }
    debugLogger.log('bootstrapAuthenticatedUser_end', { userId: profile?.id, role: profile?.role, totalMs: Date.now() - _tb0 });
    console.log('[BOOTSTRAP] complete — role:', profile?.role);
  } catch (err) {
    debugLogger.log('bootstrapAuthenticatedUser_error', { error: err instanceof Error ? err.message : String(err), ms: Date.now() - _tb0 });
    console.error('[BOOTSTRAP] error:', err);
  } finally {
    set({ isAuthenticating: false });
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  providerProfile: null,
  isLoading: false,
  isInitialized: false,
  isAuthenticating: false,
  sessionExpiresAt: null,
  emailJustVerified: false,
  setEmailJustVerified: (val: boolean) => set({ emailJustVerified: val }),
  passwordResetMode: false,
  setPasswordResetMode: (val: boolean) => set({ passwordResetMode: val }),
  mustChangePassword: false,
  setMustChangePassword: (val: boolean) => set({ mustChangePassword: val }),
  currentPassword: null,
  authListenerUnsubscribe: null,
  realtimeModerationUnsubscribe: null,

  initialize: async () => {
    const _ti0 = Date.now();
    debugLogger.log('initialize_start', { t: _ti0 });
    console.log('[AUTH] initialize: start');
    // Prevent duplicate auth listeners
    const existingUnsubscribe = get().authListenerUnsubscribe;
    if (existingUnsubscribe) {
      existingUnsubscribe();
    }

    // Always set up listener first so signUp events are never missed
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AUTH] onAuthStateChange event:', event, 'userId:', session?.user?.id, 'email_confirmed_at:', session?.user?.email_confirmed_at);
      if (event === 'INITIAL_SESSION' && session?.user) {
        // INITIAL_SESSION fires when listener attaches; let initialize() handle cold boot
        console.log('[AUTH] INITIAL_SESSION — deferring to initialize()');
        return;
      }
      if (event === 'SIGNED_IN' && session?.user) {
        const _t0 = Date.now();
        debugLogger.log('SIGNED_IN_handler_start', { userId: session.user.id, t: _t0 });
        console.log('[GOOGLE-LISTENER] SIGNED_IN event — userId:', session.user.id, 'email_confirmed_at:', session.user.email_confirmed_at, 'provider:', session.user.app_metadata?.provider);

        // ── In-memory checks only — NO Supabase calls allowed inside this callback.
        // Supabase JS awaits every onAuthStateChange subscriber before releasing its
        // internal auth lock. Any supabase.from() or supabase.auth call we issue here
        // tries to re-acquire that same lock → indefinite deadlock.
        const isOAuthProvider =
          (session.user.app_metadata?.provider && session.user.app_metadata.provider !== 'email') ||
          (session.user.app_metadata?.providers && session.user.app_metadata.providers.some((p: string) => p !== 'email'));

        if (!BETA_MODE && !session.user.email_confirmed_at && !isOAuthProvider) {
          if (get().passwordResetMode) {
            // Password reset flow: the user proved email ownership by receiving the
            // reset link. Enforcing email_confirmed_at here would sign them out and
            // destroy the recovery session before they can set a new password.
            console.log('[GOOGLE-LISTENER] SIGNED_IN: recovery flow active — skipping email_confirmed_at enforcement');
          } else {
            // Defer signOut — calling supabase.auth.signOut() inside the callback
            // would also deadlock on the auth lock.
            console.log('[GOOGLE-LISTENER] SIGNED_IN: email_confirmed_at is null — scheduling deferred signOut');
            debugLogger.log('SIGNED_IN_handler_end', { reason: 'deferred_signout_unverified', totalMs: Date.now() - _t0 });
            setTimeout(() => {
              supabase.auth.signOut()
                .then(() => set({ user: null, providerProfile: null, sessionExpiresAt: null, emailJustVerified: false, passwordResetMode: false, isAuthenticating: false }))
                .catch((e) => console.error('[SIGNED_IN] deferred signOut error:', e));
            }, 0);
            return;
          }
        }
        if (BETA_MODE && !session.user.email_confirmed_at) {
          console.log('[GOOGLE-LISTENER] BETA_MODE: bypassing email verification on SIGNED_IN');
        }
        if (!session.user.email_confirmed_at && isOAuthProvider) {
          console.log('[GOOGLE-LISTENER] SIGNED_IN: OAuth user with null email_confirmed_at — skipping enforcement (Google pre-verifies emails)');
        }

        // Capture session data before the callback frame is discarded.
        const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
        const sessionUser = session.user;
        set({ isAuthenticating: true, sessionExpiresAt: expiresAt });

        // Schedule all DB work for after this callback's promise resolves so the
        // Supabase auth lock is guaranteed to be released before we touch the DB.
        debugLogger.log('SIGNED_IN_handler_end', { reason: 'bootstrap_deferred', userId: sessionUser.id, totalMs: Date.now() - _t0 });
        setTimeout(() => {
          bootstrapAuthenticatedUser(sessionUser, expiresAt, get, set).catch((err) => {
            console.error('[SIGNED_IN] bootstrapAuthenticatedUser uncaught:', err);
            set({ isAuthenticating: false });
          });
        }, 0);
        // Return immediately — zero awaits, lock released without contention.
      } else if (event === 'USER_UPDATED' && session?.user) {
        const _tu0 = Date.now();

        // Guard: bootstrapAuthenticatedUser (triggered by SIGNED_IN) is the single
        // owner of post-login profile sync during OAuth. Skip entirely if it is active.
        // Also: any Supabase DB call from inside this callback deadlocks on the auth
        // lock exactly as SIGNED_IN did — so we defer all work via setTimeout.
        if (get().isAuthenticating) {
          debugLogger.log('USER_UPDATED_skipped', { reason: 'isAuthenticating=true', userId: session.user.id, t: _tu0 });
          console.log('[GOOGLE-LISTENER] USER_UPDATED: skipped — bootstrapAuthenticatedUser is active');
          return;
        }

        debugLogger.log('USER_UPDATED_handler_start', { userId: session.user.id, t: _tu0 });
        console.log('[GOOGLE-LISTENER] USER_UPDATED event — userId:', session.user.id, 'email_confirmed_at:', session.user.email_confirmed_at, 'provider:', session.user.app_metadata?.provider);

        // Capture before the callback frame is discarded.
        const updatedUser = session.user;
        const updatedExpiresAt = session.expires_at ? session.expires_at * 1000 : null;

        // Defer all DB/auth work outside the callback to avoid auth-lock deadlock.
        debugLogger.log('USER_UPDATED_handler_end', { reason: 'deferred', totalMs: Date.now() - _tu0 });
        setTimeout(async () => {
          const _td0 = Date.now();
          try {
            const isOAuthProviderUpdated =
              (updatedUser.app_metadata?.provider && updatedUser.app_metadata.provider !== 'email') ||
              (updatedUser.app_metadata?.providers && updatedUser.app_metadata.providers.some((p: string) => p !== 'email'));
            if (!BETA_MODE && !updatedUser.email_confirmed_at && !isOAuthProviderUpdated) {
              if (get().passwordResetMode) {
                // Password reset flow: user is on ResetPasswordScreen submitting updateUser().
                // passwordResetMode is still true here (cleared by handleContinue after success).
                // Signing out would invalidate the session mid-reset.
                console.log('[GOOGLE-LISTENER] USER_UPDATED: recovery flow active — skipping email_confirmed_at enforcement');
              } else {
                console.log('[GOOGLE-LISTENER] USER_UPDATED: email_confirmed_at is null — signing out');
                await supabase.auth.signOut();
                set({ user: null, providerProfile: null, sessionExpiresAt: null, emailJustVerified: false, passwordResetMode: false, mustChangePassword: false, currentPassword: null });
                useNotificationStore.getState().unsubscribeFromNotifications();
                debugLogger.log('USER_UPDATED_deferred_end', { reason: 'signOut_unverified', totalMs: Date.now() - _td0 });
                return;
              }
            }
            if (BETA_MODE && !updatedUser.email_confirmed_at) {
              console.log('[GOOGLE-LISTENER] BETA_MODE: bypassing email verification on USER_UPDATED');
            }
            if (!updatedUser.email_confirmed_at && isOAuthProviderUpdated) {
              console.log('[GOOGLE-LISTENER] USER_UPDATED: OAuth user with null email_confirmed_at — skipping enforcement');
            }
            debugLogger.log('USER_UPDATED_before_checkUserStatus', { ms: Date.now() - _td0 });
            const statusCheck = await checkUserStatus(updatedUser.id, 'USER_UPDATED');
            debugLogger.log('USER_UPDATED_after_checkUserStatus', { allowed: statusCheck.allowed, error: statusCheck.error, ms: Date.now() - _td0 });
            if (!statusCheck.allowed) {
              console.log('Moderation status:', statusCheck.error);
              console.log('[GOOGLE-LISTENER] USER_UPDATED: status check failed — signing out');
              showModerationAlert(statusCheck.error);
              console.log('[MODERATION SIGNOUT]', { reason: statusCheck.error });
              unsubscribeFromModerationRealtime(get, set);
              await supabase.auth.signOut();
              set({ user: null, providerProfile: null, sessionExpiresAt: null, emailJustVerified: false, passwordResetMode: false, mustChangePassword: false, currentPassword: null });
              useNotificationStore.getState().unsubscribeFromNotifications();
              debugLogger.log('USER_UPDATED_deferred_end', { reason: 'signOut_status_check_failed', totalMs: Date.now() - _td0 });
              return;
            }
            debugLogger.log('USER_UPDATED_before_syncUserProfile', { ms: Date.now() - _td0 });
            const { profile, providerProfile } = await syncUserProfile(updatedUser);
            debugLogger.log('USER_UPDATED_after_syncUserProfile', { hasProfile: !!profile, role: profile?.role, ms: Date.now() - _td0 });
            resetModerationAlert();
            const needsPasswordChange = profile?.must_change_password === true;
            set({ user: profile, providerProfile, sessionExpiresAt: updatedExpiresAt, mustChangePassword: needsPasswordChange });
            if (profile) {
              subscribeToModerationRealtime(profile.id, get, set);
            }
            console.log('[GOOGLE-LISTENER] USER_UPDATED: user state set', { role: profile?.role });
            debugLogger.log('USER_UPDATED_deferred_end', { totalMs: Date.now() - _td0 });
          } catch (err) {
            debugLogger.log('USER_UPDATED_deferred_error', { error: err instanceof Error ? err.message : String(err), ms: Date.now() - _td0 });
            console.error('[GOOGLE-LISTENER] USER_UPDATED deferred error:', err);
          }
        }, 0);
      } else if (event === 'TOKEN_REFRESHED' && session) {
        console.log('[GOOGLE-LISTENER] TOKEN_REFRESHED');
        const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
        set({ sessionExpiresAt: expiresAt });
      } else if (event === 'SIGNED_OUT') {
        debugLogger.log('SIGNED_OUT', { previousUserId: get().user?.id ?? null });
        debugLogger.log('set_user_null', { file: 'authStore.ts', function: 'SIGNED_OUT_listener' });
        console.log('[GOOGLE-LISTENER] SIGNED_OUT — clearing user state');
        console.log('[TRACE][SIGNED_OUT] store user before clear', { currentUserId: get().user?.id ?? null });
        set({ user: null, providerProfile: null, sessionExpiresAt: null, emailJustVerified: false, passwordResetMode: false, mustChangePassword: false, currentPassword: null });
        useNotificationStore.getState().unsubscribeFromNotifications();
        console.log('[TRACE][SIGNED_OUT] store user after clear', { currentUserId: get().user?.id ?? null });
      }
    });

    set({ authListenerUnsubscribe: subscription.unsubscribe });

    try {
      debugLogger.log('initialize_before_getSession', { ms: Date.now() - _ti0 });
      const { data: { session }, error } = await supabase.auth.getSession();
      debugLogger.log('initialize_after_getSession', { hasSession: !!session, hasError: !!error, ms: Date.now() - _ti0 });

      if (error || !session?.user) {
        console.log('[AUTH] initialize: no session');
        debugLogger.log('initialize_end', { reason: 'no_session', totalMs: Date.now() - _ti0 });
        set({ isInitialized: true });
        return;
      }

      console.log('[AUTH] initialize: session found', {
        userId: session.user.id,
        email: session.user.email,
        email_confirmed_at: session.user.email_confirmed_at,
        provider: session.user.app_metadata?.provider,
        providers: session.user.app_metadata?.providers,
      });

      // Detect OAuth providers (Google, Apple, etc.) — their emails are pre-verified
      const isOAuthProvider =
        (session.user.app_metadata?.provider && session.user.app_metadata.provider !== 'email') ||
        (session.user.app_metadata?.providers && session.user.app_metadata.providers.some((p: string) => p !== 'email'));

      // getSession() reads local cache which may be stale after email verification.
      // If local cache shows unverified, refresh from server before enforcing.
      let emailConfirmedAt = session.user.email_confirmed_at;
      if (!emailConfirmedAt && !isOAuthProvider) {
        console.log('[AUTH] initialize: local cache shows unverified, refreshing from server...');
        debugLogger.log('initialize_before_getUser', { ms: Date.now() - _ti0 });
        const { data: { user: refreshedUser }, error: refreshError } = await supabase.auth.getUser();
        debugLogger.log('initialize_after_getUser', { hasUser: !!refreshedUser, ms: Date.now() - _ti0 });
        if (!refreshError && refreshedUser) {
          emailConfirmedAt = refreshedUser.email_confirmed_at;
          console.log('[AUTH] initialize: server refresh result', {
            email_confirmed_at: refreshedUser.email_confirmed_at,
          });
        }
      }
      if (!emailConfirmedAt && isOAuthProvider) {
        console.log('[AUTH] initialize: OAuth user with null email_confirmed_at — skipping enforcement');
        emailConfirmedAt = session.user.email_confirmed_at || new Date().toISOString();
      }
      if (BETA_MODE && !emailConfirmedAt) {
        console.log('[AUTH] BETA_MODE: bypassing email verification in initialize');
        emailConfirmedAt = session.user.email_confirmed_at || new Date().toISOString();
      }

      if (!emailConfirmedAt) {
        console.log('[AUTH] initialize: user unverified, signing out');
        await supabase.auth.signOut();
        debugLogger.log('initialize_end', { reason: 'signOut_unverified', totalMs: Date.now() - _ti0 });
        set({ isInitialized: true });
        return;
      }

      console.log('[AUTH] initialize: user verified, proceeding');

      debugLogger.log('initialize_before_checkUserStatus', { userId: session.user.id, ms: Date.now() - _ti0 });
      const statusCheck = await checkUserStatus(session.user.id, 'initialize');
      debugLogger.log('initialize_after_checkUserStatus', { allowed: statusCheck.allowed, error: statusCheck.error, ms: Date.now() - _ti0 });
      if (!statusCheck.allowed) {
        console.log('Moderation status:', statusCheck.error);
        console.log('[AUTH] initialize: status check failed');
        showModerationAlert(statusCheck.error);
        console.log('[MODERATION SIGNOUT]', { reason: statusCheck.error });
        unsubscribeFromModerationRealtime(get, set);
        await supabase.auth.signOut();
        debugLogger.log('initialize_end', { reason: 'signOut_status_check_failed', totalMs: Date.now() - _ti0 });
        set({ isInitialized: true });
        return;
      }

      debugLogger.log('initialize_before_syncUserProfile', { userId: session.user.id, ms: Date.now() - _ti0 });
      const { profile, providerProfile } = await syncUserProfile(session.user);
      const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
      debugLogger.log('initialize_after_syncUserProfile', { hasProfile: !!profile, role: profile?.role, ms: Date.now() - _ti0 });
      resetModerationAlert();
      const needsPasswordChange = profile?.must_change_password === true;
      set({
        user: profile,
        providerProfile,
        isInitialized: true,
        sessionExpiresAt: expiresAt,
        mustChangePassword: needsPasswordChange,
      });
      if (profile) {
        subscribeToModerationRealtime(profile.id, get, set);
      }
      debugLogger.log('initialize_end', { reason: 'success', userId: profile?.id, role: profile?.role, totalMs: Date.now() - _ti0 });
      if (profile) {
        registerPushToken(profile.id).catch((e) => console.error('[AUTH] registerPushToken error:', e instanceof Error ? e.message : String(e)));
        useNotificationStore.getState().subscribeToNotifications(profile.id);
      }
    } catch (err) {
      debugLogger.log('initialize_end', { reason: 'caught_error', error: err instanceof Error ? err.message : String(err), totalMs: Date.now() - _ti0 });
      set({ isInitialized: true });
    }
  },

  validateSession: async () => {
    // If SIGNED_IN handler is still running, skip — it will set user state when done.
    // Running concurrently causes duplicate checkUserStatus/syncUserProfile calls
    // which contend for the Supabase session lock and cause hangs.
    if (get().isAuthenticating) {
      debugLogger.log('validateSession_skipped', { reason: 'isAuthenticating=true', caller: 'AppState_active' });
      console.log('[TRACE][validateSession] skipped — SIGNED_IN handler in progress');
      return;
    }
    debugLogger.log('validateSession_start', { caller: 'AppState_active', t: Date.now() });
    console.log('[TRACE][validateSession] invoked');
    try {
      debugLogger.log('validateSession_before_getSession', { t: Date.now() });
      const { data: { session }, error } = await supabase.auth.getSession();
      debugLogger.log('validateSession_after_getSession', { hasSession: !!session, t: Date.now() });

      if (error || !session?.user) {
        console.log('[TRACE][validateSession] no active session', {
          hadError: !!error,
          storeUserPresent: !!get().user,
        });
        // Only sign out if there was a user in the store whose session has now
        // expired or disappeared.  When user is null we are already in an
        // unauthenticated state — calling signOut() here acquires the supabase
        // session lock and, due to the lock-queue ordering, can race against a
        // concurrent exchangeCodeForSession (deep-link password reset / email
        // verification): it would find the just-stored recovery session, call
        // the /logout API to invalidate it server-side, fire SIGNED_OUT, and
        // clear passwordResetMode — killing the reset flow entirely.
        if (get().user) {
          await get().signOut();
        }
        return;
      }

      const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
      set({ sessionExpiresAt: expiresAt });

      if (!get().user) {
        console.log('[TRACE][validateSession] store user missing but session exists — syncing', {
          sessionUserId: session.user.id,
        });
        // Re-check: SIGNED_IN handler may have started while we awaited getSession()
        if (get().isAuthenticating) {
          debugLogger.log('validateSession_skipped_mid', { reason: 'isAuthenticating set after getSession', t: Date.now() });
          console.log('[TRACE][validateSession] aborting mid-flow — SIGNED_IN handler started');
          return;
        }
        debugLogger.log('validateSession_before_checkUserStatus', { userId: session.user.id, t: Date.now() });
        const statusCheck = await checkUserStatus(session.user.id, 'validateSession');
        debugLogger.log('validateSession_after_checkUserStatus', { allowed: statusCheck.allowed, t: Date.now() });
        if (!statusCheck.allowed) {
          console.log('Moderation status:', statusCheck.error);
          console.log('[TRACE][validateSession] status check failed, signing out');
          showModerationAlert(statusCheck.error);
          console.log('[MODERATION SIGNOUT]', { reason: statusCheck.error });
          await get().signOut();
          return;
        }
        debugLogger.log('validateSession_before_syncUserProfile', { userId: session.user.id, t: Date.now() });
        const { profile, providerProfile } = await syncUserProfile(session.user);
        debugLogger.log('validateSession_after_syncUserProfile', { hasProfile: !!profile, t: Date.now() });
        console.log('[TRACE][validateSession] sync result when user missing', {
          profilePresent: !!profile,
          providerPresent: !!providerProfile,
        });
        resetModerationAlert();
        const needsPasswordChange = profile?.must_change_password === true;
        set({ user: profile, providerProfile, mustChangePassword: needsPasswordChange });
        if (profile) {
          subscribeToModerationRealtime(profile.id, get, set);
          registerPushToken(profile.id).catch((e) => console.error('[AUTH] registerPushToken error:', e instanceof Error ? e.message : String(e)));
          useNotificationStore.getState().subscribeToNotifications(profile.id);
        }
      }
    } catch (err) {
      debugLogger.log('validateSession_error', { error: err instanceof Error ? err.message : String(err), t: Date.now() });
      console.error('[TRACE][validateSession] threw', err instanceof Error ? err.message : err);
      if (get().user) {
        await get().signOut();
      }
    }
  },

  signIn: async (email, password, captchaToken) => {
    set({ isLoading: true });
    try {
      console.log('[TRACE][signIn] start', { email });
      const lockout = await checkLoginAllowed(email);
      if (!lockout.allowed) {
        console.log('[TRACE][signIn] blocked by lockout');
        throw new Error(lockout.error || 'Account temporarily locked. Please try again later.');
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: captchaToken ? { captchaToken } : undefined,
      });
      console.log('[TRACE][signIn] supabase response', { hasUser: !!data.user, hasSession: !!data.session, error: error?.message ?? null });
      if (error) {
        await logLoginAttempt(email, false);
        throw error;
      }
      await logLoginAttempt(email, true);
      if (data.user) {
        // Enforce email verification before allowing login
        console.log('[AUTH] signIn: user data', {
          userId: data.user.id,
          email: data.user.email,
          email_confirmed_at: data.user.email_confirmed_at,
        });
        if (!BETA_MODE && !data.user.email_confirmed_at) {
          console.log('[AUTH] signIn: user unverified, rejecting login');
          await supabase.auth.signOut();
          throw new Error('Please verify your email before signing in.');
        }
        if (BETA_MODE && !data.user.email_confirmed_at) {
          console.log('[AUTH] BETA_MODE: bypassing email verification for login');
        }
        const statusCheck = await checkUserStatus(data.user.id, 'signIn');
        console.log('Moderation status:', statusCheck.error);
        if (!statusCheck.allowed) {
          showModerationAlert(statusCheck.error);
          console.log('[MODERATION SIGNOUT]', { reason: statusCheck.error, path: 'signIn' });
          await supabase.auth.signOut();
          throw new Error(statusCheck.error || 'Account access denied.');
        }
        const expiresAt = data.session?.expires_at ? data.session.expires_at * 1000 : null;
        const { profile, providerProfile } = await syncUserProfile(data.user);
        console.log('[TRACE][signIn] sync result', { profilePresent: !!profile, providerPresent: !!providerProfile, expiresAt });
        resetModerationAlert();
        const needsPasswordChange = profile?.must_change_password === true;
        set({
          user: profile,
          providerProfile,
          sessionExpiresAt: expiresAt,
          mustChangePassword: needsPasswordChange,
          currentPassword: needsPasswordChange ? password : null,
        });
        if (profile) {
          subscribeToModerationRealtime(profile.id, get, set);
        }
      }
    } finally {
      set({ isLoading: false });
    }
  },

  signInWithGoogle: async () => {
    set({ isLoading: true });
    try {
      debugLogger.log('signInWithGoogle_start', {});
      console.log('[TRACE][google] start');
      // Use explicit redirect URI with path for OAuth callback
      const redirectTo = makeRedirectUri({
        scheme: 'com.servicehub.app',
        path: 'oauth-callback',
      });
      debugLogger.log('makeRedirectUri_result', { redirectTo });
      console.log('[AUTH] Google OAuth redirectTo:', redirectTo);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      debugLogger.log('signInWithOAuth_response', { hasUrl: !!data?.url, error: error?.message ?? null });
      console.log('[TRACE][google] signInWithOAuth response', { hasUrl: !!data?.url, error: error?.message ?? null });
      if (error) {
        console.log('[AUTH] signInWithOAuth error:', error.message);
        throw error;
      }
      if (!data?.url) {
        console.log('[AUTH] signInWithOAuth returned no URL');
        throw new Error('Failed to start Google sign-in. Please try again.');
      }

      // Set isAuthenticating BEFORE the browser opens so that when the browser
      // closes the AppState 'active' event fires validateSession() which checks
      // this flag and skips — preventing a concurrent checkUserStatus race.
      set({ isAuthenticating: true });
      debugLogger.log('openAuthSessionAsync_start', { url: data.url.substring(0, 50) + '...', redirectTo });
      console.log('[AUTH] Opening auth session...');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      debugLogger.log('openAuthSessionAsync_result', { type: result.type, hasUrl: !!(result as any).url });
      console.log('[AUTH] Auth session result:', result.type);

      if (result.type === 'cancel') {
        debugLogger.log('oauth_cancelled', {});
        console.log('[AUTH] User cancelled Google sign-in');
        set({ isAuthenticating: false });
        return;
      }
      if (result.type === 'dismiss') {
        debugLogger.log('oauth_dismissed', {});
        console.log('[AUTH] Google sign-in dismissed');
        set({ isAuthenticating: false });
        return;
      }
      if (result.type !== 'success' || !result.url) {
        debugLogger.log('oauth_failed', { type: result.type, hasUrl: !!(result as any).url });
        console.log('[AUTH] Auth session failed or returned no URL');
        throw new Error('Google sign-in was interrupted. Please try again.');
      }

      debugLogger.log('oauth_success', { callbackUrl: result.url });
      console.log('[GOOGLE] OAuth success');
      const url = new URL(result.url);
      const code = url.searchParams.get('code');
      const errorDesc = url.searchParams.get('error_description');
      debugLogger.log('oauth_callback_parsed', { hasCode: !!code, hasError: !!errorDesc });
      if (errorDesc) {
        debugLogger.log('oauth_callback_error', { error: errorDesc });
        console.log('[AUTH] OAuth callback error:', errorDesc);
        throw new Error(errorDesc);
      }
      if (!code) {
        debugLogger.log('oauth_no_code', { url: result.url });
        console.log('[AUTH] No authorization code in callback URL');
        throw new Error('Authentication failed. Please try again.');
      }

      debugLogger.log('exchangeCodeForSession_start', { code: code.substring(0, 10) + '...' });
      console.log('[GOOGLE] Exchanging code for session...');
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        debugLogger.log('exchangeCodeForSession_error', { error: exchangeError.message });
        console.log('[GOOGLE] exchangeCodeForSession error:', exchangeError.message);
        throw exchangeError;
      }
      debugLogger.log('exchangeCodeForSession_success', {});
      console.log('[GOOGLE] Session created via exchangeCodeForSession — SIGNED_IN listener will handle profile sync');
      // Do NOT call checkUserStatus/syncUserProfile here.
      // exchangeCodeForSession fires the SIGNED_IN event which is handled by
      // onAuthStateChange. That listener is the single owner of post-auth profile
      // sync. Running both concurrently causes session-lock contention and 30s+ hangs.
    } catch (err) {
      console.log('[GOOGLE] sign-in error:', err instanceof Error ? err.message : String(err));
      set({ isAuthenticating: false });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async ({ email, password, fullName, role, phone, acceptedTerms }, captchaToken) => {
    console.log('[AUTHSTORE] signUp called');
    set({ isLoading: true });
    try {
      const consentTimestamp = acceptedTerms ? new Date().toISOString() : null;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role,
            phone: phone ?? null,
            accepted_terms_at: consentTimestamp,
            accepted_privacy_at: consentTimestamp,
            accepted_terms_version: acceptedTerms ? '1.0' : null,
          },
          captchaToken,
          emailRedirectTo: 'com.servicehub.app://verify',
        },
      });
      console.log('[SIGNUP RESULT]', {
        hasUser: !!data?.user,
        hasSession: !!data?.session,
        errorMessage: error?.message,
        errorCode: (error as any)?.code,
        errorStatus: (error as any)?.status,
      });
      if (error) {
        const errMsg = (error.message ?? '').toLowerCase();
        if (errMsg.includes('rate limit') || errMsg.includes('email rate limit')) {
          debugLogger.log('signup_rate_limited', { t: Date.now() });
          console.log('[AUTHSTORE] signup_rate_limited');
        } else if (errMsg.includes('already registered') || errMsg.includes('user already registered')) {
          debugLogger.log('signup_existing_account', { t: Date.now() });
          console.log('[AUTHSTORE] signup_existing_account');
        }
        console.log('[AUTHSTORE] signUp failed:', error.message);
        throw error;
      }
      if (data.user) {
        console.log('[AUTHSTORE] signUp success for user:', data.user.id);
        if (BETA_MODE) {
          console.log('[AUTHSTORE] BETA_MODE: bypassing email verification, setting user state');
          const { profile, providerProfile } = await syncUserProfile(data.user);
          const { data: { session } } = await supabase.auth.getSession();
          const expiresAt = session?.expires_at ? session.expires_at * 1000 : null;
          set({ user: profile, providerProfile, sessionExpiresAt: expiresAt });
          if (profile) {
            registerPushToken(profile.id).catch((e) => console.error('[AUTH] registerPushToken error:', e instanceof Error ? e.message : String(e)));
            useNotificationStore.getState().subscribeToNotifications(profile.id);
          }
        } else {
          // Profile is created automatically by the handle_new_user trigger.
          // Consent fields are passed via raw_user_meta_data and written by the trigger.
          // Do NOT auto-set user state here; email verification is required first.
          //
          // IMPORTANT — do NOT call supabase.auth.signOut() here.
          //
          // Email signup uses the PKCE flow (flowType: 'pkce' in supabase.ts).
          // supabase.auth.signUp() generates a code_verifier and stores it in
          // AsyncStorage as part of the PKCE challenge. When the user taps the
          // verification link and the app calls exchangeCodeForSession(code), Supabase
          // retrieves that stored verifier to complete the exchange.
          //
          // supabase.auth.signOut() calls _removeSession() which wipes ALL auth-related
          // AsyncStorage keys — including the PKCE code verifier. Calling it here leaves
          // exchangeCodeForSession() with no verifier, causing:
          //   "PKCE code verifier not found in storage"
          //
          // With email confirmation required, signUp() returns session:null — there is
          // no active session to sign out from. Clearing only Zustand state is sufficient
          // to prevent the user from being treated as authenticated before verification.
          set({ user: null, providerProfile: null });
        }
      }
    } catch (err) {
      const catchMsg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (
        catchMsg.includes('fetch') ||
        catchMsg.includes('network request failed') ||
        catchMsg.includes('failed to fetch') ||
        catchMsg.includes('network')
      ) {
        debugLogger.log('signup_network_error', { t: Date.now() });
        console.log('[AUTHSTORE] signup_network_error');
      }
      console.log('[AUTHSTORE] signUp failed:', err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  resendVerificationEmail: async (email) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: 'com.servicehub.app://verify',
      },
    });
    if (error) throw error;
    debugLogger.log('resend_verification_sent', { t: Date.now() });
    console.log('[AUTHSTORE] resend_verification_sent');
  },

  checkEmailVerified: async () => {
    console.log('[VERIFY] checkEmailVerified: fetching fresh user from server...');
    if (BETA_MODE) {
      console.log('[VERIFY] BETA_MODE: bypassing email verification check');
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { profile, providerProfile } = await syncUserProfile(authUser);
        const { data: { session } } = await supabase.auth.getSession();
        const expiresAt = session?.expires_at ? session.expires_at * 1000 : null;
        set({ user: profile, providerProfile, sessionExpiresAt: expiresAt });
      }
      return { verified: true };
    }
    const { data: { user: authUser }, error } = await supabase.auth.getUser();
    if (error || !authUser) {
      console.log('[VERIFY] checkEmailVerified: getUser failed', error?.message);
      return { verified: false };
    }
    console.log('[VERIFY] auth user email_confirmed_at', authUser.email_confirmed_at);
    const isVerified = authUser.email_confirmed_at != null;
    console.log('[VERIFY] checkEmailVerified result', {
      userId: authUser.id,
      email: authUser.email,
      email_confirmed_at: authUser.email_confirmed_at,
      isVerified,
      decision: isVerified ? 'VERIFIED' : 'UNVERIFIED',
    });

    if (isVerified) {
      console.log('[VERIFY] User is verified — syncing profile and setting state');
      // Always sync profile + set state, even if currentUser is null
      // (currentUser is null for unverified users because initialize() blocked them)
      const { profile, providerProfile } = await syncUserProfile(authUser);
      console.log('[VERIFY] syncUserProfile result', profile);
      const { data: { session } } = await supabase.auth.getSession();
      const expiresAt = session?.expires_at ? session.expires_at * 1000 : null;
      console.log('[VERIFY] Setting user state — role:', profile?.role, 'email_verified:', profile?.email_verified, 'accepted_terms_at:', profile?.accepted_terms_at);
      const needsPasswordChange = profile?.must_change_password === true;
      set({ user: profile, providerProfile, sessionExpiresAt: expiresAt, mustChangePassword: needsPasswordChange });
      console.log('[VERIFY] State updated via set()');
      if (profile) {
        registerPushToken(profile.id).catch((e) => console.error('[AUTH] registerPushToken error:', e instanceof Error ? e.message : String(e)));
        useNotificationStore.getState().subscribeToNotifications(profile.id);
      }
      return {
        verified: true,
        role: profile?.role ?? 'customer',
        providerStatus: providerProfile?.status ?? null,
      };
    }
    return { verified: false };
  },

  signOut: async () => {
    const { user } = get();
    debugLogger.log('signOut', { file: 'authStore.ts', function: 'signOut', reason: 'manual signOut call', userId: user?.id });
    console.log('[TRACE][signOut] invoked', { hadUser: !!user });
    if (user) {
      removePushToken(user.id).catch((e) => console.error('[AUTH] removePushToken error:', e instanceof Error ? e.message : String(e)));
    }
    useNotificationStore.getState().unsubscribeFromNotifications();
    await supabase.auth.signOut();
    resetModerationAlert();
    unsubscribeFromModerationRealtime(get, set);
    set({ user: null, providerProfile: null, sessionExpiresAt: null, emailJustVerified: false, passwordResetMode: false, mustChangePassword: false, currentPassword: null });
    console.log('[TRACE][signOut] state cleared');
  },

  changePassword: async (newPassword: string, currentPassword?: string) => {
    const { user } = get();
    if (!user) return { success: false, error: 'Not authenticated' };
    if (currentPassword && newPassword === currentPassword) {
      return { success: false, error: 'New password cannot be the same as your temporary password' };
    }
    try {
      const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
      if (authError) {
        return { success: false, error: authError.message };
      }
      const { error: dbError } = await supabase
        .from('users')
        .update({ must_change_password: false, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (dbError) {
        console.error('[AUTH] changePassword: failed to clear must_change_password flag', dbError);
      }
      await supabase.from('staff_action_log').insert({
        staff_id: user.id,
        action: 'change_password',
        target_table: 'users',
        target_record_id: user.id,
        notes: 'Staff changed their password on first login',
      });
      // Refresh profile from DB so RootNavigator sees the latest role and must_change_password state
      console.log('[TRACE][changePassword] Before refresh', {
        role: user.role,
        mustChangePassword: user.must_change_password,
      });
      const { data: refreshedProfile, error: refreshError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      if (refreshError) {
        console.error('[AUTH] changePassword: failed to refresh profile', refreshError);
      }
      const updatedUser = refreshedProfile ? (refreshedProfile as User) : { ...user, must_change_password: false };
      console.log('[TRACE][changePassword] After refresh', {
        role: updatedUser.role,
        mustChangePassword: updatedUser.must_change_password,
      });
      set({ user: updatedUser, mustChangePassword: false, currentPassword: null });
      return { success: true };
    } catch (err) {
      console.error('[AUTH] changePassword error:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Failed to change password' };
    }
  },

  updateProfile: async (updates) => {
    const { user } = get();
    if (!user) return;
    const { data, error } = await supabase
      .from('users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select()
      .single();
    if (error) throw error;
    set({ user: data });
  },

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();
    if (data) set({ user: data });
  },

  refreshProviderProfile: async () => {
    const { user } = get();
    if (!user || user.role !== 'provider') return;
    const providerProfile = await fetchProviderProfile(user.id);
    set({ providerProfile });
  },

  completeProfileSetup: async (data) => {
    const { user } = get();
    if (!user) {
      console.error('[PROFILE] completeProfileSetup: user is null');
      throw new Error('Not authenticated');
    }

    const staffRoles = ['moderator', 'support_agent', 'operations_staff'];
    if (staffRoles.includes(user.role ?? '')) {
      console.error('[PROFILE] completeProfileSetup: staff accounts cannot use marketplace onboarding', { userId: user.id, role: user.role });
      throw new Error('Staff onboarding is handled separately. Please contact your administrator.');
    }

    console.log('[PROFILE] completeProfileSetup start', {
      userId: user.id,
      role: data.role,
      phone: data.phone,
    });

    // 1. Update public.users with role, contact info, and consent
    const { data: updatedRows, error: updateError } = await supabase
      .from('users')
      .update({
        full_name: data.full_name,
        phone: data.phone,
        role: data.role,
        accepted_terms_at: data.accepted_terms_at,
        accepted_privacy_at: data.accepted_privacy_at,
        accepted_terms_version: data.accepted_terms_version,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select();

    console.log('[PROFILE] Update result', {
      error: updateError?.message ?? null,
      rowsReturned: updatedRows?.length ?? 0,
    });

    if (updateError) {
      console.error('[PROFILE] completeProfileSetup: users update error', updateError.message);
      throw updateError;
    }

    if (!updatedRows || updatedRows.length === 0) {
      console.error('[PROFILE] completeProfileSetup: update affected 0 rows — likely RLS block or missing row');
      throw new Error(
        'Profile update failed. Your session may have expired or the profile row is missing. Please restart the app and try again.'
      );
    }

    // 2. If role is provider, create a draft provider profile so ProviderNavigator works
    if (data.role === 'provider') {
      console.log('[PROFILE] completeProfileSetup: creating draft provider profile');
      const { data: providerRows, error: providerError } = await supabase
        .from('providers')
        .upsert({
          id: user.id,
          business_name: data.full_name,
          status: 'draft',
          updated_at: new Date().toISOString(),
        })
        .select();
      console.log('[PROFILE] Provider upsert result', {
        error: providerError?.message ?? null,
        rowsReturned: providerRows?.length ?? 0,
      });
      if (providerError) {
        console.error('[PROFILE] completeProfileSetup: provider upsert error', providerError.message);
        // Non-fatal: ProviderNavigator will still show onboarding
      }
    }

    // 3. Refresh session and sync user state
    console.log('[PROFILE] Getting session...');
    const { data: { session } } = await supabase.auth.getSession();
    console.log('[PROFILE] Session', session ? 'present' : 'missing');

    if (session?.user) {
      console.log('[PROFILE] Syncing profile...');
      const { profile, providerProfile } = await syncUserProfile(session.user);
      console.log('[PROFILE] syncUserProfile result', {
        role: profile?.role,
        accepted_terms_at: profile?.accepted_terms_at,
        email_verified: profile?.email_verified,
        providerStatus: providerProfile?.status ?? 'none',
      });
      const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
      const needsPasswordChange = profile?.must_change_password === true;
      set({ user: profile, providerProfile, sessionExpiresAt: expiresAt, mustChangePassword: needsPasswordChange });
      console.log('[PROFILE] Store updated — RootNavigator should switch to', profile?.role);
      if (profile) {
        registerPushToken(profile.id).catch((e) => console.error('[AUTH] registerPushToken error:', e instanceof Error ? e.message : String(e)));
        useNotificationStore.getState().subscribeToNotifications(profile.id);
      }
    } else {
      console.error('[PROFILE] Session lost during profile setup');
      throw new Error('Session lost during profile setup.');
    }
  },
}));
