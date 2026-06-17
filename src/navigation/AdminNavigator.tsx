import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { AdminStackParamList, AdminTabParamList } from './types';
import { COLORS, FONTS } from '../constants/theme';
import { supabase } from '../lib/supabase';

import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import PendingProvidersScreen from '../screens/admin/PendingProvidersScreen';
import UsersScreen from '../screens/admin/UsersScreen';
import AnalyticsScreen from '../screens/admin/AnalyticsScreen';
import ProviderDetailScreen from '../screens/admin/ProviderDetailScreen';
import UserDetailScreen from '../screens/admin/UserDetailScreen';
import BookingManagementScreen from '../screens/admin/BookingManagementScreen';
import DisputesScreen from '../screens/admin/DisputesScreen';
import AdminReportsScreen from '../screens/admin/AdminReportsScreen';
import AdminReviewsScreen from '../screens/admin/AdminReviewsScreen';
import DisputeDetailScreen from '../screens/admin/DisputeDetailScreen';
import AdminBookingDetailScreen from '../screens/admin/AdminBookingDetailScreen';
import AdminNotificationsScreen from '../screens/admin/AdminNotificationsScreen';
import AdminRevenueScreen from '../screens/admin/AdminRevenueScreen';
import FeaturedRevenueScreen from '../screens/admin/FeaturedRevenueScreen';
import TipsRevenueScreen from '../screens/admin/TipsRevenueScreen';
import AdminBroadcastScreen from '../screens/admin/AdminBroadcastScreen';
import AdminKYCScreen from '../screens/admin/AdminKYCScreen';

const Stack = createNativeStackNavigator<AdminStackParamList>();
const Tab = createBottomTabNavigator<AdminTabParamList>();

function AdminTabs() {
  const [providerBadge, setProviderBadge] = useState(0);
  const [disputeBadge, setDisputeBadge] = useState(0);
  const [reportBadge, setReportBadge] = useState(0);

  useEffect(() => {
    const fetchBadges = async () => {
      const [provRes, dispRes, repRes] = await Promise.all([
        supabase
          .from('providers')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending_review'),
        supabase
          .from('disputes')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open'),
        supabase
          .from('reports')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
      ]);
      setProviderBadge(provRes.count ?? 0);
      setDisputeBadge(dispRes.count ?? 0);
      setReportBadge(repRes.count ?? 0);
    };

    fetchBadges();

    const channel = supabase
      .channel('admin-badges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'providers' }, fetchBadges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disputes' }, fetchBadges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, fetchBadges)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const badge = (n: number) => (n > 0 ? (n > 99 ? '99+' : n) : undefined);

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
              iconName = focused ? 'speedometer' : 'speedometer-outline';
              break;
            case 'Providers':
              iconName = focused ? 'person-add' : 'person-add-outline';
              break;
            case 'Bookings':
              iconName = focused ? 'calendar' : 'calendar-outline';
              break;
            case 'Users':
              iconName = focused ? 'people' : 'people-outline';
              break;
            case 'Disputes':
              iconName = focused ? 'alert-circle' : 'alert-circle-outline';
              break;
            default:
              iconName = focused ? 'bar-chart' : 'bar-chart-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={AdminDashboardScreen} />
      <Tab.Screen
        name="Providers"
        component={PendingProvidersScreen}
        options={{ tabBarBadge: badge(providerBadge) }}
      />
      <Tab.Screen name="Bookings" component={BookingManagementScreen} />
      <Tab.Screen name="Users" component={UsersScreen} />
      <Tab.Screen
        name="Disputes"
        component={DisputesScreen}
        options={{ tabBarBadge: badge(disputeBadge + reportBadge) }}
      />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
    </Tab.Navigator>
  );
}

export default function AdminNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        gestureDirection: 'horizontal',
      }}
    >
      <Stack.Screen name="AdminTabs" component={AdminTabs} />
      <Stack.Screen name="PendingProviders" component={PendingProvidersScreen} />
      <Stack.Screen name="AllProviders" component={AdminKYCScreen} />
      <Stack.Screen name="ManageUsers" component={UsersScreen} />
      <Stack.Screen name="ProviderDetail" component={ProviderDetailScreen} />
      <Stack.Screen name="UserDetail" component={UserDetailScreen} />
      <Stack.Screen name="BookingManagement" component={BookingManagementScreen} />
      <Stack.Screen name="BookingDetail" component={AdminBookingDetailScreen} />
      <Stack.Screen name="DisputeDetail" component={DisputeDetailScreen} />
      <Stack.Screen name="AdminReports" component={AdminReportsScreen} />
      <Stack.Screen name="AdminReviews" component={AdminReviewsScreen} />
      <Stack.Screen name="AdminNotifications" component={AdminNotificationsScreen} />
      <Stack.Screen name="AdminRevenue" component={AdminRevenueScreen} />
      <Stack.Screen name="FeaturedRevenue" component={FeaturedRevenueScreen} />
      <Stack.Screen name="TipsRevenue" component={TipsRevenueScreen} />
      <Stack.Screen name="AdminBroadcast" component={AdminBroadcastScreen} />
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
