import { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Customer: NavigatorScreenParams<CustomerStackParamList>;
  Provider: NavigatorScreenParams<ProviderStackParamList>;
  Admin: NavigatorScreenParams<AdminStackParamList>;
};

export type AuthStackParamList = {
  Splash: undefined;
  Login: undefined;
  Register: undefined;
  RoleSelection: { email: string; password: string; fullName: string; phone?: string };
  EmailVerification: undefined;
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
  ReportScreen: { reportedUserId: string; bookingId?: string; reportedUserName?: string };
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
  ReportScreen: { reportedUserId: string; bookingId?: string; reportedUserName?: string };
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
  PendingProviders: undefined;
  ManageUsers: undefined;
  ProviderDetail: { providerId: string };
  UserDetail: { userId: string };
  BookingDetail: { bookingId: string };
  BookingManagement: undefined;
  DisputeDetail: { disputeId: string };
  AdminReports: undefined;
  AdminReviews: undefined;
  AdminNotifications: undefined;
  AdminRevenue: undefined;
  AdminBroadcast: undefined;
};

export type AdminTabParamList = {
  Dashboard: undefined;
  Providers: undefined;
  Bookings: undefined;
  Users: undefined;
  Analytics: undefined;
  Disputes: undefined;
};
