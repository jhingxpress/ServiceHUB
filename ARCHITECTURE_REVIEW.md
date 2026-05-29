# ServiceHub Architecture Review & Renovation Report

**Date:** 2026-05-29
**Scope:** Production-grade architecture renovation without rebuilding the project

---

## 1. Architecture Review Summary

### Issues Identified

| Category | Issue | Severity |
|----------|-------|----------|
| Schema | Duplicate KYC fields in `providers` table (legacy from users) | Medium |
| Schema | Missing `provider_type` (individual vs business) | High |
| Schema | Missing storefront fields (cover_photo, business_logo, response_rate, etc.) | High |
| Schema | Missing GPS discovery fields (service_radius_km) | High |
| Schema | Booking status missing `on_the_way` and `arrived` states | High |
| Schema | No enforcement that only completed bookings can be reviewed | Critical |
| Schema | Missing tables: service_images, provider_gallery, provider_badges, favorite_providers | High |
| Schema | Missing indexes for GPS queries and compound lookups | Medium |
| Types | TypeScript types out of sync with schema | Medium |
| Policy | Missing RLS policies for new tables | High |
| Screens | Provider profile insufficient for marketplace storefront | High |
| Screens | Booking workflow skips arrival tracking | Medium |

---

## 2. Changes Implemented

### 2.1 Database Schema (`supabase/schema.sql` + migration)

**Migration File:** `supabase/migrations/20260529_architecture_renovation.sql`

#### Provider Storefront Fields Added:
- `provider_type` (individual | business)
- `cover_photo` (URL for storefront banner)
- `business_logo` (URL for provider avatar/logo)
- `member_since` (TIMESTAMPTZ for trust display)
- `response_rate` (0-100 integer)
- `service_radius_km` (1-100 integer for GPS discovery)

#### New Tables Created:
| Table | Purpose |
|-------|---------|
| `service_images` | Photos per service offering |
| `provider_gallery` | Portfolio/before-after photos |
| `provider_badges` | Reputation badges (verified, top_rated, etc.) |
| `favorite_providers` | Customer saved providers |

#### Booking Workflow Upgraded:
- Added statuses: `on_the_way`, `arrived`
- Added `provider_latitude` / `provider_longitude` to bookings

#### Indexes Added:
- `idx_providers_location` (lat/lng with approved filter for GPS)
- `idx_bookings_status_provider` (compound for active jobs)
- `idx_bookings_status_customer` (compound for customer bookings)
- Indexes for all new tables

#### Triggers Added:
| Trigger | Purpose |
|---------|---------|
| `reviews_validate_booking_status` | Enforces: only completed bookings can be reviewed |
| `providers_update_badges` | Auto-awards badges based on stats |
| `bookings_update_response_rate` | Recalculates response rate on status change |

#### RLS Policies Added:
- Service Images (public read, provider manage)
- Provider Gallery (public read, provider manage)
- Provider Badges (public read, admin manage)
- Favorite Providers (customer manage, provider read)

#### Seed Data:
- Added 6 new categories: LPG Delivery, Water Delivery, Towing, Welding, Construction, Courier Services

---

### 2.2 TypeScript Types (`src/types/index.ts`)

- Added `ProviderType = 'individual' | 'business'`
- Added `BookingStatus` values: `on_the_way`, `arrived`
- Updated `Provider` interface with storefront fields
- Added interfaces:
  - `ServiceImage`
  - `ProviderGallery`
  - `ProviderBadge`
  - `FavoriteProvider`

---

### 2.3 App Constants (`src/constants/app.ts`)

- Added `ON_THE_WAY` and `ARRIVED` to `BOOKING_STATUS`

---

### 2.4 Provider Storefront Screen (`src/screens/customer/ProviderStorefrontScreen.tsx`)

New screen with:
- **Header:** Cover photo, business logo, verified badge, category
- **Trust Metrics:** Rating, completed jobs, response rate, member since
- **Badges:** Verified, Fast Responder, Top Rated, 100+ Jobs, etc.
- **About:** Description, address, phone, provider type, experience
- **Services:** Bookable services with pricing
- **Gallery:** Horizontal scroll of portfolio photos
- **Reviews:** Customer reviews with ratings
- **Actions:** Favorite toggle, Chat, Book Service button

---

### 2.5 Booking Workflow Upgrade (`src/screens/provider/BookingRequestsScreen.tsx`)

Updated workflow:
```
pending → accepted → on_the_way → arrived → in_progress → completed
```

- Added "On The Way" action button (blue)
- Added "Arrived" action button (purple)
- Existing Start Job and Complete buttons preserved

---

### 2.6 Favorites System (`src/hooks/useFavorites.ts`)

- `useFavorites()` hook for customers
- Toggle favorite with optimistic UI
- Fetches with provider relation

---

### 2.7 Navigation Updates

- Added `ProviderStorefront` to `CustomerStackParamList`
- Registered screen in `CustomerNavigator`

---

## 3. GPS Discovery Architecture (Implemented)

### Database Function:
```sql
-- Haversine distance function (km)
SELECT public.haversine_distance(customer_lat, customer_lng, provider_lat, provider_lng);
```

### Client-Side Implementation:
- `SearchScreen` has "Near Me" toggle with location icon
- Client-side Haversine calculation filters providers by service radius
- Distance displayed on provider cards in km
- Default center: Digos City, Davao del Sur (6.7478, 125.2943)

**Production Enhancement:** Replace hardcoded location with `expo-location` permission request.

---

## 4. Trust System Architecture

