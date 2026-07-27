export type UserRole = 'customer' | 'provider' | 'admin' | 'moderator' | 'support_agent' | 'operations_staff';
export type StaffRole = 'moderator' | 'support_agent' | 'operations_staff';
export type ProviderStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'suspended';
export type DocumentStatus = 'pending' | 'approved' | 'rejected';
export type DocumentCategoryType = 'valid_id' | 'permit_certificate';
export type DocumentSide = 'front' | 'back';
export type DocumentType =
  | 'valid_id'
  | 'government_id'
  | 'verification_selfie'
  | 'barangay_clearance'
  | 'police_clearance'
  | 'nbi_clearance'
  | 'business_permit'
  | 'dti_registration'
  | 'bir_registration'
  | 'sec_registration'
  | 'tesda_certificate'
  | 'nc_certificate'
  | 'prc_license'
  | 'employment_certificate'
  | 'professional_cert'
  | 'other_supporting';
export type ProviderType = 'individual' | 'business';
export type MarketplaceStatus = 'live' | 'hidden';
export type BusinessStatus = 'available' | 'busy' | 'vacation_mode' | 'closed';

export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'on_the_way'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'disputed';
export type PaymentStatus = 'pending' | 'completed' | 'refunded' | 'failed';
export type PlatformFeeStatus = 'unpaid' | 'paid' | 'waived' | 'disputed';
export type BalanceStatus = 'clear' | 'warning' | 'overdue' | 'review';
export type DisputeStatus = 'open' | 'investigating' | 'resolved' | 'closed';
export type MediaType = 'photo' | 'video';
export type ReportType =
  | 'fake_provider'
  | 'fake_customer'
  | 'spam'
  | 'harassment'
  | 'fraud'
  | 'no_show'
  | 'inappropriate_content'
  | 'other';
export type ReportStatus = 'pending' | 'investigating' | 'resolved' | 'dismissed';
export type BookingIncidentReason =
  | 'customer_not_present'
  | 'wrong_address'
  | 'customer_refused_service'
  | 'unsafe_location'
  | 'other';
export type BookingIncidentStatus = 'open' | 'reviewed' | 'dismissed';

