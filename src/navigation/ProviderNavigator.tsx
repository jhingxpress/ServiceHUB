import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { ProviderStackParamList, ProviderTabParamList } from './types';
import { COLORS } from '../constants/theme';

import ProviderDashboardScreen from '../screens/provider/ProviderDashboardScreen';
import ActiveJobsScreen from '../screens/provider/ActiveJobsScreen';
import BookingRequestsScreen from '../screens/provider/BookingRequestsScreen';
import EarningsScreen from '../screens/provider/EarningsScreen';
import ScheduleScreen from '../screens/provider/ScheduleScreen';
import ProviderSettingsScreen from '../screens/provider/ProviderSettingsScreen';
import BookingDetailScreen from '../screens/provider/ProviderBookingDetailScreen';
import ChatScreen from '../screens/customer/ChatScreen';
import ProviderProfileSetupScreen from '../screens/provider/ProviderProfileSetupScreen';
import ServicesScreen from '../screens/provider/ServicesScreen';
import AddServiceScreen from '../screens/provider/AddServiceScreen';

const Stack = createNativeStackNavigator<ProviderStackParamList>();
const Tab = createBottomTabNavigator<ProviderTabParamList>();

function ProviderTabs() {
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
            default:
              iconName = focused ? 'settings' : 'settings-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={ProviderDashboardScreen} />
      <Tab.Screen name="Requests" component={BookingRequestsScreen} />
      <Tab.Screen name="ActiveJobs" component={ActiveJobsScreen} />
      <Tab.Screen name="Earnings" component={EarningsScreen} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} />
      <Tab.Screen name="Settings" component={ProviderSettingsScreen} />
    </Tab.Navigator>
  );
}

export default function ProviderNavigator() {
  return (
    <Stack.Navigator 
      screenOptions={{ 
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        gestureDirection: 'horizontal',
      }}
    >
      <Stack.Screen name="ProviderTabs" component={ProviderTabs} />
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen} />
      <Stack.Screen name="ChatRoom" component={ChatScreen} />
      <Stack.Screen name="ProfileSetup" component={ProviderProfileSetupScreen} />
      <Stack.Screen name="ManageServices" component={ServicesScreen} />
      <Stack.Screen name="AddService" component={AddServiceScreen} />
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
