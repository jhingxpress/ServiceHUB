import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import { CustomerStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;

interface MenuItem {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
  badge?: number;
}

export default function ProfileScreen() {
  const { user, signOut, updateProfile } = useAuthStore();
  const navigation = useNavigation<NavProp>();
  const [stats, setStats] = useState({ bookings: 0, reviews: 0, favorites: 0 });

  const fetchStats = useCallback(async () => {
    if (!user) return;
    const [b, r, f] = await Promise.all([
      supabase.from('bookings').select('id', { count: 'exact' }).eq('customer_id', user.id),
      supabase.from('reviews').select('id', { count: 'exact' }).eq('customer_id', user.id),
      supabase.from('favorite_providers').select('id', { count: 'exact' }).eq('customer_id', user.id),
    ]);
    setStats({
      bookings: b.count ?? 0,
      reviews: r.count ?? 0,
      favorites: f.count ?? 0,
    });
  }, [user]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleChangePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    const ext = uri.split('.').pop() ?? 'jpg';
    const path = `avatars/${user?.id}.${ext}`;

    const response = await fetch(uri);
    const blob = await response.blob();

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: `image/${ext}` });

    if (uploadError) {
      Alert.alert('Upload failed', uploadError.message);
      return;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    await updateProfile({ avatar_url: urlData.publicUrl });
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const menuItems: MenuItem[] = [
    {
      icon: 'calendar-outline',
      label: 'My Bookings',
      onPress: () => navigation.navigate('CustomerTabs', { screen: 'Bookings' }),
      badge: stats.bookings,
    },
    {
      icon: 'heart-outline',
      label: 'Saved Providers',
      onPress: () => Alert.alert('Coming Soon', 'Favorites list is coming soon'),
      badge: stats.favorites,
    },
    {
      icon: 'star-outline',
      label: 'My Reviews',
      onPress: () => navigation.navigate('MyReviews'),
      badge: stats.reviews,
    },
    {
      icon: 'notifications-outline',
      label: 'Notifications',
      onPress: () => navigation.navigate('NotificationCenter'),
    },
    {
      icon: 'help-circle-outline',
      label: 'Help & Support',
      onPress: () => Alert.alert('Coming Soon', 'Support chat is coming soon'),
    },
    {
      icon: 'log-out-outline',
      label: 'Sign Out',
      onPress: handleSignOut,
      danger: true,
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Text style={styles.title}>Profile</Text>
        </View>

        {/* Profile card */}
        <View style={styles.profileCard}>
          <TouchableOpacity style={styles.avatarWrap} onPress={handleChangePhoto}>
            <Avatar uri={user?.avatar_url} name={user?.full_name} size={80} />
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={14} color={COLORS.white} />
            </View>
          </TouchableOpacity>
          <Text style={styles.userName}>{user?.full_name ?? 'User'}</Text>
          <Text style={styles.userEmail}>{user?.email ?? ''}</Text>
          {user?.phone && (
            <Text style={styles.userPhone}>{user.phone}</Text>
          )}
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user?.role?.toUpperCase() ?? 'CUSTOMER'}</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsCard}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{stats.bookings}</Text>
            <Text style={styles.statLabel}>Bookings</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{stats.reviews}</Text>
            <Text style={styles.statLabel}>Reviews</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{stats.favorites}</Text>
            <Text style={styles.statLabel}>Saved</Text>
          </View>
        </View>

        {/* Menu */}
        <View style={styles.menuCard}>
          {menuItems.map((item, i) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuItem, i < menuItems.length - 1 && styles.menuItemBorder]}
              onPress={item.onPress}
            >
              <View style={[styles.menuIcon, item.danger && styles.menuIconDanger]}>
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.danger ? COLORS.error : COLORS.primary}
                />
              </View>
              <Text style={[styles.menuLabel, item.danger && styles.menuLabelDanger]}>
                {item.label}
              </Text>
              {item.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.version}>ServiceHub v1.0.0</Text>
        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  topBar: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  title: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.xxl, color: COLORS.text },
  profileCard: {
    alignItems: 'center', marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  avatarWrap: { marginBottom: SPACING.md, position: 'relative' },
  editBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.white,
  },
  userName: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.xl, color: COLORS.text },
  userEmail: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  userPhone: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  roleBadge: {
    marginTop: SPACING.sm, backgroundColor: COLORS.primaryLight,
    paddingHorizontal: SPACING.md, paddingVertical: 4, borderRadius: BORDER_RADIUS.full,
  },
  roleText: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.xs, color: COLORS.primary },
  statsCard: {
    flexDirection: 'row', marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.xl, color: COLORS.primary },
  statLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: COLORS.border },
  menuCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', ...SHADOWS.small,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md + 2,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  menuIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  menuIconDanger: { backgroundColor: '#FEE2E2' },
  menuLabel: { flex: 1, fontFamily: FONTS.medium, fontSize: FONTS.sizes.base, color: COLORS.text },
  menuLabelDanger: { color: COLORS.error },
  badge: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginRight: SPACING.xs },
  badgeText: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.xs, color: COLORS.white },
  version: { textAlign: 'center', fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginBottom: SPACING.sm },
});
