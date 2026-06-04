import { create } from 'zustand';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../lib/supabase';
import { User, Provider } from '../types';
import { registerPushToken, removePushToken } from '../services/notificationService';
import { checkLoginAllowed, logLoginAttempt, checkUserStatus } from '../services/securityService';
import { useNotificationStore } from './notificationStore';

interface SignUpData {
  email: string;
  password: string;
  fullName: string;
  role: 'customer' | 'provider';
  phone?: string;
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
  checkEmailVerified: () => Promise<boolean>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Omit<User, 'id' | 'created_at'>>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshProviderProfile: () => Promise<void>;
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
        email_verified: sessionUser.email_confirmed_at ? true : false,
      })
      .select()
      .single();
    profile = newProfile as User | null;
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

    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session?.user) {
        set({ isInitialized: true });
        return;
      }

      // Enforce email verification on cold boot
      if (!session.user.email_confirmed_at) {
        await supabase.auth.signOut();
        set({ isInitialized: true });
        return;
      }

      const statusCheck = await checkUserStatus(session.user.id);
      if (!statusCheck.allowed) {
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const statusCheck = await checkUserStatus(session.user.id);
        if (!statusCheck.allowed) {
          await supabase.auth.signOut();
          set({ user: null, providerProfile: null, sessionExpiresAt: null });
          useNotificationStore.getState().unsubscribeFromNotifications();
          return;
        }
        const { profile, providerProfile } = await syncUserProfile(session.user);
        const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
        set({ user: profile, providerProfile, sessionExpiresAt: expiresAt });
        if (profile) {
          registerPushToken(profile.id).catch(() => {});
          useNotificationStore.getState().subscribeToNotifications(profile.id);
        }
      } else if (event === 'USER_UPDATED' && session?.user) {
        const statusCheck = await checkUserStatus(session.user.id);
        if (!statusCheck.allowed) {
          await supabase.auth.signOut();
          set({ user: null, providerProfile: null, sessionExpiresAt: null });
          useNotificationStore.getState().unsubscribeFromNotifications();
          return;
        }
        const { profile, providerProfile } = await syncUserProfile(session.user);
        const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
        set({ user: profile, providerProfile, sessionExpiresAt: expiresAt });
      } else if (event === 'TOKEN_REFRESHED' && session) {
        const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
        set({ sessionExpiresAt: expiresAt });
      } else if (event === 'SIGNED_OUT') {
        set({ user: null, providerProfile: null, sessionExpiresAt: null });
        useNotificationStore.getState().unsubscribeFromNotifications();
      }
    });

    set({ authListenerUnsubscribe: subscription.unsubscribe });
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
        if (!data.user.email_confirmed_at) {
          await supabase.auth.signOut();
          throw new Error('Please verify your email before signing in.');
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

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type === 'success' && result.url) {
          const url = new URL(result.url);
          const code = url.searchParams.get('code');
          if (code) {
            await supabase.auth.exchangeCodeForSession(code);
          }
          await supabase.auth.refreshSession();
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            // Enforce email verification for Google sign-in
            if (!session.user.email_confirmed_at) {
              await supabase.auth.signOut();
              throw new Error('Please verify your email before signing in.');
            }
            const statusCheck = await checkUserStatus(session.user.id);
            if (!statusCheck.allowed) {
              await supabase.auth.signOut();
              throw new Error(statusCheck.error || 'Account access denied.');
            }
            const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
            const { profile, providerProfile } = await syncUserProfile(session.user);
            set({ user: profile, providerProfile, sessionExpiresAt: expiresAt });
          }
        }
      }
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async ({ email, password, fullName, role, phone }, captchaToken) => {
    console.log('[AUTHSTORE] signUp called');
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role, phone: phone ?? null },
          captchaToken,
        },
      });
      if (error) {
        console.log('[AUTHSTORE] signUp failed:', error.message);
        throw error;
      }
      if (data.user) {
        console.log('[AUTHSTORE] signUp success for user:', data.user.id);
        // Upsert ensures profile exists even if trigger missed it
        const { error: upsertError } = await supabase.from('users').upsert({
          id: data.user.id,
          email,
          full_name: fullName,
          phone: phone ?? null,
          role,
          email_verified: false,
        });
        if (upsertError && upsertError.code !== '23505') {
          console.log('[AUTHSTORE] signUp users upsert failed:', upsertError.message);
          throw upsertError;
        }

        if (role === 'provider') {
          const { error: providerError } = await supabase.from('providers').upsert({ id: data.user.id });
          if (providerError) {
            console.log('[AUTHSTORE] signUp providers upsert failed:', providerError.message);
          }
        }

        // Do NOT auto-set user state here; email verification is required first
        set({ user: null, providerProfile: null });
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
    });
    if (error) throw error;
  },

  checkEmailVerified: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return false;
    const isVerified = session.user.email_confirmed_at != null;
    const currentUser = get().user;
    if (isVerified && currentUser && !currentUser.email_verified) {
      await supabase
        .from('users')
        .update({ email_verified: true })
        .eq('id', session.user.id);
      const { profile, providerProfile } = await syncUserProfile(session.user);
      const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
      set({ user: profile, providerProfile, sessionExpiresAt: expiresAt });
    }
    return isVerified;
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
}));
