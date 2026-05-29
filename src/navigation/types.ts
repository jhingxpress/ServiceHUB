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
};

export type CustomerStackParamList = {
  CustomerTabs: NavigatorScreenParams<CustomerTabParamList>;
  ProviderProfile: { providerId: string };
  ProviderStorefront: { providerId: string };
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
  };
  ReviewService: {
    bookingId: string;
    providerId: string;
    providerName: string;
  };
  CategoryList: { categoryId: string; categoryName: string; icon?: string };
  ProviderList: { categoryId?: string; categoryName?: string; search?: string };
  CustomerKYC: undefined;
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
  };
  ProfileSetup: undefined;
  ManageServices: undefined;
  ServiceOptions: { serviceId: string; serviceName: string };
  ProviderOnboarding: undefined;
  PendingApproval: undefined;
};

export type ProviderTabParamList = {
  Dashboard: undefined;
  Requests: undefined;
  ActiveJobs: undefined;
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
  CustomerKYCDetail: { userId: string };
};

export type AdminTabParamList = {
  Dashboard: undefined;
  Providers: undefined;
  Bookings: undefined;
  Users: undefined;
  Analytics: undefined;
  Disputes: undefined;
  KYC: undefined;
};
