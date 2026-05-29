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

## 3. GPS Discovery Architecture (Ready for Implementation)

Database is prepared for location-based discovery:

```sql
-- Provider has lat/lng + service radius
SELECT * FROM providers
WHERE status = 'approved'
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL;
```

**Next implementation steps:**
1. Request location permissions on customer app
2. Use Haversine formula or PostGIS for distance calculation
3. Sort providers by distance: `ORDER BY distance ASC`
4. Filter by city/province with text search

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
- Database trigger prevents reviews on non-completed bookings
- Returns error: "Reviews can only be created for completed bookings"

---

## 5. Verification System Fix (Previously Completed)

The admin approval/rejection bug was fixed in prior commits:
- Added `Providers admin update` RLS policy
- Enhanced debugging in `PendingProvidersScreen` and `ProviderDetailScreen`
- Added document image loading fix with `getStorageUrl()` helper

---

## 6. Migration Execution Instructions

Run the following in Supabase SQL Editor:

```sql
\i supabase/migrations/20260529_architecture_renovation.sql
```

Or copy-paste the contents of `supabase/migrations/20260529_architecture_renovation.sql` into the SQL Editor and execute.

---

## 7. Files Modified

| File | Changes |
|------|---------|
| `supabase/schema.sql` | Full schema sync with new tables, fields, triggers, policies |
| `supabase/migrations/20260529_architecture_renovation.sql` | Master migration for all changes |
| `src/types/index.ts` | Updated TypeScript interfaces |
| `src/constants/app.ts` | Added new booking statuses |
| `src/navigation/types.ts` | Added ProviderStorefront route |
| `src/navigation/CustomerNavigator.tsx` | Registered storefront screen |
| `src/screens/provider/BookingRequestsScreen.tsx` | Added on_the_way + arrived workflow |
| `src/screens/customer/ProviderStorefrontScreen.tsx` | New storefront screen |
| `src/hooks/useFavorites.ts` | New favorites hook |

---

## 8. Next Steps for Development Team

1. **Run the migration** in Supabase SQL Editor
2. **Update customer home/search screens** to navigate to `ProviderStorefront` instead of `ProviderProfile`
3. **Implement GPS discovery query** using Haversine formula
4. **Add service image upload** in provider ManageServices screen
5. **Add gallery upload** in provider profile setup
6. **Test booking workflow** end-to-end with all new statuses
7. **Add favorite count display** on provider cards
