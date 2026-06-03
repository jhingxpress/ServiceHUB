import { create } from 'zustand';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../lib/supabase';
import { User, Provider } from '../types';
import { registerPushToken, removePushToken } from '../services/notificationService';

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
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (data: SignUpData) => Promise<void>;
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

async function syncUserProfile(sessionUser: { id: string; email?: string; user_metadata?: Record<string, any>; email_confirmed_at?: string | null }): Promise<{ profile: User | null; providerProfile: Provider | null }> {
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
        full_name: sessionUser.user_metadata?.full_name ?? sessionUser.user_metadata?.name ?? '',
        avatar_url: sessionUser.user_metadata?.avatar_url ?? sessionUser.user_metadata?.picture ?? null,
        role: (sessionUser.user_metadata?.role as any) ?? 'customer',
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

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        const { profile, providerProfile } = await syncUserProfile(session.user);
        set({ user: profile, providerProfile, isInitialized: true });
        if (profile) {
          registerPushToken(profile.id).catch(() => {});
        }
      } else {
        set({ isInitialized: true });
      }
    } catch {
      set({ isInitialized: true });
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const { profile, providerProfile } = await syncUserProfile(session.user);
        set({ user: profile, providerProfile });
        if (profile) {
          registerPushToken(profile.id).catch(() => {});
        }
      } else if (event === 'USER_UPDATED' && session?.user) {
        const { profile, providerProfile } = await syncUserProfile(session.user);
        set({ user: profile, providerProfile });
      } else if (event === 'SIGNED_OUT') {
        set({ user: null, providerProfile: null });
      }
    });
  },

  signIn: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      if (data.user) {
        await supabase.auth.refreshSession();
        const { profile, providerProfile } = await syncUserProfile(data.user);
        set({ user: profile, providerProfile });
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
            const { profile, providerProfile } = await syncUserProfile(session.user);
            set({ user: profile, providerProfile });
          }
        }
      }
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async ({ email, password, fullName, role, phone }) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role, phone: phone ?? null },
        },
      });
      if (error) throw error;
      if (data.user) {
        // Upsert ensures profile exists even if trigger missed it
        const { error: upsertError } = await supabase.from('users').upsert({
          id: data.user.id,
          email,
          full_name: fullName,
          phone: phone ?? null,
          role,
          email_verified: false,
        });
        if (upsertError && upsertError.code !== '23505') throw upsertError;

        if (role === 'provider') {
          await supabase.from('providers').upsert({ id: data.user.id });
        }

        // Do NOT auto-set user state here; email verification is required first
        set({ user: null, providerProfile: null });
      }
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
    if (isVerified && get().user && !get().user!.email_verified) {
      await supabase
        .from('users')
        .update({ email_verified: true })
        .eq('id', session.user.id);
      const { profile, providerProfile } = await syncUserProfile(session.user);
      set({ user: profile, providerProfile });
    }
    return isVerified;
  },

  signOut: async () => {
    const { user } = get();
    if (user) {
      removePushToken(user.id).catch(() => {});
    }
    await supabase.auth.signOut();
    set({ user: null, providerProfile: null });
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
