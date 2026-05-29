export type UserRole = 'customer' | 'provider' | 'admin';
export type ProviderStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'suspended';
export type DocumentStatus = 'pending' | 'approved' | 'rejected';
export type DocumentCategoryType = 'valid_id' | 'permit_certificate';
export type DocumentSide = 'front' | 'back';
export type DocumentType =
  | 'valid_id'
  | 'government_id'
  | 'barangay_clearance'
  | 'business_permit'
  | 'dti_registration'
  | 'bir_registration'
  | 'tesda_certificate'
  | 'professional_cert'
  | 'other_supporting';
export type ProviderType = 'individual' | 'business';

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
export type DisputeStatus = 'open' | 'investigating' | 'resolved' | 'closed';
export type MediaType = 'photo' | 'video';

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: 'active' | 'suspended' | 'banned';
  city: string | null;
  province: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
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
  // Storefront
  provider_type: ProviderType;
  cover_photo: string | null;
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
  // Stats
  rating: number;
  total_reviews: number;
  completed_jobs: number;
  total_earnings: number;
  created_at: string;
  updated_at: string;
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
  base_price: number;
  duration_minutes: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
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
  notes: string | null;
  photo_urls: string[] | null;
  total_amount: number | null;
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
  content: string;
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
  type: 'booking_submitted' | 'booking_accepted' | 'booking_rejected' | 'provider_on_the_way' | 'provider_arrived' | 'service_completed' | 'review_reminder' | 'document_approved' | 'document_rejected' | 'verification_approved' | 'verification_rejected';
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
  updated_at: string;
}

export interface ChatRoom {
  booking_id: string;
  other_user: User;
  last_message: Message | null;
  unread_count: number;
  booking: Booking;
}
