# ServiceHub — Sprint 3A Marketplace Audit Report
**Date:** 2026-05-30
**TypeScript Status:** PASS (zero errors)

---

## SECTION A — WORKING FEATURES

### Customer Discovery Flow
- **Home Screen** loads categories and top-rated providers, has pull-to-refresh
- **Search Screen** supports text search, category filter, and GPS-based nearby discovery with haversine distance
- **Category List** and **Provider List** screens exist for filtered browsing
- **Provider Storefront** displays cover photo, profile, badges, metrics, about, services list, gallery, and reviews
- **Service Detail** screen displays photo gallery (carousel with dot indicators), price, duration, description, provider card, and reviews

### Customer Booking Flow
- **Booking Screen** with date picker, time picker, location (required validation), notes, photo attachments (up to 4)
- Booking inserts into `bookings` table with correct customer_id, provider_id, service_id, price, status='pending'
- **Booking Detail** screen shows status banner with color coding, progress tracker, provider info, booking details, chat button
- Customer can cancel bookings in pending/accepted/on_the_way/arrived states
- Customer can leave a review after completion
- Realtime subscription on booking status updates refreshes the detail view automatically

### Provider Booking Management
- **Dashboard** shows stats (pending/active/completed/earnings), recent bookings, onboarding checklist
- **Booking Requests** screen with filter tabs (All/Pending/Active/Completed) and accept/reject actions
- Status action buttons for full lifecycle: pending → accepted → on_the_way → arrived → in_progress → completed
- Provider can chat with customer from ActiveJobs screen

### Notifications
- Database triggers create notifications for: booking_submitted, booking_accepted, booking_rejected, provider_on_the_way, provider_arrived, service_completed
- Chat notification trigger (chat_message) added in migration
- **Notification Center** screen for both customers and providers with all/unread filter, mark as read, mark all read
- **Customer Profile tab badge** shows unread notification count with realtime updates
- **Provider Requests tab badge** shows pending booking count with realtime updates
- **Provider Settings tab badge** shows unread notification count with realtime updates
- useNotifications hook subscribes to realtime INSERT events

### Chat
- **Chat Room** with realtime message subscription (INSERT/UPDATE), auto-scroll, read receipts (delivered/read)
- Messages marked as read via RPC function
- **Customer Chat List** (Messages tab) shows threads from accepted/in_progress/completed bookings with unread badges
- Provider can initiate chat from ActiveJobs screen

### Reviews
- **Review Screen** with 5-star rating, aspect tags, title, comment, photo upload (up to 3)
- Reviews stored with `is_visible` flag
- Review media stored in `review_media` table with Supabase Storage
- Provider rating and review count displayed on storefront
- Reviews visible to customers on ProviderStorefront and ServiceDetail

### Provider Onboarding
- Provider onboarding flow with document upload
- Admin approval workflow with verification notifications
- Provider profile setup, service management, availability schedule

---

## SECTION B — BROKEN FEATURES

### 1. Provider Booking Detail Screen is a Redirect Loop
**File:** `src/screens/provider/ProviderBookingDetailScreen.tsx:1`
**Issue:** The file simply does `export { default } from './BookingRequestsScreen';`
**Impact:** When a provider taps any booking card in the Requests list, it navigates to `BookingDetail` route which renders the SAME `BookingRequestsScreen` list, not a detail view. Provider cannot see booking details, notes, photos, or location.
**Severity:** HIGH

### 2. Notification Center Lacks Realtime Subscription
**File:** `src/screens/customer/NotificationCenterScreen.tsx`
**Issue:** The screen has its own `fetchNotifications` but does NOT use the `useNotifications` hook and has no realtime channel subscription.
**Impact:** New notifications received while the Notification Center is open will NOT appear until the user navigates away and back. The badge on the tab updates, but the list does not.
**Severity:** MEDIUM

### 3. Provider Chat Has No Dedicated List Screen
**Issue:** Provider can only access chat from the ActiveJobs screen. There is no provider equivalent of the customer's Messages tab.
**Impact:** If a provider wants to message a customer about a booking that moved to completed, they have no way to find that chat thread unless they navigate through the specific job.
**Severity:** MEDIUM

