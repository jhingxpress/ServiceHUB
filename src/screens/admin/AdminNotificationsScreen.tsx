import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { AdminStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

type AlertType = 'pending_provider' | 'open_dispute' | 'open_report' | 'flagged_review' | 'featured_request';

interface AdminAlert {
  id: string;
  type: AlertType;
  title: string;
  body: string;
  entityId: string;
  createdAt: string;
  isRead: boolean;
}

const TYPE_CFG: Record<AlertType, { icon: string; color: string; bg: string }> = {
  pending_provider: { icon: 'shield-outline',        color: COLORS.warning,  bg: '#FEF3C7' },
  open_dispute:     { icon: 'alert-circle-outline',   color: COLORS.error,    bg: COLORS.errorLight },
  open_report:      { icon: 'flag-outline',            color: '#EA580C',       bg: '#FFEDD5' },
  flagged_review:   { icon: 'star-half-outline',       color: '#7C3AED',       bg: '#EDE9FE' },
  featured_request: { icon: 'sparkles-outline',         color: COLORS.warning,  bg: '#FEF3C7' },
};

export default function AdminNotificationsScreen() {
  const navigation = useNavigation<NavProp>();
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const loadAlerts = useCallback(async () => {
    const [provRes, dispRes, repRes, revRes, featRes] = await Promise.all([
      supabase
        .from('providers')
        .select('id, business_name, created_at')
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('disputes')
        .select('id, reason, created_at')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('reports')
        .select('id, report_type, description, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('reviews')
        .select('id, created_at, booking_id')
        .eq('is_hidden', true)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('featured_requests')
        .select('id, created_at, providers!provider_id(id, business_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const built: AdminAlert[] = [
      ...(provRes.data ?? []).map((p: { id: string; business_name: string | null; created_at: string }) => ({
        id: `prov-${p.id}`,
        type: 'pending_provider' as AlertType,
        title: 'Pending Provider Approval',
        body: `${p.business_name ?? 'A provider'} is awaiting KYC verification.`,
        entityId: p.id,
        createdAt: p.created_at,
        isRead: false,
      })),
      ...(dispRes.data ?? []).map((d: { id: string; reason: string; created_at: string }) => ({
        id: `disp-${d.id}`,
        type: 'open_dispute' as AlertType,
        title: 'Open Dispute',
        body: d.reason?.slice(0, 80) ?? 'A dispute needs review.',
        entityId: d.id,
        createdAt: d.created_at,
        isRead: false,
      })),
      ...(repRes.data ?? []).map((r: { id: string; report_type: string; description: string; created_at: string }) => ({
        id: `rep-${r.id}`,
        type: 'open_report' as AlertType,
        title: `Report: ${r.report_type.replace(/_/g, ' ')}`,
        body: r.description?.slice(0, 80) ?? 'A report needs review.',
        entityId: r.id,
        createdAt: r.created_at,
        isRead: false,
      })),
      ...(revRes.data ?? []).map((rv: { id: string; created_at: string; booking_id: string }) => ({
        id: `rev-${rv.id}`,
        type: 'flagged_review' as AlertType,
        title: 'Flagged Review',
        body: 'A review has been hidden and needs moderation.',
        entityId: rv.id,
        createdAt: rv.created_at,
        isRead: false,
      })),
      ...(featRes.data ?? []).map((fr: any) => ({
        id: `feat-${fr.id}`,
        type: 'featured_request' as AlertType,
        title: 'Featured Provider Request',
        body: `${fr.providers?.business_name ?? 'A provider'} has requested Featured Provider status.`,
        entityId: fr.providers?.id ?? fr.id,
        createdAt: fr.created_at,
        isRead: false,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    setAlerts(built);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { loadAlerts(); }, [loadAlerts]));

  const markRead = (id: string) => setReadIds((prev) => new Set([...prev, id]));

  const handleTap = (item: AdminAlert) => {
    markRead(item.id);
    switch (item.type) {
      case 'pending_provider':
        navigation.navigate('ProviderDetail', { providerId: item.entityId });
        break;
      case 'open_dispute':
        navigation.navigate('DisputeDetail', { disputeId: item.entityId });
        break;
      case 'open_report':
        navigation.navigate('AdminReports');
        break;
      case 'flagged_review':
        navigation.navigate('AdminReviews');
        break;
      case 'featured_request':
        navigation.navigate('ProviderDetail', { providerId: item.entityId });
        break;
    }
  };

  const unread = alerts.filter((a) => !readIds.has(a.id)).length;

  const renderItem = ({ item }: { item: AdminAlert }) => {
    const cfg = TYPE_CFG[item.type];
    const isRead = readIds.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.card, isRead && styles.cardRead]}
        onPress={() => handleTap(item)}
        activeOpacity={0.8}
      >
        <View style={[styles.iconBox, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon as React.ComponentProps<typeof Ionicons>['name']} size={20} color={cfg.color} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <Text style={[styles.cardTitle, isRead && styles.cardTitleRead]}>{item.title}</Text>
            {!isRead && <View style={styles.dot} />}
          </View>
          <Text style={styles.cardBodyText} numberOfLines={2}>{item.body}</Text>
          <Text style={styles.cardTime}>{format(new Date(item.createdAt), 'MMM d, h:mm a')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Admin Alerts</Text>
          {unread > 0 && (
            <Text style={styles.subtitle}>{unread} item{unread > 1 ? 's' : ''} need attention</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.markAllBtn}
          onPress={() => setReadIds(new Set(alerts.map((a) => a.id)))}
        >
          <Text style={styles.markAllText}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadAlerts(); }}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={56} color={COLORS.success} />
              <Text style={styles.emptyTitle}>All clear!</Text>
              <Text style={styles.emptyBody}>No pending items requiring attention.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  title: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
  subtitle: { fontSize: FONTS.sizes.xs, color: COLORS.error, fontFamily: FONTS.medium },
  markAllBtn: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  markAllText: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontFamily: FONTS.semiBold },
  list: { padding: SPACING.md, gap: SPACING.sm },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  cardRead: { opacity: 0.6 },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 2 },
  cardTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, flex: 1 },
  cardTitleRead: { fontFamily: FONTS.medium, color: COLORS.textSecondary },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.error },
  cardBodyText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 18 },
  cardTime: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: SPACING.xxxl, gap: SPACING.sm },
  emptyTitle: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold, color: COLORS.text },
  emptyBody: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, textAlign: 'center' },
});
