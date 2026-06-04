# ServiceHub Mobile App — Security & Code Quality Audit

**Date:** 2026-06-04
**Scope:** React Native (Expo) client codebase (`src/`, `App.tsx`, `package.json`)
**Auditor:** AI Assistant

---

## Executive Summary

The ServiceHub app is a well-structured React Native Expo application using **Supabase** as its BaaS, **Zustand** for state management, and **TypeScript** with strict mode enabled. The codebase demonstrates mature architectural patterns (separated stores, services, navigation, and components) and includes security-conscious features such as rate-limiting RPCs, reCAPTCHA v3 integration, account status checks, and email verification gating.

However, **critical security and production-readiness issues exist** that should be addressed before the app is deployed to production.

---

## 1. Security Findings

### 1.1 CRITICAL — Real Credentials Committed to `.env.example`
**File:** `.env.example`  
**Issue:** The file contains what appears to be a real Supabase project URL and anon key.

```
EXPO_PUBLIC_SUPABASE_URL=https://tnxepxdgqaikmnoyubyn.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_93c6aHq3t9pc5HPDVTa95A_VvXYrJrY
```

**Impact:** Even in an `.env.example` file, committing real credentials to version control exposes the Supabase project. The anon key can be used to query any table with public/select permissions.

**Recommendation:**
- Immediately rotate the Supabase anon key via the Supabase Dashboard.
- Replace `.env.example` with placeholder values:
  ```
  EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
  EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
  ```

---

### 1.2 HIGH — Hardcoded EAS Project ID
**File:** `src/services/notificationService.ts:7`

```typescript
const EAS_PROJECT_ID = '8fcfed4e-bbe6-4787-a1c1-88ae62fbf65d';
```

**Impact:** The EAS Project ID is not a secret per se, but hardcoding it reduces flexibility for white-labeling or staging environments.

**Recommendation:** Move to an environment variable:
```typescript
const EAS_PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '';
```

---

### 1.3 HIGH — Debug Logs Leaking reCAPTCHA Tokens
**File:** `src/screens/auth/LoginScreen.tsx:55-58`

```typescript
console.log('BEFORE RECAPTCHA');
const captchaToken = await execute('login');
console.log('RECAPTCHA TOKEN:', captchaToken);
```

**Impact:** reCAPTCHA tokens are single-use verification artifacts. Logging them to the console means they can be extracted from device logs via `adb logcat` or Xcode Instruments, undermining the anti-bot protection.

**Recommendation:** Remove all debug `console.log` statements from auth flows, especially those touching tokens, credentials, or PII.

---

### 1.4 MEDIUM — Rate-Limiting Fails Open
**File:** `src/services/securityService.ts:21-34`

```typescript
export async function checkLoginAllowed(email: string): Promise<SecurityCheckResult> {
  const { data, error } = await supabase.rpc('is_account_locked', { p_email: email });
  if (error) {
    console.error('is_account_locked error:', error);
    return { allowed: true }; // Fail open on RPC error
  }
  ...
}
```

**Impact:** If the Supabase Edge Function or RPC is unreachable (network error, DDoS, misconfiguration), the app allows the login attempt to proceed, bypassing account lockout protections.

**Recommendation:** Implement a **fail-closed** policy. On RPC failure, deny the action and show a user-friendly retry message:
```typescript
if (error) {
  console.error('is_account_locked error:', error);
  return { allowed: false, error: 'Security check unavailable. Please try again shortly.' };
}
```

> Apply the same fix to `checkRegistrationAllowed` in the same file.

---

### 1.5 MEDIUM — Email Verification Not Enforced on Login
**File:** `src/stores/authStore.ts:183-215` (`signIn` method)  
**File:** `src/navigation/RootNavigator.tsx:27-35`

**Issue:** After `signInWithPassword` succeeds, the app immediately routes the user based on `user.role` without verifying `email_confirmed_at`. Supabase project settings *may* enforce this server-side, but relying on that is fragile. If the project setting is toggled off, unverified users get full app access.

**Recommendation:** Add an explicit email-verified check in `signIn`:
```typescript
if (!data.user.email_confirmed_at) {
  throw new Error('Please verify your email before signing in.');
}
```