### 4. Customer Chat List Excludes Pending Bookings
**File:** `src/screens/customer/ChatListScreen.tsx:54`
**Issue:** Chat threads only load for bookings with status in `['accepted', 'in_progress', 'completed']`.
**Impact:** If a customer wants to message a provider before acceptance (to ask questions), the chat thread won't be accessible from the Messages tab.
**Severity:** LOW (by design, but may be confusing)

### 5. Orphaned ServiceOptions References in Customer ProviderProfile
**File:** `src/screens/customer/ProviderProfileScreen.tsx`
**Issue:** This older screen still fetches `service_options(*)` and renders expandable service options UI. It appears to be unused (Home navigates to `ProviderStorefront`), but the code still exists and will break if `service_options` data shape changes.
**Severity:** LOW

---

## SECTION C — HIGH PRIORITY BUGS

### BUG-1: Provider Cannot View Booking Details
- **Root Cause:** `ProviderBookingDetailScreen` is an alias for `BookingRequestsScreen`
- **Fix:** Create a proper `ProviderBookingDetailScreen` that shows full booking info, customer details, notes, photos, location, and action buttons
- **Files to modify:** `src/screens/provider/ProviderBookingDetailScreen.tsx`

### BUG-2: Photo Uploads in Booking Are Local URIs Only
- **File:** `src/screens/customer/BookingScreen.tsx:85`
- **Issue:** `photo_urls: photos` stores local device URIs (e.g., `file:///...`) in the database, not uploaded URLs. Provider will see broken images.
- **Fix:** Upload photos to Supabase Storage before inserting booking, or remove photo upload from booking flow.
- **Severity:** HIGH (broken images for provider)

### BUG-3: Booking Price Display Formatting Inconsistency
- **File:** `src/screens/customer/BookingScreen.tsx:127`
- **Issue:** Price is shown as raw number: `₱{price}` without toLocaleString formatting.
- **Fix:** Use `₱{price.toLocaleString('en-PH')}`
- **Severity:** LOW

### BUG-4: ServiceDetail Carousel Image Sizing
- **File:** `src/screens/customer/ServiceDetailScreen.tsx:223`
- **Issue:** `carouselImage` width is `SCREEN_WIDTH - SPACING.md * 2` but the ScrollView doesn't account for this properly in a horizontal paging context. The image may not page correctly if margins are inconsistent.
- **Severity:** LOW (visual/layout)

### BUG-5: Missing `disputed` Status in Provider Requests Filter
- **File:** `src/screens/provider/BookingRequestsScreen.tsx:29`
- **Issue:** Filters do not include 'disputed' status. Provider cannot see disputed bookings.
- **Severity:** MEDIUM

---

## SECTION D — MISSING MARKETPLACE FEATURES

### 1. Booking Conflict Prevention (Double Booking)
- **Status:** NOT IMPLEMENTED
- **Issue:** No validation prevents two customers from booking the same provider at the same date/time.
- **Risk:** Provider overbooking, customer dissatisfaction

### 2. Provider Availability Enforcement During Booking
- **Status:** NOT IMPLEMENTED
- **Issue:** Customer can select any date/time regardless of provider's availability schedule. The `availability` table stores weekly schedule but it's not checked during booking.
- **Risk:** Bookings outside provider working hours

### 3. Payment Processing
- **Status:** NOT IMPLEMENTED
- **Issue:** `payments` table exists but no payment gateway integration (no Stripe/PayMongo/Xendit). Bookings have `total_amount` but no actual payment flow.
- **Risk:** Revenue collection blocked at launch

### 4. Push Notifications
- **Status:** NOT IMPLEMENTED (deferred to Sprint 3 per requirements)
- **Issue:** Only in-app notifications exist. No Expo Push or FCM.
- **Risk:** Users won't know about new bookings when app is closed

### 5. Provider Earnings Screen
- **Status:** SKELETON ONLY
- **Issue:** `EarningsScreen` likely has no actual earnings calculation or payout logic.

### 6. Admin Dashboard
- **Status:** PARTIALLY IMPLEMENTED
- **Issue:** Navigation types exist but may not be fully wired or functional.

### 7. Service Category Templates / Service Groups
- **Status:** TABLE EXISTS, UI NOT IMPLEMENTED
- **Issue:** `service_groups` and `service_templates` tables may exist in schema but no UI for providers to use them.

