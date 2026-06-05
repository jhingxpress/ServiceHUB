// Centralized feature flags for Beta Mode
// Set BETA_MODE = false to restore full authentication enforcement.

export const BETA_MODE = true;

export const ENABLE_GOOGLE_SIGNIN = !BETA_MODE;
