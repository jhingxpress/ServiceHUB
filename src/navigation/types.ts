import { NavigatorScreenParams } from '@react-navigation/native';
import { Notification } from '../types';

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  ProfileCompletion: undefined;
  EmailVerified: undefined;
  ResetPassword: undefined;
  MustChangePassword: undefined;
  Customer: NavigatorScreenParams<CustomerStackParamList>;
  Provider: NavigatorScreenParams<ProviderStackParamList>;
  Admin: NavigatorScreenParams<AdminStackParamList>;
};

export type AuthStackParamList = {
  Splash: undefined;
  Login: { email?: string } | undefined;
  Register: undefined;
  RoleSelection: { email: string; password: string; fullName: string; phone?: string; acceptedTerms?: boolean };
  EmailVerification: { email?: string };
  ForgotPassword: undefined;
};

export type CustomerStackParamList = {
  CustomerTabs: NavigatorScreenParams<CustomerTabParamList>;
  ProviderProfile: { providerId: string };
  ProviderStorefront: { providerId: string };
  ServiceDetail: { serviceId: string };
  BookService: {
    providerId: string;
    serviceId?: string;
    serviceOptionId?: string;
    serviceName?: string;
    price?: number;
  };
  BookingDetail: { bookingId: string };
  ChatRoom: {
    bookingId: string;
    otherUserId: string;
    otherUserName: string;
    otherUserAvatar?: string | null;
  };
  ReviewService: {
    bookingId: string;
    providerId: string;
    providerName: string;
  };
  CategoryList: { categoryId: string; categoryName: string; icon?: string };
  ProviderList: { categoryId?: string; categoryName?: string; search?: string };
  EditProfile: undefined;
  NotificationCenter: undefined;
  MyReviews: undefined;
  ReviewDetail: {
    reviewId: string;
    providerName?: string;
    serviceName?: string;
    bookingDate?: string;
  };
  MyFavorites: undefined;
  MapDiscovery: undefined;
  MapboxDiscovery: undefined;
  ReportScreen: { reportedUserId: string; bookingId?: string; reportedUserName?: string };
  AllCategories: undefined;
  LiveTracking: {
    bookingId: string;
    providerName: string;
    customerLat?: number;
    customerLng?: number;
  };
  SavedLocations: undefined;
  NotificationDetail: { notification: Notification };
};

export type CustomerTabParamList = {
  Home: undefined;
  Search: undefined;
  Bookings: undefined;
  Messages: undefined;
  Profile: undefined;
};

export type ProviderStackParamList = {
  ProviderTabs: NavigatorScreenParams<ProviderTabParamList>;
  BookingDetail: { bookingId: string };
  ChatRoom: {
    bookingId: string;
    otherUserId: string;
    otherUserName: string;
    otherUserAvatar?: string | null;
  };
  ProfileSetup: undefined;
  ManageServices: undefined;
  ServiceOptions: { serviceId: string; serviceName: string };
  ProviderServicePreview: { serviceId: string };
  ProviderOnboarding: undefined;
  PendingApproval: undefined;
  NotificationCenter: undefined;
  ProviderReviews: undefined;
  ProviderAnalytics: undefined;
  HistoricalAnalytics: undefined;
  EarningsSummary: undefined;
  ReportScreen: { reportedUserId: string; bookingId?: string; reportedUserName?: string };
  ProviderLiveTracking: {
    bookingId: string;
    customerName: string;
    customerLat?: number;
    customerLng?: number;
  };
  NotificationDetail: { notification: Notification };
  BookingIncidentReport: { bookingId: string };
  PlatformFeeBalance: undefined;
};

export type ProviderTabParamList = {
  Dashboard: undefined;
  Requests: undefined;
  ActiveJobs: undefined;
  Messages: undefined;
  Earnings: undefined;
  Schedule: undefined;
  Settings: undefined;
};

export type AdminStackParamList = {
  AdminTabs: NavigatorScreenParams<AdminTabParamList>;
  StaffTabs: NavigatorScreenParams<StaffTabParamList>;
  PendingProviders: undefined;
  AllProviders: undefined;
  ManageUsers: undefined;
  ProviderDetail: { providerId: string };
  UserDetail: { userId: string };
  BookingDetail: { bookingId: string };
  BookingManagement: undefined;
  DisputeDetail: { disputeId: string };
  Disputes: undefined;
  AdminReports: undefined;
  AdminReviews: undefined;
  AdminNotifications: undefined;
  AdminRevenue: undefined;
  FeaturedRevenue: undefined;
  TipsRevenue: undefined;
  ProviderEconomy: undefined;
  AdminBroadcast: undefined;
  OperationsCenter: undefined;
  StaffManagement: undefined;
  StaffActionLogs: undefined;
  StaffIncidentReports: undefined;
  Escalations: undefined;
  AdminPlatformFees: undefined;
};

export type AdminTabParamList = {
  Dashboard: undefined;
  Providers: undefined;
  Bookings: undefined;
  Users: undefined;
  Analytics: undefined;
  Disputes: undefined;
};

export type StaffTabParamList = {
  OperationsCenter: undefined;
  Logs: undefined;
};