### 8. Provider Can Cancel Bookings
- **Status:** NOT IMPLEMENTED
- **Issue:** Provider can reject (pending only) but cannot cancel an already-accepted booking.

### 9. Customer Cannot See Provider Location During Service
- **Status:** NOT IMPLEMENTED
- **Issue:** `provider_latitude` and `provider_longitude` exist on bookings but no live tracking UI.

### 10. Booking Reschedule
- **Status:** NOT IMPLEMENTED
- **Issue:** Neither customer nor provider can reschedule a booking after creation.

---

## SECTION E — LAUNCH BLOCKERS

These issues MUST be fixed before marketplace launch:

| # | Issue | Severity | Files |
|---|-------|----------|-------|
| 1 | **Provider cannot view booking details** — detail screen is a redirect loop | CRITICAL | `ProviderBookingDetailScreen.tsx` |
| 2 | **Booking photo uploads are broken** — local URIs stored instead of uploaded URLs | CRITICAL | `BookingScreen.tsx` |
| 3 | **No booking conflict detection** — double-bookings possible | HIGH | Schema + `BookingScreen.tsx` |
| 4 | **No payment integration** — cannot collect revenue | HIGH | Needs new feature |
| 5 | **Push notifications missing** — users won't be alerted when app closed | HIGH | Needs new feature |
| 6 | **Notification Center lacks realtime** — list doesn't auto-update | MEDIUM | `NotificationCenterScreen.tsx` |
| 7 | **Provider has no chat list** — cannot find old conversations | MEDIUM | New screen needed |
| 8 | **Orphaned ProviderProfileScreen** — still fetches deprecated service_options | LOW | `ProviderProfileScreen.tsx` |

---

## SECTION F — RECOMMENDED NEXT SPRINT

### Sprint 3B: Marketplace Stabilization & Launch Prep

**Priority 1 — Fix Launch Blockers (Week 1)**
1. Build proper `ProviderBookingDetailScreen` with full booking info, customer card, notes/photos, location map, and status action buttons
2. Fix booking photo upload — upload to Supabase Storage before creating booking, or remove photo feature from booking flow
3. Add `NotificationCenterScreen` realtime subscription (use `useNotifications` hook or add channel directly)
4. Add provider chat list screen or allow chat access from Requests screen

**Priority 2 — Booking Reliability (Week 1-2)**
5. Add booking conflict check: query existing bookings for same provider at same date/time before insert
6. Add availability validation: check `availability` table against selected date/time before booking insert
7. Add provider cancel booking action (with reason)

**Priority 3 — Revenue (Week 2-3)**
8. Integrate payment gateway (PayMongo/Xendit for Philippines) or Stripe
9. Update booking flow to require payment before status becomes 'accepted'
10. Add provider earnings calculation and payout status

**Priority 4 — Notifications (Week 3)**
11. Implement Expo Push Notifications for new bookings, status changes, and chat messages
12. Add notification deep-linking (tap notification → open relevant screen)

**Priority 5 — Polish (Week 3-4)**
13. Remove/deprecate `ProviderProfileScreen` (old screen) or redirect to `ProviderStorefront`
14. Clean up dead `serviceOptionId` param from `BookService` route
15. Add booking reschedule feature (customer requests, provider approves)
16. Add `disputed` status filter to provider requests

---

## AUDIT SUMMARY

| Category | Status |
|----------|--------|
| Customer Discovery | WORKING |
| Customer Booking Flow | WORKING (with photo bug) |
| Provider Booking Management | PARTIALLY WORKING (detail screen broken) |
| Notifications | WORKING (with realtime gap in center) |
| Chat | WORKING (with provider list missing) |
| Reviews | FULLY IMPLEMENTED |
| Availability | PARTIALLY IMPLEMENTED |
| Payments | NOT IMPLEMENTED |
| Push Notifications | NOT IMPLEMENTED |
| Data Consistency | MOSTLY CLEAN (orphaned references present) |

**Bottom Line:** The core customer-to-provider booking flow is functional end-to-end. The most critical issue is the provider booking detail screen being broken, followed by booking photos not uploading. Payments and push notifications are the biggest missing pieces for a true marketplace launch.