---

### 1.6 MEDIUM — Supabase Client Created with Undefined Config
**File:** `src/lib/supabase.ts:8-13`

```typescript
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] CRITICAL: Missing ...');
}
export const supabase = createClient(supabaseUrl, supabaseAnonKey, { ... });
```

**Issue:** If env vars are missing, the client is still created with `undefined` values. Runtime errors will occur later, making debugging harder.

**Recommendation:** Throw immediately on missing config:
```typescript
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
}
```

---

### 1.7 LOW — Auth Listener Not Guarded Against Double Registration
**File:** `src/stores/authStore.ts:84-151` (`initialize`)

**Issue:** `supabase.auth.onAuthStateChange` is called inside `initialize()`. If `initialize()` is ever invoked a second time (e.g., during a hot reload in development or a future code path), a second listener is registered. There is no stored subscription handle to clean up.

**Recommendation:** Store the subscription and guard against duplicate registration:
```typescript
let authSubscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  ...
  initialize: async () => {
    if (authSubscription) return; // already initialized
    ...
    authSubscription = supabase.auth.onAuthStateChange(async (event, session) => { ... });
  },
}));
```

---

## 2. Code Quality & Type Safety

### 2.1 Excessive `any` Type Usage
**Impact:** Reduces TypeScript's value and allows runtime bugs to slip through.

**Files with notable `any` usage:**
- `src/stores/authStore.ts:46,62`
- `src/services/securityService.ts:109-110`
- `src/screens/shared/ReportScreen.tsx:26`
- `src/screens/provider/ProviderMessagesScreen.tsx:55,97`
- `src/screens/provider/ProviderReviewsScreen.tsx:137`
- `src/screens/provider/ProviderServicePreviewScreen.tsx:84`
- `src/screens/provider/ProviderSettingsScreen.tsx:35,38,85-87`
- `src/screens/provider/ScheduleScreen.tsx:62`
- `src/screens/provider/ProviderOnboardingScreen.tsx:183,188,189,198,216`
- `src/screens/provider/ProviderApplicationScreen.tsx:96`
- `src/screens/auth/LoginScreen.tsx:62`

**Recommendation:** Replace explicit `any` with proper types or `unknown` + runtime validation. Use `Record<string, unknown>` for generic metadata instead of `any`.

---

### 2.2 Debug `console.log` / `console.error` Statements
**Impact:** Clutters production logs, leaks internal state, and may expose PII or tokens.

**Notable occurrences:**
- `src/screens/auth/LoginScreen.tsx` — logs reCAPTCHA tokens, login flow steps
- `src/screens/provider/ProviderOnboardingScreen.tsx:393-417` — logs entire payloads and user IDs
- `src/screens/provider/ProviderMessagesScreen.tsx:81,97,105,113,119` — logs realtime message IDs
- `src/services/securityService.ts:103-115` — logs reCAPTCHA verification data and error bodies
- `src/services/notificationService.ts:77,92,103,126,128,150,153` — logs push token fragments and device IDs
- `src/stores/authStore.ts` — no logs, but many services around it do

**Recommendation:** Strip all non-error console output for production. Use a logging utility that respects `__DEV__`:
```typescript
const log = __DEV__ ? console.log : () => {};
```

---

### 2.3 Non-Functional "Forgot Password?" Button
**File:** `src/screens/auth/LoginScreen.tsx:133-135`

```typescript
<TouchableOpacity style={styles.forgotLink}>
  <Text style={styles.forgotText}>Forgot password?</Text>
</TouchableOpacity>
```

**Issue:** The button is not pressable (`onPress` missing). Users will tap it and nothing happens.

**Recommendation:** Wire it to a password-reset screen or Supabase's `resetPasswordForEmail` flow, or remove it until implemented.

---

### 2.4 Debug Styling Left in Production
**File:** `src/screens/auth/LoginScreen.tsx:240`

```typescript
googleBtn: {
  ...
  borderColor: 'red',
  ...
}
```

**Issue:** The Google sign-in button has a red border, likely left from debugging.

**Recommendation:** Remove or replace with `COLORS.border`.

---

## 3. Architecture & Performance

