import { create } from 'zustand';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../lib/supabase';
import { User, Provider } from '../types';
import { registerPushToken, removePushToken } from '../services/notificationService';
import { checkLoginAllowed, logLoginAttempt, checkUserStatus } from '../services/securityService';
import { useNotificationStore } from './notificationStore';
import { BETA_MODE } from '../config/featureFlags';

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
  sessionExpiresAt: number | null;
  authListenerUnsubscribe: (() => void) | null;
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
  const isVerified = !!sessionUser.email_confirmed_at;

  let { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', sessionUser.id)
    .single();

  if (!profile) {
    // Trigger may not have fired; create profile manually
    const { data: newProfile } = await supabase
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
    profile = newProfile as User | null;
  } else if (profile.email_verified !== isVerified) {
    // public.users.email_verified is stale (e.g. user verified email after initial signup)
    console.log('[AUTH] syncUserProfile: syncing email_verified', {
      id: sessionUser.id,
      old: profile.email_verified,
      new: isVerified,
    });
    const { data: updatedProfile, error: updateError } = await supabase
      .from('users')
      .update({ email_verified: isVerified, updated_at: new Date().toISOString() })
      .eq('id', sessionUser.id)
      .select()
      .single();
    if (!updateError && updatedProfile) {
      profile = updatedProfile as User | null;
    } else {
      console.log('[AUTH] syncUserProfile: DB update failed, correcting in-memory:', updateError?.message);
      profile.email_verified = isVerified;
    }
  }

  const providerProfile =
    profile?.role === 'provider'
      ? await fetchProviderProfile(sessionUser.id)
      : null;
  return { profile: profile as User | null, providerProfile };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  providerProfile: null,
  isLoading: false,
  isInitialized: false,
  sessionExpiresAt: null,
  authListenerUnsubscribe: null,

  initialize: async () => {
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
        console.log('[GOOGLE-LISTENER] SIGNED_IN event — userId:', session.user.id, 'email_confirmed_at:', session.user.email_confirmed_at, 'provider:', session.user.app_metadata?.provider, 'providers:', session.user.app_metadata?.providers);
        const isOAuthProvider =
          (session.user.app_metadata?.provider && session.user.app_metadata.provider !== 'email') ||
          (session.user.app_metadata?.providers && session.user.app_metadata.providers.some((p: string) => p !== 'email'));
        if (!BETA_MODE && !session.user.email_confirmed_at && !isOAuthProvider) {
          console.log('[GOOGLE-LISTENER] SIGNED_IN: email_confirmed_at is null — signing out');
          await supabase.auth.signOut();
          set({ user: null, providerProfile: null, sessionExpiresAt: null });
          return;
        }
        if (BETA_MODE && !session.user.email_confirmed_at) {
          console.log('[GOOGLE-LISTENER] BETA_MODE: bypassing email verification on SIGNED_IN');
        }
        if (!session.user.email_confirmed_at && isOAuthProvider) {
          console.log('[GOOGLE-LISTENER] SIGNED_IN: OAuth user with null email_confirmed_at — skipping enforcement (Google pre-verifies emails)');
        }
        const statusCheck = await checkUserStatus(session.user.id);
        if (!statusCheck.allowed) {
          console.log('[GOOGLE-LISTENER] SIGNED_IN: status check failed — signing out');
          await supabase.auth.signOut();
          set({ user: null, providerProfile: null, sessionExpiresAt: null });
          useNotificationStore.getState().unsubscribeFromNotifications();
          return;
        }
        console.log('[GOOGLE-LISTENER] SIGNED_IN: syncing profile');
        const { profile, providerProfile } = await syncUserProfile(session.user);
        const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
        set({ user: profile, providerProfile, sessionExpiresAt: expiresAt });
        console.log('[GOOGLE-LISTENER] SIGNED_IN: user state set', { role: profile?.role, accepted_terms_at: profile?.accepted_terms_at });
        if (profile) {
          registerPushToken(profile.id).catch(() => {});
          useNotificationStore.getState().subscribeToNotifications(profile.id);
        }
      } else if (event === 'USER_UPDATED' && session?.user) {
        console.log('[GOOGLE-LISTENER] USER_UPDATED event — userId:', session.user.id, 'email_confirmed_at:', session.user.email_confirmed_at, 'provider:', session.user.app_metadata?.provider, 'providers:', session.user.app_metadata?.providers);
        const isOAuthProviderUpdated =
          (session.user.app_metadata?.provider && session.user.app_metadata.provider !== 'email') ||
          (session.user.app_metadata?.providers && session.user.app_metadata.providers.some((p: string) => p !== 'email'));
        if (!BETA_MODE && !session.user.email_confirmed_at && !isOAuthProviderUpdated) {
          console.log('[GOOGLE-LISTENER] USER_UPDATED: email_confirmed_at is null — signing out');
          await supabase.auth.signOut();
          set({ user: null, providerProfile: null, sessionExpiresAt: null });
          useNotificationStore.getState().unsubscribeFromNotifications();
          return;
        }
        if (BETA_MODE && !session.user.email_confirmed_at) {
          console.log('[GOOGLE-LISTENER] BETA_MODE: bypassing email verification on USER_UPDATED');
        }
        if (!session.user.email_confirmed_at && isOAuthProviderUpdated) {
          console.log('[GOOGLE-LISTENER] USER_UPDATED: OAuth user with null email_confirmed_at — skipping enforcement');
        }
        const statusCheck = await checkUserStatus(session.user.id);
        if (!statusCheck.allowed) {
          console.log('[GOOGLE-LISTENER] USER_UPDATED: status check failed — signing out');
          await supabase.auth.signOut();
          set({ user: null, providerProfile: null, sessionExpiresAt: null });
          useNotificationStore.getState().unsubscribeFromNotifications();
          return;
        }
        const { profile, providerProfile } = await syncUserProfile(session.user);
        const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
        set({ user: profile, providerProfile, sessionExpiresAt: expiresAt });
        console.log('[GOOGLE-LISTENER] USER_UPDATED: user state set', { role: profile?.role });
      } else if (event === 'TOKEN_REFRESHED' && session) {
        console.log('[GOOGLE-LISTENER] TOKEN_REFRESHED');
        const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
        set({ sessionExpiresAt: expiresAt });
      } else if (event === 'SIGNED_OUT') {
        console.log('[GOOGLE-LISTENER] SIGNED_OUT — clearing user state');
        set({ user: null, providerProfile: null, sessionExpiresAt: null });
        useNotificationStore.getState().unsubscribeFromNotifications();
      }
    });

    set({ authListenerUnsubscribe: subscription.unsubscribe });

    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session?.user) {
        console.log('[AUTH] initialize: no session');
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
        const { data: { user: refreshedUser }, error: refreshError } = await supabase.auth.getUser();
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
        set({ isInitialized: true });
        return;
      }

      console.log('[AUTH] initialize: user verified, proceeding');

      const statusCheck = await checkUserStatus(session.user.id);
      if (!statusCheck.allowed) {
        console.log('[AUTH] initialize: status check failed');
        await supabase.auth.signOut();
        set({ isInitialized: true });
        return;
      }

      const { profile, providerProfile } = await syncUserProfile(session.user);
      const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
      set({
        user: profile,
        providerProfile,
        isInitialized: true,
        sessionExpiresAt: expiresAt,
      });
      if (profile) {
        registerPushToken(profile.id).catch(() => {});
        useNotificationStore.getState().subscribeToNotifications(profile.id);
      }
    } catch {
      set({ isInitialized: true });
    }
  },

  validateSession: async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session?.user) {
        await get().signOut();
        return;
      }

      const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
      set({ sessionExpiresAt: expiresAt });

      if (!get().user) {
        const statusCheck = await checkUserStatus(session.user.id);
        if (!statusCheck.allowed) {
          await get().signOut();
          return;
        }
        const { profile, providerProfile } = await syncUserProfile(session.user);
        set({ user: profile, providerProfile });
        if (profile) {
          registerPushToken(profile.id).catch(() => {});
          useNotificationStore.getState().subscribeToNotifications(profile.id);
        }
      }
    } catch {
      await get().signOut();
    }
  },

  signIn: async (email, password, captchaToken) => {
    set({ isLoading: true });
    try {
      const lockout = await checkLoginAllowed(email);
      if (!lockout.allowed) {
        throw new Error(lockout.error || 'Account temporarily locked. Please try again later.');
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: captchaToken ? { captchaToken } : undefined,
      });
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
        const statusCheck = await checkUserStatus(data.user.id);
        if (!statusCheck.allowed) {
          await supabase.auth.signOut();
          throw new Error(statusCheck.error || 'Account access denied.');
        }
        await supabase.auth.refreshSession();
        const { data: { session } } = await supabase.auth.getSession();
        const expiresAt = session?.expires_at ? session.expires_at * 1000 : null;
        const { profile, providerProfile } = await syncUserProfile(data.user);
        set({ user: profile, providerProfile, sessionExpiresAt: expiresAt });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  signInWithGoogle: async () => {
    set({ isLoading: true });
    try {
      const redirectTo = makeRedirectUri({ scheme: 'com.servicehub.app' });
      console.log('[AUTH] Google OAuth redirectTo:', redirectTo);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (error) {
        console.log('[AUTH] signInWithOAuth error:', error.message);
        throw error;
      }
      if (!data?.url) {
        console.log('[AUTH] signInWithOAuth returned no URL');
        throw new Error('Failed to start Google sign-in. Please try again.');
      }

      console.log('[AUTH] Opening auth session...');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      console.log('[AUTH] Auth session result:', result.type);

      if (result.type === 'cancel') {
        console.log('[AUTH] User cancelled Google sign-in');
        return;
      }
      if (result.type === 'dismiss') {
        console.log('[AUTH] Google sign-in dismissed');
        return;
      }
      if (result.type !== 'success' || !result.url) {
        console.log('[AUTH] Auth session failed or returned no URL');
        throw new Error('Google sign-in was interrupted. Please try again.');
      }

      console.log('[GOOGLE] OAuth success');
      const url = new URL(result.url);
      const code = url.searchParams.get('code');
      const errorDesc = url.searchParams.get('error_description');
      if (errorDesc) {
        console.log('[AUTH] OAuth callback error:', errorDesc);
        throw new Error(errorDesc);
      }
      if (!code) {
        console.log('[AUTH] No authorization code in callback URL');
        throw new Error('Authentication failed. Please try again.');
      }

      console.log('[GOOGLE] Exchanging code for session...');
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        console.log('[GOOGLE] exchangeCodeForSession error:', exchangeError.message);
        throw exchangeError;
      }
      console.log('[GOOGLE] Session created via exchangeCodeForSession');

      const { data: { session } } = await supabase.auth.getSession();
      console.log('[GOOGLE] Session after exchange:', session ? 'present' : 'missing', 'userId:', session?.user?.id);

      if (session?.user) {
        console.log('[GOOGLE] Session user', session.user.email);
        console.log('[GOOGLE] app_metadata:', JSON.stringify(session.user.app_metadata));
        // Google OAuth emails are pre-verified by Google; do NOT enforce email_confirmed_at
        const statusCheck = await checkUserStatus(session.user.id);
        if (!statusCheck.allowed) {
          console.log('[GOOGLE] Status check failed, signing out');
          await supabase.auth.signOut();
          throw new Error(statusCheck.error || 'Account access denied.');
        }
        const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
        console.log('[GOOGLE] Calling syncUserProfile for userId:', session.user.id);
        const { profile, providerProfile } = await syncUserProfile(session.user);
        console.log('[GOOGLE] syncUserProfile result', profile);
        if (!profile) {
          console.error('[GOOGLE] syncUserProfile returned null profile — this should not happen for Google OAuth');
          throw new Error('Profile setup failed. Please try again.');
        }
        console.log('[GOOGLE] setting user state');
        set({ user: profile, providerProfile, sessionExpiresAt: expiresAt });
        console.log('[GOOGLE] User state set successfully — role:', profile.role, 'accepted_terms_at:', profile.accepted_terms_at);
        if (profile) {
          registerPushToken(profile.id).catch(() => {});
          useNotificationStore.getState().subscribeToNotifications(profile.id);
        }
      } else {
        console.log('[GOOGLE] No session after OAuth exchange');
        throw new Error('Unable to complete sign-in. Please try again.');
      }
    } catch (err) {
      console.log('[GOOGLE] sign-in error:', err instanceof Error ? err.message : String(err));
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
      if (error) {
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
            registerPushToken(profile.id).catch(() => {});
            useNotificationStore.getState().subscribeToNotifications(profile.id);
          }
        } else {
          // Profile is created automatically by the handle_new_user trigger.
          // Consent fields are passed via raw_user_meta_data and written by the trigger.
          // Do NOT auto-set user state here; email verification is required first.
          await supabase.auth.signOut();
          set({ user: null, providerProfile: null });
        }
      }
    } catch (err) {
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
      set({ user: profile, providerProfile, sessionExpiresAt: expiresAt });
      console.log('[VERIFY] State updated via set()');
      if (profile) {
        registerPushToken(profile.id).catch(() => {});
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
    if (user) {
      removePushToken(user.id).catch(() => {});
    }
    useNotificationStore.getState().unsubscribeFromNotifications();
    await supabase.auth.signOut();
    set({ user: null, providerProfile: null, sessionExpiresAt: null });
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
    if (!user) throw new Error('Not authenticated');

    console.log('[VERIFY] completeProfileSetup: updating profile for', user.id, { role: data.role });

    // 1. Update public.users with role, contact info, and consent
    const { error: updateError } = await supabase
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
      .eq('id', user.id);

    if (updateError) {
      console.error('[VERIFY] completeProfileSetup: users update error', updateError.message);
      throw updateError;
    }

    // 2. If role is provider, create a draft provider profile so ProviderNavigator works
    if (data.role === 'provider') {
      console.log('[VERIFY] completeProfileSetup: creating draft provider profile');
      const { error: providerError } = await supabase
        .from('providers')
        .upsert({
          id: user.id,
          business_name: data.full_name,
          status: 'draft',
          updated_at: new Date().toISOString(),
        });
      if (providerError) {
        console.error('[VERIFY] completeProfileSetup: provider upsert error', providerError.message);
        // Non-fatal: ProviderNavigator will still show onboarding
      }
    }

    // 3. Refresh session and sync user state
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { profile, providerProfile } = await syncUserProfile(session.user);
      const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
      console.log('[VERIFY] completeProfileSetup: state refreshed', {
        role: profile?.role,
        email_verified: profile?.email_verified,
        providerStatus: providerProfile?.status ?? 'none',
      });
      set({ user: profile, providerProfile, sessionExpiresAt: expiresAt });
      if (profile) {
        registerPushToken(profile.id).catch(() => {});
        useNotificationStore.getState().subscribeToNotifications(profile.id);
      }
    } else {
      throw new Error('Session lost during profile setup.');
    }
  },
}));
