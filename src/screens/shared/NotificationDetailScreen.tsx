import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { Notification } from '../../types';

type ParamList = { NotificationDetail: { notification: Notification } };
type RouteType = RouteProp<ParamList, 'NotificationDetail'>;

const TYPE_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  announcement: 'megaphone-outline',
  maintenance: 'hammer-outline',
  policy_update: 'document-text-outline',
  marketing: 'pricetag-outline',
  system: 'information-circle-outline',
  dispute_opened: 'warning-outline',
  dispute_updated: 'warning-outline',
  dispute_resolved: 'checkmark-circle-outline',
};

export default function NotificationDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteType>();
  const { notification } = route.params;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={TYPE_ICONS[notification.type] ?? 'notifications-outline'}
            size={32}
            color={COLORS.primary}
          />
        </View>
        <Text style={styles.title}>{notification.title}</Text>
        <Text style={styles.time}>
          {new Date(notification.created_at).toLocaleString()}
        </Text>
        <Text style={styles.body}>{notification.body}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold, color: COLORS.text },
  content: { padding: SPACING.md, alignItems: 'center' },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONTS.sizes.xl,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  time: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textLight,
    marginBottom: SPACING.lg,
  },
  body: {
    fontSize: FONTS.sizes.base,
    color: COLORS.textSecondary,
    lineHeight: 24,
    textAlign: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
    alignSelf: 'stretch',
  },
});
