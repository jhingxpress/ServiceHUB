import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { ProviderStackParamList, ProviderTabParamList } from './types';
import { COLORS, FONTS } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

import ProviderDashboardScreen from '../screens/provider/ProviderDashboardScreen';
import ActiveJobsScreen from '../screens/provider/ActiveJobsScreen';
import BookingRequestsScreen from '../screens/provider/BookingRequestsScreen';
import EarningsScreen from '../screens/provider/EarningsScreen';
import ScheduleScreen from '../screens/provider/ScheduleScreen';
import ProviderSettingsScreen from '../screens/provider/ProviderSettingsScreen';
import BookingDetailScreen from '../screens/provider/ProviderBookingDetailScreen';
import ChatScreen from '../screens/customer/ChatScreen';
import ProviderProfileSetupScreen from '../screens/provider/ProviderProfileSetupScreen';
import ManageServicesScreen from '../screens/provider/ManageServicesScreen';
import ServiceOptionsScreen from '../screens/provider/ServiceOptionsScreen';
import ProviderServicePreviewScreen from '../screens/provider/ProviderServicePreviewScreen';
import ProviderOnboardingScreen from '../screens/provider/ProviderOnboardingScreen';
import PendingApprovalScreen from '../screens/provider/PendingApprovalScreen';
import NotificationCenterScreen from '../screens/customer/NotificationCenterScreen';
import ReportScreen from '../screens/shared/ReportScreen';
import ProviderReviewsScreen from '../screens/provider/ProviderReviewsScreen';
import ProviderMessagesScreen from '../screens/provider/ProviderMessagesScreen';
import ProviderAnalyticsScreen from '../screens/provider/ProviderAnalyticsScreen';
import EarningsSummaryScreen from '../screens/provider/EarningsSummaryScreen';

const Stack = createNativeStackNavigator<ProviderStackParamList>();
const Tab = createBottomTabNavigator<ProviderTabParamList>();

function ProviderTabs() {
  const { user } = useAuthStore();
  const [requestBadge, setRequestBadge] = useState(0);
  const [notifBadge, setNotifBadge] = useState(0);
  const [messageBadge, setMessageBadge] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchBadges = async () => {
      const [{ count: reqCount }, { count: notifCount }, { count: msgCount }] = await Promise.all([
        supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('provider_id', user.id).eq('status', 'pending'),
        supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false).neq('type', 'chat_message'), // chat_message already counted by Messages badge
        supabase.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', user.id).eq('is_read', false),
      ]);
      setRequestBadge(reqCount ?? 0);
      setNotifBadge(notifCount ?? 0);
      setMessageBadge(msgCount ?? 0);
    };
    fetchBadges();

    const channel = supabase
      .channel(`provider-nav-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `provider_id=eq.${user.id}` }, () => fetchBadges())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => fetchBadges())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, () => fetchBadges())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textLight,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, size, focused }) => {
          let iconName: React.ComponentProps<typeof Ionicons>['name'];
          switch (route.name) {
            case 'Dashboard':
              iconName = focused ? 'grid' : 'grid-outline';
              break;
            case 'Requests':
              iconName = focused ? 'list' : 'list-outline';
              break;
            case 'ActiveJobs':
              iconName = focused ? 'briefcase' : 'briefcase-outline';
              break;
            case 'Earnings':
              iconName = focused ? 'wallet' : 'wallet-outline';
              break;
            case 'Schedule':
              iconName = focused ? 'time' : 'time-outline';
              break;
            case 'Messages':
              iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
              break;
            default:
              iconName = focused ? 'settings' : 'settings-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={ProviderDashboardScreen} />
      <Tab.Screen
        name="Requests"
        component={BookingRequestsScreen}
        options={{ tabBarBadge: requestBadge > 0 ? (requestBadge > 99 ? '99+' : requestBadge) : undefined }}
      />
      <Tab.Screen name="ActiveJobs" component={ActiveJobsScreen} />
      <Tab.Screen
        name="Messages"
        component={ProviderMessagesScreen}
        options={{ tabBarBadge: messageBadge > 0 ? (messageBadge > 99 ? '99+' : messageBadge) : undefined }}
      />
      <Tab.Screen name="Earnings" component={EarningsScreen} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} />
      <Tab.Screen
        name="Settings"
        component={ProviderSettingsScreen}
        options={{ tabBarBadge: notifBadge > 0 ? (notifBadge > 99 ? '99+' : notifBadge) : undefined }}
      />
    </Tab.Navigator>
  );
}

export default function ProviderNavigator() {
  const { providerProfile } = useAuthStore();
  const status = providerProfile?.status ?? 'draft';
  const isApproved = status === 'approved';
  const isPending = status === 'pending_review' || status === 'rejected' || status === 'suspended';

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        gestureDirection: 'horizontal',
      }}
    >
      {isApproved ? (
        <>
          <Stack.Screen name="ProviderTabs" component={ProviderTabs} />
          <Stack.Screen name="BookingDetail" component={BookingDetailScreen} />
          <Stack.Screen name="ChatRoom" component={ChatScreen} />
          <Stack.Screen name="ProfileSetup" component={ProviderProfileSetupScreen} />
          <Stack.Screen name="ManageServices" component={ManageServicesScreen} />
          <Stack.Screen name="ServiceOptions" component={ServiceOptionsScreen} />
          <Stack.Screen name="ProviderServicePreview" component={ProviderServicePreviewScreen} />
          <Stack.Screen name="NotificationCenter" component={NotificationCenterScreen} />
          <Stack.Screen name="ProviderReviews" component={ProviderReviewsScreen} />
          <Stack.Screen name="ProviderAnalytics" component={ProviderAnalyticsScreen} />
          <Stack.Screen name="EarningsSummary" component={EarningsSummaryScreen} />
          <Stack.Screen name="ReportScreen" component={ReportScreen} />
        </>
      ) : isPending ? (
        <Stack.Screen name="PendingApproval" component={PendingApprovalScreen} />
      ) : (
        <Stack.Screen name="ProviderOnboarding" component={ProviderOnboardingScreen} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.surface,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    height: 65,
    paddingBottom: 10,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: FONTS.medium,
  },
});
