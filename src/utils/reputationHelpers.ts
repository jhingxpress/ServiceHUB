/**
 * Pure helper to compute display-only reputation badges from provider data.
 * No database writes. No side effects.
 */

export interface ReputationBadge {
  key: string;
  label: string;
  icon: string; // Ionicons name
  color: string;
}

interface ProviderMetrics {
  is_featured: boolean;
  rating: number;
  total_reviews: number;
  completed_jobs: number;
  response_rate: number;
  average_response_minutes: number;
  profile_views: number;
  total_bookings: number;
  completion_rate: number;
}

export function computeReputationBadges(metrics: Partial<ProviderMetrics>): ReputationBadge[] {
  const badges: ReputationBadge[] = [];

  const {
    is_featured,
    rating,
    total_reviews,
    completed_jobs,
    response_rate,
    average_response_minutes,
    profile_views,
    total_bookings,
    completion_rate,
  } = metrics;

  // ⭐ Featured
  if (is_featured) {
    badges.push({ key: 'featured', label: 'Featured', icon: 'star', color: '#F59E0B' });
  }

  // ⚡ Fast Responder
  const rr = response_rate ?? 0;
  const arm = average_response_minutes ?? Infinity;
  if (rr >= 0.9 || arm < 60) {
    badges.push({ key: 'fast_responder', label: 'Fast Responder', icon: 'flash', color: '#3B82F6' });
  }

  // 🏆 Top Rated
  if ((rating ?? 0) >= 4.8 && (total_reviews ?? 0) >= 10) {
    badges.push({ key: 'top_rated', label: 'Top Rated', icon: 'trophy', color: '#8B5CF6' });
  }

  // 🔥 Trending
  const pv = profile_views ?? 0;
  const tb = total_bookings ?? 0;
  if (pv >= 100 || tb >= 30) {
    badges.push({ key: 'trending', label: 'Trending', icon: 'flame', color: '#EF4444' });
  }

  // 💎 Elite Provider
  if (
    (rating ?? 0) >= 4.5 &&
    (completed_jobs ?? 0) >= 50 &&
    (total_reviews ?? 0) >= 20 &&
    (completion_rate ?? 0) >= 0.85
  ) {
    badges.push({ key: 'elite', label: 'Elite Provider', icon: 'diamond', color: '#06B6D4' });
  }

  // 👑 Trusted Provider
  const cr = completion_rate ?? 0;
  if (
    (rating ?? 0) >= 4.5 &&
    rr >= 0.9 &&
    cr >= 0.9 &&
    (total_reviews ?? 0) >= 10
  ) {
    badges.push({ key: 'trusted', label: 'Trusted Provider', icon: 'shield-checkmark', color: '#10B981' });
  }

  return badges;
}
