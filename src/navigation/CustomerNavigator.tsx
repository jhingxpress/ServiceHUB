import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';
import { CustomerStackParamList, CustomerTabParamList } from './types';
import { COLORS, FONTS } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

import HomeScreen from '../screens/customer/HomeScreen';
import SearchScreen from '../screens/customer/SearchScreen';
import BookingHistoryScreen from '../screens/customer/BookingHistoryScreen';
import ChatListScreen from '../screens/customer/ChatListScreen';
import CustomerProfileScreen from '../screens/customer/ProfileScreen';
import ProviderProfileScreen from '../screens/customer/ProviderProfileScreen';
import ProviderStorefrontScreen from '../screens/customer/ProviderStorefrontScreen';
import BookingScreen from '../screens/customer/BookingScreen';
import BookingDetailScreen from '../screens/customer/BookingDetailScreen';
import ChatScreen from '../screens/customer/ChatScreen';
import ReviewScreen from '../screens/customer/ReviewScreen';
import CategoryListScreen from '../screens/customer/CategoryListScreen';
import ProviderListScreen from '../screens/customer/ProviderListScreen';
import ServiceDetailScreen from '../screens/customer/ServiceDetailScreen';
import NotificationCenterScreen from '../screens/customer/NotificationCenterScreen';
import MyReviewsScreen from '../screens/customer/MyReviewsScreen';
import ReviewDetailScreen from '../screens/customer/ReviewDetailScreen';
import EditProfileScreen from '../screens/customer/EditProfileScreen';
import MyFavoritesScreen from '../screens/customer/MyFavoritesScreen';
import MapDiscoveryScreen from '../screens/customer/MapDiscoveryScreen';
import MapboxDiscoveryScreen from '../screens/customer/MapboxDiscoveryScreen';
import AllCategoriesScreen from '../screens/customer/AllCategoriesScreen';
import ReportScreen from '../screens/shared/ReportScreen';
import LiveTrackingScreen from '../screens/customer/LiveTrackingScreen';
import SavedLocationsScreen from '../screens/customer/SavedLocationsScreen';

const Stack = createNativeStackNavigator<CustomerStackParamList>();
const Tab = createBottomTabNavigator<CustomerTabParamList>();

function CustomerTabs() {
  const { user } = useAuthStore();
  const [notifBadge, setNotifBadge] = useState(0);
  const [msgBadge, setMsgBadge] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchBadge = async () => {
      const [{ count: notifCount }, { count: msgCount }] = await Promise.all([
        supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false)
          .neq('type', 'chat_message'),   // chat_message already counted by Messages badge
        supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('receiver_id', user.id)
          .eq('is_read', false),
      ]);
      setNotifBadge(notifCount ?? 0);
      setMsgBadge(msgCount ?? 0);
    };
    fetchBadge();

    const channel = supabase
      .channel(`nav-notif-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => fetchBadge()   // refetch so chat_message inserts don't inflate the count
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => fetchBadge()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        () => fetchBadge()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        () => fetchBadge()
      )
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
        tabBarIcon: ({ color, focused, size }) => {
          let iconName: React.ComponentProps<typeof Ionicons>['name'];
          switch (route.name) {
            case 'Home':
              iconName = focused ? 'home' : 'home-outline';
              break;
            case 'Search':
              iconName = focused ? 'search' : 'search-outline';
              break;
            case 'Bookings':
              iconName = focused ? 'calendar' : 'calendar-outline';
              break;
            case 'Messages':
              iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
              break;
            default:
              iconName = focused ? 'person' : 'person-outline';
          }
          return (
            <View style={focused ? styles.activeIcon : undefined}>
              <Ionicons name={iconName} size={size} color={color} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Bookings" component={BookingHistoryScreen} />
      <Tab.Screen
        name="Messages"
        component={ChatListScreen}
        options={{ tabBarBadge: msgBadge > 0 ? (msgBadge > 99 ? '99+' : msgBadge) : undefined }}
      />
      <Tab.Screen
        name="Profile"
        component={CustomerProfileScreen}
        options={{ tabBarBadge: notifBadge > 0 ? (notifBadge > 99 ? '99+' : notifBadge) : undefined }}
      />
    </Tab.Navigator>
  );
}

export default function CustomerNavigator() {
  return (
    <Stack.Navigator 
      screenOptions={{ 
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        gestureDirection: 'horizontal',
      }}
    >
      <Stack.Screen name="CustomerTabs" component={CustomerTabs} />
      <Stack.Screen name="ProviderProfile" component={ProviderProfileScreen} />
      <Stack.Screen name="ProviderStorefront" component={ProviderStorefrontScreen} />
      <Stack.Screen name="BookService" component={BookingScreen} />
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen} />
      <Stack.Screen name="ChatRoom" component={ChatScreen} />
      <Stack.Screen name="ReviewService" component={ReviewScreen} />
      <Stack.Screen name="CategoryList" component={CategoryListScreen} />
      <Stack.Screen name="ProviderList" component={ProviderListScreen} />
      <Stack.Screen name="ServiceDetail" component={ServiceDetailScreen} />
      <Stack.Screen name="NotificationCenter" component={NotificationCenterScreen} />
      <Stack.Screen name="MyReviews" component={MyReviewsScreen} />
      <Stack.Screen name="ReviewDetail" component={ReviewDetailScreen} />
      <Stack.Screen name="MyFavorites" component={MyFavoritesScreen} />
      <Stack.Screen name="MapDiscovery" component={MapDiscoveryScreen} />
      <Stack.Screen name="MapboxDiscovery" component={MapboxDiscoveryScreen} options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="AllCategories" component={AllCategoriesScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="ReportScreen" component={ReportScreen} />
      <Stack.Screen name="LiveTracking" component={LiveTrackingScreen} options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="SavedLocations" component={SavedLocationsScreen} options={{ headerShown: false }} />
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
  activeIcon: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 8,
    padding: 2,
    paddingHorizontal: 6,
  },
});
