export type UserRole = 'customer' | 'provider' | 'admin';
export type KycStatus = 'pending' | 'approved' | 'rejected';
export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'disputed';
export type PaymentStatus = 'pending' | 'completed' | 'refunded' | 'failed';
export type DisputeStatus = 'open' | 'investigating' | 'resolved' | 'closed';

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
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
  bio: string | null;
  category_id: string | null;
  hourly_rate: number | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  is_verified: boolean;
  is_available: boolean;
  kyc_status: KycStatus;
  kyc_documents: Record<string, unknown> | null;
  rating: number;
  total_reviews: number;
  total_earnings: number;
  created_at: string;
  updated_at: string;
  users?: User;
  categories?: Category;
  services?: Service[];
}

export interface Service {
  id: string;
  provider_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  categories?: Category;
}

export interface Booking {
  id: string;
  customer_id: string;
  provider_id: string;
  service_id: string | null;
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
}

export interface Review {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  customer?: User;
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

export interface ChatRoom {
  booking_id: string;
  other_user: User;
  last_message: Message | null;
  unread_count: number;
  booking: Booking;
}
