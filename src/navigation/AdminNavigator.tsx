import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { AdminStackParamList, AdminTabParamList } from './types';
import { COLORS } from '../constants/theme';

import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import PendingProvidersScreen from '../screens/admin/PendingProvidersScreen';
import UsersScreen from '../screens/admin/UsersScreen';
import AnalyticsScreen from '../screens/admin/AnalyticsScreen';
import ProviderDetailScreen from '../screens/admin/ProviderDetailScreen';
import UserDetailScreen from '../screens/admin/UserDetailScreen';
import BookingManagementScreen from '../screens/admin/BookingManagementScreen';
import DisputesScreen from '../screens/admin/DisputesScreen';
import AdminKYCScreen from '../screens/admin/AdminKYCScreen';
import CustomerKYCDetailScreen from '../screens/admin/CustomerKYCDetailScreen';

const Stack = createNativeStackNavigator<AdminStackParamList>();
const Tab = createBottomTabNavigator<AdminTabParamList>();

function AdminTabs() {
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
            case 'KYC':
              iconName = focused ? 'shield-checkmark' : 'shield-checkmark-outline';
              break;
            default:
              iconName = focused ? 'bar-chart' : 'bar-chart-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={AdminDashboardScreen} />
      <Tab.Screen name="Providers" component={PendingProvidersScreen} />
      <Tab.Screen name="Bookings" component={BookingManagementScreen} />
      <Tab.Screen name="Users" component={UsersScreen} />
      <Tab.Screen name="Disputes" component={DisputesScreen} />
      <Tab.Screen name="KYC" component={AdminKYCScreen} />
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
      <Stack.Screen name="ManageUsers" component={UsersScreen} />
      <Stack.Screen name="ProviderDetail" component={ProviderDetailScreen} />
      <Stack.Screen name="UserDetail" component={UserDetailScreen} />
      <Stack.Screen name="BookingManagement" component={BookingManagementScreen} />
      <Stack.Screen name="CustomerKYCDetail" component={CustomerKYCDetailScreen} />
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
    fontWeight: '500',
  },
});