### Badges Auto-Awarded:
| Badge | Condition |
|-------|-----------|
| Verified Provider | `is_verified = TRUE` |
| Fast Responder | `response_rate >= 90` |
| Top Rated | `rating >= 4.5` AND `total_reviews >= 10` |
| 100+ Jobs | `completed_jobs >= 100` |
| 50+ Jobs | `completed_jobs >= 50` |

### Review Enforcement:
- Database trigger `reviews_validate_booking_status` prevents reviews on non-completed bookings
- Returns error: "Reviews can only be created for completed bookings"

---

## 5. Provider Stats System (Denormalized)

Table: `provider_stats`

| Field | Source |
|-------|--------|
| completed_jobs | providers.completed_jobs |
| total_reviews | providers.total_reviews |
| average_rating | providers.rating |
| response_rate | providers.response_rate |
| favorite_count | COUNT(favorite_providers) |

**Sync Triggers:**
- `providers_sync_stats` - Updates on provider insert/update
- `favorites_sync_count` - Updates on favorite insert/delete

---

## 6. Notification Architecture

Table: `notifications`

**Auto-created by booking triggers:**
| Event | Recipient | Type |
|-------|-----------|------|
| New booking | Provider | booking_submitted |
| Accepted | Customer | booking_accepted |
| Rejected | Customer | booking_rejected |
| On the way | Customer | provider_on_the_way |
| Arrived | Customer | provider_arrived |
| Completed | Customer | service_completed |

**Hook:** `useNotifications()` - fetch, mark read, unread count

---

## 7. Verification System Fix

### Root Cause:
- Missing `rejected_at`/`rejected_by` fields on providers table
- Trigger unconditionally set `is_verified = FALSE` on any non-approved status update
- No `rejected_by` tracking

### Fix:
- Added `rejected_at` and `rejected_by` columns
- Updated `handle_provider_status_change` trigger to only act on actual transitions
- Admin screens now set `approved_by` and `rejected_by` fields
- Document-level approve/reject/resubmit added to `ProviderDetailScreen`

---

## 8. Critical Bugs Fixed

| Bug | File | Fix |
|-----|------|-----|
| `avg_rating` field doesn't exist | HomeScreen, SearchScreen, ProviderListScreen, CategoryListScreen | Changed to `rating` |
| Provider cards navigate to old profile | HomeScreen, SearchScreen, ProviderListScreen, CategoryListScreen | Changed to `ProviderStorefront` |
| Active bookings filter too narrow | BookingHistoryScreen | Now includes `on_the_way`, `arrived`, `in_progress` |
| Booking progress missing statuses | BookingDetailScreen | Added `on_the_way`, `arrived` to tracker |
| Missing status colors | theme.ts | Added `on_the_way`, `arrived` to STATUS_COLORS |
| Admin KYC uses legacy fields | AdminKYCScreen | Now filters by `status = 'pending_review'` |
| Search uses `kyc_status` | SearchScreen | Changed to `status = 'approved'` |

---

## 9. Migration Execution Instructions

Run in Supabase SQL Editor:

```sql
-- Copy-paste contents of:
supabase/migrations/20260529_architecture_renovation.sql
```

Or run via psql:
```bash
psql -h <host> -d postgres -U postgres -f supabase/migrations/20260529_architecture_renovation.sql
```

---

## 10. Files Modified

| File | Changes |
|------|---------|
| `supabase/schema.sql` | Complete schema with 22 sections, all tables, triggers, policies |
| `supabase/migrations/20260529_architecture_renovation.sql` | Master migration (22 steps) |
| `src/types/index.ts` | Added Notification, ProviderStats, rejected fields |
| `src/constants/theme.ts` | Added `on_the_way`, `arrived` STATUS_COLORS |
| `src/constants/app.ts` | Added `ON_THE_WAY`, `ARRIVED` booking statuses |
| `src/navigation/types.ts` | Added `ProviderStorefront` route |
| `src/navigation/CustomerNavigator.tsx` | Registered storefront screen |
| `src/screens/admin/PendingProvidersScreen.tsx` | Added `rejected_by` field |
| `src/screens/admin/ProviderDetailScreen.tsx` | Document approve/reject/resubmit actions |
| `src/screens/admin/AdminKYCScreen.tsx` | Uses `status` instead of legacy `kyc_status` |
| `src/screens/customer/HomeScreen.tsx` | Fixed `rating` sort, storefront navigation |
| `src/screens/customer/SearchScreen.tsx` | Fixed `rating`, added GPS nearby search |
| `src/screens/customer/ProviderListScreen.tsx` | Fixed `rating`, storefront navigation |
| `src/screens/customer/CategoryListScreen.tsx` | Fixed `rating`, storefront navigation |
| `src/screens/customer/BookingHistoryScreen.tsx` | Added new statuses to filters |
| `src/screens/customer/BookingDetailScreen.tsx` | Added new statuses to tracker |
| `src/screens/customer/ProviderStorefrontScreen.tsx` | New storefront with favorites + stats |
| `src/screens/provider/BookingRequestsScreen.tsx` | Added `on_the_way`, `arrived` actions |
| `src/hooks/useFavorites.ts` | Toggle favorite with optimistic UI |
| `src/hooks/useNotifications.ts` | Fetch notifications, unread count |

---

## 11. Launch Checklist

- [x] Provider approval system fixed
- [x] Verification center complete (upload + admin review)
- [x] Review integrity enforced at DB level
- [x] Provider storefront implemented
- [x] Favorites system with count display
- [x] GPS discovery with Haversine distance
- [x] Booking workflow with all statuses
- [x] Notification architecture
- [x] Provider stats with auto-sync
- [x] Database audit complete
- [x] All UI bugs fixed
- [ ] **Run migration in Supabase**
- [ ] **Test end-to-end booking flow**
- [ ] **Seed test data**