### 3.1 Positive: Clean Separation of Concerns
- **Stores** (`authStore.ts`, `notificationStore.ts`) isolate state logic.
- **Services** (`securityService.ts`, `notificationService.ts`, `moderationService.ts`) handle side effects.
- **Navigation** is well-typed with `RootStackParamList`, `AuthStackParamList`, etc.
- **Realtime subscriptions** in `CustomerNavigator.tsx` and `notificationStore.ts` are properly cleaned up with `removeChannel`.

### 3.2 Positive: Good Security Patterns
- `checkUserStatus` is called on every auth state change, preventing banned/suspended users from accessing the app.
- `ErrorBoundary` wraps the entire app UI tree.
- `EmailVerificationBanner` is rendered at the root level.

### 3.3 Minor: `useFocusEffect` Could Trigger Excessive Refetching
**File:** `src/screens/provider/ProviderMessagesScreen.tsx:78-83`

```typescript
useFocusEffect(
  useCallback(() => {
    console.log('[ProviderMessages] focus -> re-fetching threads');
    loadThreads();
  }, [loadThreads])
);
```

**Issue:** `loadThreads` is likely recreated on every render unless wrapped in `useCallback`. This means every focus triggers a fresh network request and re-subscription to the realtime channel, which may cause flicker or unnecessary load.

**Recommendation:** Memoize `loadThreads` with `useCallback` and an empty dependency array if its inputs are stable (e.g., `user.id`).

---

## 4. Data Integrity & Edge Cases

### 4.1 Missing Error Handling in `updateProfile`
**File:** `src/stores/authStore.ts:328-339`

```typescript
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
```

**Issue:** If the update partially fails or returns a row-level security (RLS) block, the error is thrown but the UI may not show a clear message. This is generally fine if callers catch it, but worth documenting.

---

### 4.2 `syncUserProfile` Manual Upsert Race Condition
**File:** `src/stores/authStore.ts:46-75`

**Issue:** If the Supabase auth trigger fails to create the `users` row, `syncUserProfile` performs an upsert. Two simultaneous sign-in attempts on a new account could race and one could receive a `23505` unique violation. The code does check `error.code !== '23505'` in `signUp`, but `syncUserProfile` itself does not handle the conflict.

**Recommendation:** Wrap the manual upsert in a retry or gracefully swallow `23505` in `syncUserProfile`.

---

## 5. Recommendations Summary

| Priority | Item | File(s) |
|---|---|---|
| **Critical** | Rotate Supabase anon key; sanitize `.env.example` | `.env.example` |
| **High** | Remove reCAPTCHA token logging | `LoginScreen.tsx`, `securityService.ts` |
| **High** | Move EAS_PROJECT_ID to env var | `notificationService.ts` |
| **Medium** | Change rate-limiting to fail-closed | `securityService.ts` |
| **Medium** | Enforce email verification check in `signIn` | `authStore.ts` |
| **Medium** | Throw on missing Supabase config | `lib/supabase.ts` |
| **Medium** | Guard `onAuthStateChange` against duplicate registration | `authStore.ts` |
| **Medium** | Replace `any` types with proper types | `src/**/*.ts{,x}` |
| **Low** | Implement "Forgot password?" or remove it | `LoginScreen.tsx` |
| **Low** | Remove debug red border from Google button | `LoginScreen.tsx` |
| **Low** | Strip all `console.log` for production | `src/**/*.ts{,x}` |
| **Low** | Memoize `loadThreads` in ProviderMessagesScreen | `ProviderMessagesScreen.tsx` |

---

## 6. Overall Assessment

| Category | Score | Notes |
|---|---|---|
| **Architecture** | 8/10 | Clean separation, well-typed navigation, good use of Zustand. |
| **Security** | 5/10 | Good patterns (RLS, rate-limiting, captcha) but undermined by credential leakage, debug logging, and fail-open logic. |
| **Type Safety** | 6/10 | Strict mode enabled, but `any` is used liberally in screen files. |
| **Production Readiness** | 5/10 | Debug artifacts (logs, red borders) need cleanup before release. |
| **Maintainability** | 7/10 | Consistent patterns, good component reuse, clear naming. |

---

*End of Audit Report*
