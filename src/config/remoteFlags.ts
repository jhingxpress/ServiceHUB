/**
 * Remote feature flag loader.
 *
 * Uses a SECURITY DEFINER RPC (`get_feature_flags`) that returns only
 * allowlisted client-safe flags from platform_config. No direct table
 * access is granted to authenticated users.
 *
 * Local dev override: set EXPO_PUBLIC_IDV_LIVE_SELFIE=1 to force-enable
 * the live selfie flag without a server round-trip.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Platform } from 'react-native';

type FlagMap = Record<string, boolean>;

const LOCAL_OVERRIDES: FlagMap = {
  identity_live_selfie_enabled:
    process.env.EXPO_PUBLIC_IDV_LIVE_SELFIE === '1',
};

let cachedFlags: FlagMap | null = null;

export async function loadRemoteFlags(): Promise<FlagMap> {
  if (cachedFlags !== null) return cachedFlags;

  try {
    const { data, error } = await supabase.rpc('get_feature_flags');
    if (error) {
      console.warn('[remoteFlags] RPC error:', error.message);
      cachedFlags = {};
      return cachedFlags;
    }

    const flags: FlagMap = {};
    if (Array.isArray(data)) {
      for (const row of data) {
        flags[row.key] = row.value === 'true';
      }
    }

    // Apply local dev overrides on top of server values
    for (const [k, v] of Object.entries(LOCAL_OVERRIDES)) {
      if (v) flags[k] = true;
    }

    cachedFlags = flags;
    return flags;
  } catch (err) {
    console.warn('[remoteFlags] Failed to load flags:', err);
    cachedFlags = {};
    return cachedFlags;
  }
}

export function useRemoteFlag(key: string): {
  enabled: boolean;
  loading: boolean;
} {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Fast path: local dev override
    if (LOCAL_OVERRIDES[key]) {
      setEnabled(true);
      setLoading(false);
      return;
    }

    const flags = await loadRemoteFlags();
    setEnabled(flags[key] ?? false);
    setLoading(false);
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  return { enabled, loading };
}

export function getDevicePlatform(): string {
  return Platform.OS;
}
