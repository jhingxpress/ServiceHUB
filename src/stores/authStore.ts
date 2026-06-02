import { create } from 'zustand';
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
  signUp: (data: SignUpData) => Promise<void>;
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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  providerProfile: null,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();
        const providerProfile =
          profile?.role === 'provider'
            ? await fetchProviderProfile(session.user.id)
            : null;
        set({ user: profile ?? null, providerProfile, isInitialized: true });
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
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();
        const providerProfile =
          profile?.role === 'provider'
            ? await fetchProviderProfile(session.user.id)
            : null;
        set({ user: profile ?? null, providerProfile });
        if (profile) {
          registerPushToken(profile.id).catch(() => {});
        }
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
        // Refresh session to ensure JWT includes latest role from database
        await supabase.auth.refreshSession();
        
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', data.user.id)
          .single();
        if (profileError) throw profileError;
        const providerProfile =
          profile?.role === 'provider'
            ? await fetchProviderProfile(data.user.id)
            : null;
        set({ user: profile, providerProfile });
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
          data: { full_name: fullName, role },
        },
      });
      if (error) throw error;
      if (data.user) {
        // The trigger handles users insert; manually insert if trigger not active
        const { error: upsertError } = await supabase.from('users').upsert({
          id: data.user.id,
          email,
          full_name: fullName,
          phone: phone ?? null,
          role,
        });
        if (upsertError && upsertError.code !== '23505') throw upsertError;

        if (role === 'provider') {
          await supabase.from('providers').upsert({ id: data.user.id });
        }

        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', data.user.id)
          .single();
        const providerProfile =
          role === 'provider' ? await fetchProviderProfile(data.user.id) : null;
        set({ user: profile ?? null, providerProfile });
      }
    } finally {
      set({ isLoading: false });
    }
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
