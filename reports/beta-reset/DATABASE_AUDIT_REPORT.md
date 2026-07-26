# TAGA Database Audit Report

**Generated:** 2026-07-25
**Project:** TAGA (formerly ServiceHub)
**Backend:** Supabase (PostgreSQL + Auth + Storage)

---

## 1. Complete Table Inventory

### User Data Tables (deleted during reset)

| Table | FK References | ON DELETE | Purpose |
|-------|---------------|-----------|---------|
| `users` | `auth.users(id)` | CASCADE | User profiles (name, role, avatar, etc.) |
| `providers` | `public.users(id)` | CASCADE | Provider business profiles |
| `services` | `public.providers(id)` | CASCADE | Services offered by providers |
| `service_options` | `public.services(id)` | CASCADE | Service pricing options |
| `service_images` | `public.services(id)` | CASCADE | Images for services |
| `bookings` | `public.services(id)`, `public.providers(id)`, `public.users(id)` | CASCADE | Booking records |
| `booking_incident_reports` | `public.bookings(id)`, `public.providers(id)`, `public.users(id)` | CASCADE / NO ACTION | Incident reports on bookings |
| `provider_live_locations` | `public.bookings(id)`, `auth.users(id)` | CASCADE | GPS tracking for active bookings |
| `reviews` | `public.bookings(id)`, `public.providers(id)`, `public.users(id)` | CASCADE | Customer reviews of providers |
| `review_media` | `public.reviews(id)` | CASCADE | Photos attached to reviews |
| `messages` | `public.bookings(id)`, `public.users(id)` (sender), `public.users(id)` (receiver) | CASCADE | Chat messages between booking participants |
| `payments` | `public.bookings(id)`, `public.providers(id)`, `public.users(id)` | CASCADE | Payment records |
| `disputes` | `public.bookings(id)`, `public.users(id)` | CASCADE / SET NULL | Booking disputes |
| `reports` | `public.users(id)` (reporter), `public.users(id)` (reported) | SET NULL | User-submitted reports |
| `notifications` | `public.users(id)` | CASCADE | In-app notifications |
| `favorite_providers` | `public.users(id)` (customer), `public.providers(id)` | CASCADE | Saved/favorited providers |
| `user_push_tokens` | `auth.users(id)` | CASCADE | Expo push notification tokens |
| `saved_locations` | `auth.users(id)` | CASCADE | Customer saved addresses |
| `servicehub_tips` | `auth.users(id)` | SET NULL | Tip records (user_id nullable on delete) |
| `provider_documents` | `public.providers(id)` | CASCADE | Verification documents |
| `provider_gallery` | `public.providers(id)` | CASCADE | Gallery images |
| `provider_portfolio` | `public.providers(id)` | CASCADE | Portfolio images |
| `provider_badges` | `public.providers(id)` | CASCADE | Achievement badges |
| `provider_stats` | `public.providers(id)` | CASCADE | Aggregate provider statistics |
| `provider_verification_logs` | `public.providers(id)` | CASCADE | Verification audit trail |
| `provider_views` | `public.providers(id)`, `public.users(id)` | CASCADE / SET NULL | Profile view tracking |
| `provider_performance` | `public.providers(id)` | CASCADE | Performance metrics |
| `provider_score` | `public.providers(id)` | CASCADE | Provider scoring/tiering |
| `provider_analytics` | `public.providers(id)` | CASCADE | Isolated analytics metrics |
| `provider_checklist` | `public.providers(id)` | CASCADE | Onboarding checklist |
| `availability` | `public.providers(id)` | CASCADE | Provider availability schedule |
| `provider_categories` | `public.providers(id)`, `public.categories(id)` | CASCADE | Provider-to-category junction |
| `featured_requests` | `public.providers(id)` | CASCADE | Featured provider requests |
| `featured_payments` | `public.providers(id)`, `public.featured_requests(id)` | CASCADE / SET NULL | Featured promotion payments |
| `provider_platform_fees` | `public.providers(id)`, `public.bookings(id)` | CASCADE / **RESTRICT** | Platform fee records per booking |
| `platform_fee_payments` | `public.providers(id)` | CASCADE | Fee payment checkout sessions |
| `staff_action_log` | `public.users(id)` (staff_id), `public.users(id)` (target_user_id) | CASCADE / SET NULL | Staff audit log |
| `escalations` | `public.users(id)` (created_by), `public.users(id)` (assigned_to) | SET NULL | Support escalations |

### Configuration / Seed Tables (preserved)

| Table | Purpose |
|-------|---------|
| `categories` | Hierarchical service categories (seed data) |
| `service_groups` | Service groups under categories (seed data) |
| `service_templates` | Individual service templates (seed data) |
| `platform_fee_schedule` | Fee tier configuration (seed data) |
| `platform_config` | Platform configuration key-value pairs |

