import { supabase } from '../lib/supabase';

const VIEW_DEDUP_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Track a customer viewing a provider profile.
 *
 * Rules:
 * - Only counts if viewer is a logged-in customer (viewerId present).
 * - Skips if viewer is the provider themself.
 * - De-duplicates within 24 hours for the same viewer+provider pair.
 * - Wrapped in try/catch; failure never throws.
 *
 * @param providerId - UUID of the provider being viewed
 * @param viewerId   - UUID of the customer viewing (from auth user)
 */
export async function trackProviderView(
  providerId: string | undefined,
  viewerId: string | null | undefined,
): Promise<void> {
  if (!providerId || !viewerId) return;
  if (providerId === viewerId) return; // provider viewing own profile

  try {
    const cutoff = new Date(Date.now() - VIEW_DEDUP_MS).toISOString();
    const { data: existing } = await supabase
      .from('provider_views')
      .select('id')
      .eq('provider_id', providerId)
      .eq('viewer_id', viewerId)
      .gte('viewed_at', cutoff)
      .limit(1);

    if (existing && existing.length > 0) return;

    await supabase.from('provider_views').insert({
      provider_id: providerId,
      viewer_id: viewerId,
    });
  } catch {
    // Analytics is observational only — never block UI
  }
}