export interface BookingIncidentReport {
  id: string;
  booking_id: string;
  provider_id: string;
  reason: BookingIncidentReason;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  photo_url: string | null;
  status: BookingIncidentStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type EmploymentStatus = 'active' | 'suspended' | 'inactive' | 'resigned';
export type EscalationStatus = 'open' | 'in_progress' | 'resolved' | 'dismissed';

export interface StaffActionLog {
  id: string;
  staff_id: string;
  staff?: { full_name: string | null; email: string | null; role: UserRole } | null;
  action: string;
  target_table: string | null;
  target_record_id: string | null;
  target_user_id: string | null;
  target_user?: { full_name: string | null; email: string | null } | null;
  notes: string | null;
  created_at: string;
}

export interface Escalation {
  id: string;
  created_by: string;
  created_by_user?: { full_name: string | null; email: string | null; role: UserRole } | null;
  assigned_to: string | null;
  assigned_to_user?: { full_name: string | null; email: string | null; role: UserRole } | null;
  target_table: string | null;
  target_record_id: string | null;
  target_user_id: string | null;
  target_user?: { full_name: string | null; email: string | null } | null;
  status: EscalationStatus;
  reason: string;
  notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: 'active' | 'suspended' | 'banned';
  is_active: boolean;
  employment_status: EmploymentStatus;
  internal_notes: string | null;
  must_change_password: boolean;
  email_verified: boolean;
  city: string | null;
  province: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
  date_of_birth: string | null;
  deleted_at: string | null;
  // Consent
  accepted_terms_at: string | null;
  accepted_privacy_at: string | null;
  accepted_terms_version: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  parent_id: string | null;
  is_parent: boolean;
  created_at: string;
}

export interface ProviderCategory {
  id: string;
  provider_id: string;
  category_id: string;
  is_primary: boolean;
  created_at: string;
  categories?: Category;
}

/** Service group under a category (e.g. Motorcycle Services under Automotive) */
export interface ServiceGroup {
  id: string;
  category_id: string;
  leaf_category_id: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  created_at: string;
}

/** Service template within a group (e.g. Motorcycle Repair under Motorcycle Services) */
export interface ServiceTemplate {
  id: string;
  service_group_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Provider {
  id: string;
  // Business info
  business_name: string | null;
  owner_name: string | null;
  business_address: string | null;
  city: string | null;
  province: string | null;
  business_email: string | null;
  business_phone: string | null;
  service_description: string | null;
  service_area: string | null;
  years_of_experience: number | null;
  bio: string | null;
  category_id: string | null;
  hourly_rate: number | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  // Business Profile
  profile_photo_url: string | null;
  cover_photo_url: string | null;
  business_headline: string | null;
  business_description: string | null;
  certifications: string | null;
  profile_completed: boolean;
  // Storefront
  provider_type: ProviderType;
  business_logo: string | null;
  member_since: string;
  response_rate: number;
  service_radius_km: number;
  // Onboarding & verification
  status: ProviderStatus;
  is_verified: boolean;
  is_available: boolean;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  // Consent
  accepted_verification_policy_at: string | null;
  accepted_terms_at: string | null;
  accepted_privacy_at: string | null;
  // Marketplace
  marketplace_status: MarketplaceStatus;
  business_status: BusinessStatus;
  // Featured
  is_featured: boolean;
  featured_until: string | null;
  // Stats
  rating: number;
  total_reviews: number;
  completed_jobs: number;
  total_earnings: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Relations
  users?: User;
  categories?: Category;
  services?: Service[];
  provider_badges?: ProviderBadge[];
  provider_gallery?: ProviderGallery[];
}

export interface ProviderDocument {
  id: string;
  provider_id: string;
  document_type: DocumentType;
  category_type: DocumentCategoryType;
  id_type: string | null;
  side: DocumentSide | null;
  file_url: string;
  status: DocumentStatus;
  uploaded_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  // Phase 2C verification fields (nullable, additive)
  verification_mode?: 'legacy_manual' | 'live_liveness' | 'manual_review' | null;
  liveness_status?: 'passed' | 'manual_review' | 'failed' | 'skipped' | null;
  blink_detected?: boolean | null;
  left_turn_detected?: boolean | null;
  right_turn_detected?: boolean | null;
  capture_quality_score?: number | null;
  best_selfie_storage_path?: string | null;
  liveness_captured_at?: string | null;
  manual_review_required?: boolean | null;
  liveness_details?: Record<string, unknown> | null;
  attempt_count?: number | null;
  device_platform?: string | null;
}

export interface ProviderVerificationLog {
  id: string;
  provider_id: string;
  action: string;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
  performer?: User;
}

/** Sub-service under a provider's single category */
export interface Service {
  id: string;
  provider_id: string;
  name: string;
  description: string | null;
  price: number;
  home_visit_fee: number;
  duration_minutes: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  service_options?: ServiceOption[];
  service_images?: ServiceImage[];
}

export interface ServiceImage {
  id: string;
  service_id: string;
  image_url: string;
  sort_order: number;
  created_at: string;
}

export interface ProviderGallery {
  id: string;
  provider_id: string;
  image_url: string;
  caption: string | null;
  is_before_after: boolean;
  sort_order: number;
  created_at: string;
}

export interface ProviderBadge {
  id: string;
  provider_id: string;
  badge_type: 'verified_provider' | 'fast_responder' | 'top_rated' | '100_plus_jobs' | '50_plus_jobs' | 'new_provider';
  awarded_at: string;
}

export interface FavoriteProvider {
  id: string;
  customer_id: string;
  provider_id: string;
  created_at: string;
  provider?: Provider;
}

/** Price variant under a sub-service */
export interface ServiceOption {
  id: string;
  service_id: string;
  name: string;
  description: string | null;
  price: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  customer_id: string;
  provider_id: string;
  service_id: string | null;
  service_option_id: string | null;
  service_option_name: string | null;
  status: BookingStatus;
  scheduled_date: string;
  scheduled_time: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  booking_city: string | null;
  booking_province: string | null;
  notes: string | null;
  photo_urls: string[] | null;
  total_amount: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_avatar_url: string | null;
  created_at: string;
  updated_at: string;
  customer?: User;
  provider?: Provider & { users: User };
  service?: Service;
  service_option?: ServiceOption;
}

export interface Review {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  is_visible: boolean;
  created_at: string;
  customer_name: string | null;
  customer_avatar_url: string | null;
  photo_urls: string[] | null;
  customer?: User;
  review_media?: ReviewMedia[];
}

export interface ReviewMedia {
  id: string;
  review_id: string;
  media_type: MediaType;
  file_url: string;
  created_at: string;
}

export interface Message {
  id: string;
  booking_id: string;
  sender_id: string;
  receiver_id: string;
  content: string | null;
  image_url: string | null;
  message_type: 'text' | 'image';
  is_read: boolean;
  created_at: string;
  sender?: User;
}

export interface Payment {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  amount: number;
  status: PaymentStatus;
  payment_method: string | null;
  transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Availability {
  id: string;
  provider_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

export interface Dispute {
  id: string;
  booking_id: string;
  raised_by: string;
  reason: string;
  status: DisputeStatus;
  resolution: string | null;
  created_at: string;
  updated_at: string;
  booking?: Booking;
  raiser?: User;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'booking_submitted' | 'booking_accepted' | 'booking_rejected' | 'booking_cancelled' | 'booking_on_the_way' | 'booking_arrived' | 'booking_in_progress' | 'booking_completed' | 'booking_reminder' | 'provider_on_the_way' | 'provider_arrived' | 'service_completed' | 'chat_message' | 'new_message' | 'review_received' | 'review_reminder' | 'verification_approved' | 'verification_rejected' | 'document_approved' | 'document_rejected' | 'featured_approved' | 'dispute_opened' | 'dispute_updated' | 'dispute_resolved' | 'announcement' | 'maintenance' | 'policy_update' | 'marketing' | 'system' | 'platform_fee_added' | 'platform_fee_reminder' | 'platform_fee_overdue' | 'platform_fee_paid';
  title: string;
  body: string;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export interface ProviderStats {
  provider_id: string;
  completed_jobs: number;
  total_reviews: number;
  average_rating: number;
  response_rate: number;
  favorite_count: number;
  average_response_minutes: number;
  updated_at: string;
}

export interface ProviderChecklist {
  provider_id: string;
  is_approved: boolean;
  has_first_service: boolean;
  has_pricing: boolean;
  has_photos: boolean;
  has_schedule: boolean;
  has_business_profile: boolean;
  progress_percent: number;
  updated_at: string;
}

export interface ProviderPortfolio {
  id: string;
  provider_id: string;
  image_url: string;
  caption: string | null;
  photo_type: 'before' | 'after' | 'completed' | 'certificate' | 'equipment';
  sort_order: number;
  created_at: string;
}

export interface ProviderView {
  id: string;
  provider_id: string;
  viewer_id: string | null;
  viewed_at: string;
}

export interface ProviderPerformance {
  provider_id: string;
  profile_views: number;
  total_bookings: number;
  conversion_rate: number;
  response_rate: number;
  completion_rate: number;
  updated_at: string;
}

export interface ProviderScore {
  provider_id: string;
  score: number;
  color_tier: 'green' | 'yellow' | 'red';
  updated_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  booking_id: string | null;
  report_type: ReportType;
  description: string;
  evidence_url: string | null;
  status: ReportStatus;
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  reporter?: User;
  reported_user?: User;
  resolver?: User;
  booking?: Booking;
}

export interface ChatRoom {
  booking_id: string;
  other_user: User;
  last_message: Message | null;
  unread_count: number;
  booking: Booking;
}

export interface PlatformFee {
  id: string;
  provider_id: string;
  booking_id: string;
  booking_amount: number;
  platform_fee: number;
  status: PlatformFeeStatus;
  due_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderFeeBalance {
  total_unpaid: number;
  oldest_due_date: string | null;
  days_since_oldest: number;
  balance_status: BalanceStatus;
}

export interface AdminProviderFeeRow {
  provider_id: string;
  business_name: string | null;
  full_name: string | null;
  total_unpaid: number;
  oldest_due_date: string | null;
  fee_count: number;
  balance_status: BalanceStatus;
}