---

## 2. Foreign Key Dependency Graph

```
auth.users
  └── public.users (CASCADE)
        ├── providers (CASCADE)
        │     ├── services (CASCADE)
        │     │     ├── service_options (CASCADE)
        │     │     └── service_images (CASCADE)
        │     ├── provider_documents (CASCADE)
        │     ├── provider_gallery (CASCADE)
        │     ├── provider_portfolio (CASCADE)
        │     ├── provider_badges (CASCADE)
        │     ├── provider_stats (CASCADE)
        │     ├── provider_verification_logs (CASCADE)
        │     ├── provider_views (CASCADE for provider_id, SET NULL for viewer_id)
        │     ├── provider_performance (CASCADE)
        │     ├── provider_score (CASCADE)
        │     ├── provider_analytics (CASCADE)
        │     ├── provider_checklist (CASCADE)
        │     ├── availability (CASCADE)
        │     ├── provider_categories (CASCADE)
        │     ├── featured_requests (CASCADE)
        │     │     └── featured_payments (CASCADE for provider, SET NULL for request)
        │     ├── provider_platform_fees (CASCADE for provider, RESTRICT for booking)
        │     │     └── platform_fee_payments (CASCADE for provider)
        │     └── booking_incident_reports (CASCADE for provider, NO ACTION for reviewed_by)
        ├── bookings (CASCADE for customer, CASCADE for provider)
        │     ├── booking_incident_reports (CASCADE)
        │     ├── provider_live_locations (CASCADE)
        │     ├── reviews (CASCADE)
        │     │     └── review_media (CASCADE)
        │     ├── messages (CASCADE)
        │     ├── payments (CASCADE)
        │     ├── disputes (CASCADE for booking, SET NULL for raised_by)
        │     └── provider_platform_fees (RESTRICT — must delete before bookings)
        ├── notifications (CASCADE)
        ├── favorite_providers (CASCADE for customer, CASCADE for provider)
        ├── user_push_tokens (CASCADE)
        ├── saved_locations (CASCADE)
        ├── servicehub_tips (SET NULL for user_id)
        ├── staff_action_log (CASCADE for staff_id, SET NULL for target)
        ├── escalations (SET NULL for created_by, SET NULL for assigned_to)
        ├── reports (SET NULL for reporter_id, SET NULL for reported_user_id)
        └── messages (CASCADE for sender_id, CASCADE for receiver_id)

categories (PRESERVED)
  ├── service_groups (CASCADE)
  │     └── service_templates (CASCADE)
  └── provider_categories (CASCADE — but deleted via provider)

platform_fee_schedule (PRESERVED — no FK to users)
platform_config (PRESERVED — no FK to users)
```

---

## 3. Tables Referencing Users

| Table | Column | References | ON DELETE |
|-------|--------|------------|-----------|
| `providers` | `id` | `public.users(id)` | CASCADE |
| `bookings` | `customer_id` | `public.users(id)` | CASCADE |
| `bookings` | `provider_id` | `public.providers(id)` | CASCADE |
| `reviews` | `customer_id` | `public.users(id)` | CASCADE |
| `reviews` | `provider_id` | `public.providers(id)` | CASCADE |
| `messages` | `sender_id` | `public.users(id)` | CASCADE |
| `messages` | `receiver_id` | `public.users(id)` | CASCADE |
| `payments` | `customer_id` | `public.users(id)` | CASCADE |
| `payments` | `provider_id` | `public.providers(id)` | CASCADE |
| `notifications` | `user_id` | `public.users(id)` | CASCADE |
| `favorite_providers` | `customer_id` | `public.users(id)` | CASCADE |
| `favorite_providers` | `provider_id` | `public.providers(id)` | CASCADE |
| `disputes` | `raised_by` | `public.users(id)` | SET NULL |
| `reports` | `reporter_id` | `public.users(id)` | SET NULL |
| `reports` | `reported_user_id` | `public.users(id)` | SET NULL |
| `provider_views` | `viewer_id` | `public.users(id)` | SET NULL |
| `booking_incident_reports` | `reviewed_by` | `public.users(id)` | NO ACTION |
| `staff_action_log` | `staff_id` | `public.users(id)` | CASCADE |
| `staff_action_log` | `target_user_id` | `public.users(id)` | SET NULL |
| `escalations` | `created_by` | `public.users(id)` | SET NULL |
| `escalations` | `assigned_to` | `public.users(id)` | SET NULL |
| `user_push_tokens` | `user_id` | `auth.users(id)` | CASCADE |
| `saved_locations` | `customer_id` | `auth.users(id)` | CASCADE |
| `servicehub_tips` | `user_id` | `auth.users(id)` | SET NULL |
| `provider_live_locations` | `provider_id` | `auth.users(id)` | CASCADE |

