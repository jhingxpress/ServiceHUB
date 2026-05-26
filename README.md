# ServiceHub

A production-ready **local services marketplace** mobile app built with Expo React Native, Supabase, and React Navigation. Connects customers who need local services with verified providers, managed by an admin panel.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK (React Native + TypeScript) |
| Backend / Auth | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Navigation | React Navigation 6 (Stack + Bottom Tabs) |
| State Management | Zustand |
| Date Utilities | date-fns |
| Image Picker | expo-image-picker |
| Date/Time Picker | @react-native-community/datetimepicker |

---

## Features

### Customer
- Sign up / login with email & password
- Browse service categories
- Search and filter providers
- View provider profiles with ratings, services, and reviews
- Book a service (date, time, location, notes, photo upload)
- Real-time booking status tracking with progress stepper
- In-app chat with provider (Supabase Realtime)
- Booking history with status filters
- Leave star ratings and text reviews
- Profile management with avatar upload

### Provider
- Provider registration and profile setup
- Add / manage offered services with pricing
- Accept or reject incoming booking requests
- Mark jobs as in-progress or completed
- Earnings dashboard with transaction history
- Weekly availability schedule configuration
- Availability toggle (go online / offline)

### Admin
- Platform analytics dashboard (users, bookings, revenue, ratings)
- KYC: approve or reject pending provider applications
- User management with role filtering and active/inactive toggle
- Booking-by-status breakdown and top-category charts

---

## Project Structure

```
ServiceHub/
├── App.tsx                         # Entry component, NavigationContainer
├── index.ts                        # Expo entry point
├── app.json                        # Expo app configuration
├── babel.config.js
├── tsconfig.json
├── .env.example                    # Environment variable template
├── supabase/
│   └── schema.sql                  # Full database schema
└── src/
    ├── lib/
    │   └── supabase.ts             # Supabase client
    ├── types/
    │   └── index.ts                # TypeScript interfaces
    ├── constants/
    │   └── theme.ts                # Colors, fonts, spacing, shadows
    ├── stores/
    │   └── authStore.ts            # Zustand auth store
    ├── navigation/
    │   ├── types.ts                # Nav param list types
    │   ├── RootNavigator.tsx       # Role-based root router
    │   ├── AuthNavigator.tsx
    │   ├── CustomerNavigator.tsx
    │   ├── ProviderNavigator.tsx
    │   └── AdminNavigator.tsx
    ├── components/
    │   └── ui/
    │       ├── Button.tsx
    │       ├── Input.tsx
    │       ├── Card.tsx
    │       ├── Avatar.tsx
    │       ├── StarRating.tsx
    │       ├── Badge.tsx
    │       ├── LoadingScreen.tsx
    │       └── EmptyState.tsx
    └── screens/
        ├── auth/
        │   ├── SplashScreen.tsx
        │   ├── LoginScreen.tsx
        │   └── RegisterScreen.tsx
        ├── customer/
        │   ├── HomeScreen.tsx
        │   ├── SearchScreen.tsx
        │   ├── ProviderProfileScreen.tsx
        │   ├── BookingScreen.tsx
        │   ├── BookingDetailScreen.tsx
        │   ├── BookingHistoryScreen.tsx
        │   ├── ChatListScreen.tsx
        │   ├── ChatRoomScreen.tsx
        │   ├── ProfileScreen.tsx
        │   └── ReviewScreen.tsx
        ├── provider/
        │   ├── DashboardScreen.tsx
        │   ├── BookingRequestsScreen.tsx
        │   ├── EarningsScreen.tsx
        │   ├── ScheduleScreen.tsx
        │   ├── ProfileSetupScreen.tsx
        │   └── ManageServicesScreen.tsx
        └── admin/
            ├── AdminDashboardScreen.tsx
            ├── PendingProvidersScreen.tsx
            ├── ManageUsersScreen.tsx
            └── AnalyticsScreen.tsx
```

---

## Getting Started

### 1. Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- A [Supabase](https://supabase.com) account

### 2. Clone & Install

```bash
git clone <repo-url>
cd ServiceHub
npm install
```

### 3. Environment Variables

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
cp .env.example .env
```

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

> **Note:** Variables prefixed with `EXPO_PUBLIC_` are automatically exposed to the app bundle. Never commit your `.env` file.

### 4. Set Up the Database

1. Open your Supabase project → **SQL Editor**
2. Copy and run the contents of `supabase/schema.sql`
3. This creates all tables, Row Level Security policies, triggers, and seeds the default categories

### 5. Set Up Supabase Storage

Create two storage buckets in your Supabase dashboard:
- `avatars` — public read, authenticated write
- `booking-photos` — authenticated read/write

### 6. Run the App

```bash
npx expo start
```

Scan the QR code with **Expo Go** (iOS/Android) or press:
- `i` — iOS Simulator
- `a` — Android Emulator
- `w` — Web browser

---

## Database Schema Overview

| Table | Description |
|---|---|
| `users` | Extended user profile (role, phone, avatar) |
| `providers` | Provider profile (bio, category, rates, verification) |
| `categories` | Service categories with icons |
| `services` | Individual services offered by providers |
| `bookings` | Booking records linking customers and providers |
| `reviews` | Customer reviews for completed bookings |
| `payments` | Payment records per booking |
| `messages` | Chat messages between customer and provider |
| `availability` | Provider weekly availability schedule |

### Row Level Security

All tables are protected by RLS policies:
- Users can only read/write their own data
- Providers can read bookings assigned to them
- Admins have full access via role check

---

## Role-Based Access

Users register as either `customer` or `provider`. Admins are assigned manually in the database:

```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
```

The `RootNavigator` automatically routes to the correct navigator based on the authenticated user's role.

---

## Realtime Features

Two channels use Supabase Realtime:
- **Chat messages** — `messages` table INSERT subscribed per `booking_id`
- **Booking status** — `bookings` table UPDATE subscribed per `booking_id`

Both are set up in the respective screen components and cleaned up on unmount.

---

## Building for Production

```bash
# EAS Build (recommended)
npm install -g eas-cli
eas build --platform ios
eas build --platform android

# Or classic Expo build
expo build:android
expo build:ios
```

---

## License

MIT
