// Centralized feature flags
// BETA_MODE = false enforces email verification on all sign-in/sign-up flows.

export const BETA_MODE = false;

export const ENABLE_GOOGLE_SIGNIN = true;

// Identity verification live selfie — default false.
// Server-side override via platform_config RPC (get_feature_flags).
// Local dev override: EXPO_PUBLIC_IDV_LIVE_SELFIE=1
export const IDENTITY_LIVE_SELFIE_ENABLED = false;