---

## 4. Tables Referencing Bookings

| Table | Column | ON DELETE |
|-------|--------|-----------|
| `booking_incident_reports` | `booking_id` | CASCADE |
| `provider_live_locations` | `booking_id` | CASCADE |
| `reviews` | `booking_id` | CASCADE |
| `messages` | `booking_id` | CASCADE |
| `payments` | `booking_id` | CASCADE |
| `disputes` | `booking_id` | CASCADE |
| `provider_platform_fees` | `booking_id` | **RESTRICT** |

> **Critical**: `provider_platform_fees.booking_id` has `ON DELETE RESTRICT`. This means bookings cannot be deleted while platform fee records reference them. The cleanup function deletes platform fees **before** bookings.

---

## 5. Tables with Uploaded Image/File Paths

| Table | Column(s) | Storage Bucket |
|-------|-----------|----------------|
| `users` | `avatar_url` | `avatars` |
| `providers` | `profile_photo_url`, `cover_photo_url`, `business_logo` | `provider-profile-images`, `provider-cover-images` |
| `provider_documents` | `document_url` | `provider-documents` |
| `provider_gallery` | `image_url` | (various) |
| `provider_portfolio` | `image_url` | (various) |
| `service_images` | `image_url` | (various) |
| `review_media` | `media_url` | (various) |
| `messages` | `image_url` | `chat-media` |
| `booking_incident_reports` | `photo_url` | `booking-photos` |

---

## 6. Storage Buckets

| Bucket | Public | Path Pattern | Purpose |
|--------|--------|-------------|---------|
| `avatars` | yes | `{user_id}/{filename}` | User profile photos |
| `provider-documents` | no | `{user_id}/{filename}` | Provider verification documents |
| `provider-profile-images` | yes | `{user_id}/{filename}` | Provider profile photos |
| `provider-cover-images` | yes | `{user_id}/{filename}` | Provider cover/banner images |
| `booking-photos` | no | `{booking_id}/{filename}` | Photos attached to bookings |
| `chat-media` | no | `{booking_id}/{filename}` | Chat message image attachments |

---

## 7. Safest Deletion Order

Based on the dependency graph, the deletion must follow this order:

1. **Phase 1 — RESTRICT constraints**: `platform_fee_payments` → `provider_platform_fees`
2. **Phase 2 — NO ACTION references**: `booking_incident_reports.reviewed_by` → SET NULL
3. **Phase 3 — Booking-related (bottom-up)**: `booking_incident_reports` → `provider_live_locations` → `review_media` → `reviews` → `messages` → `payments` → `disputes` → `reports` → `bookings`
4. **Phase 4 — Provider-related (bottom-up)**: `service_images` → `service_options` → `services` → `provider_views` → `provider_performance` → `provider_score` → `provider_analytics` → `provider_checklist` → `provider_portfolio` → `provider_gallery` → `provider_documents` → `provider_badges` → `provider_stats` → `provider_verification_logs` → `availability` → `featured_payments` → `featured_requests` → `provider_categories`
5. **Phase 5 — User-related**: `notifications` → `favorite_providers` → `saved_locations` → `user_push_tokens` → `servicehub_tips` → `staff_action_log` → `escalations`
6. **Phase 6 — Core records**: `providers` → `public.users`
7. **Phase 7 — Auth users**: `auth.users` (via Auth Admin API, outside SQL transaction)

---

## 8. Admin Account

- **Email**: `jhingxpress@gmail.com`
- **Role**: `admin` (set via migrations `20260526130840` and `20260605060000`)
- **UUID**: Resolved at runtime from `public.users` table
- **Preservation**: All records where `id = admin_uuid` are preserved across all tables

---

## 9. Special Cases

- **`servicehub_tips.user_id`**: `ON DELETE SET NULL` — tips remain but `user_id` becomes NULL when user is deleted. The cleanup function explicitly deletes non-admin tips.
- **`booking_incident_reports.reviewed_by`**: No `ON DELETE` clause (defaults to `NO ACTION`). The cleanup function sets this to NULL before deleting users.
- **`provider_platform_fees.booking_id`**: `ON DELETE RESTRICT`. Must delete fee records before deleting bookings.
- **`disputes.raised_by`**: `ON DELETE SET NULL` — disputes remain but `raised_by` becomes NULL. The cleanup function deletes non-admin disputes.
- **`reports.reporter_id` / `reported_user_id`**: `ON DELETE SET NULL`. The cleanup function deletes non-admin reports.
- **`provider_views.viewer_id`**: `ON DELETE SET NULL` — view records remain but `viewer_id` becomes NULL. The cleanup function deletes non-admin provider views.
