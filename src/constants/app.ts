export const APP_CONFIG = {
  name: 'ServiceHub',
  version: '1.0.0',
  defaultCity: 'Manila',
  currency: 'PHP',
  currencySymbol: '₱',
  
  // Pagination
  defaultPageSize: 20,
  maxPhotosPerBooking: 4,
  maxMessageLength: 1000,
  
  // Timeouts
  requestTimeout: 30000,
  toastDuration: 3000,
  
  // Booking
  minBookingHours: 2,
  maxBookingDays: 30,
  
  // Rating
  minRating: 1,
  maxRating: 5,
};

export const BOOKING_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  ON_THE_WAY: 'on_the_way',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
  DISPUTED: 'disputed',
} as const;

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  REFUNDED: 'refunded',
  FAILED: 'failed',
} as const;

export const PAYMENT_METHOD = {
  CASH_ON_SERVICE: 'cash_on_service',
  GCASH: 'gcash',
  MAYA: 'maya',
} as const;

export const USER_ROLE = {
  CUSTOMER: 'customer',
  PROVIDER: 'provider',
  ADMIN: 'admin',
} as const;

export const KYC_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export const DISPUTE_STATUS = {
  OPEN: 'open',
  IN_REVIEW: 'in_review',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
} as const;
