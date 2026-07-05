import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { format, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { PlatformFee, ProviderFeeBalance, BalanceStatus } from '../../types';

const STATUS_CFG: Record<BalanceStatus, { label: string; color: string; bg: string; icon: string }> = {
  clear:   { label: 'Clear',    color: '#059669', bg: '#D1FAE5', icon: 'checkmark-circle'  },
  warning: { label: 'Warning',  color: '#D97706', bg: '#FEF3C7', icon: 'warning'           },
  overdue: { label: 'Overdue',  color: '#DC2626', bg: '#FEE2E2', icon: 'alert-circle'      },
  review:  { label: 'Review',   color: '#7C3AED', bg: '#EDE9FE', icon: 'eye'               },
};

const FEE_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  unpaid:   { label: 'Unpaid',   color: '#DC2626', bg: '#FEE2E2' },
  paid:     { label: 'Paid',     color: '#059669', bg: '#D1FAE5' },
  waived:   { label: 'Waived',   color: '#7C3AED', bg: '#EDE9FE' },
  disputed: { label: 'Disputed', color: '#D97706', bg: '#FEF3C7' },
};

function fmtPHP(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PlatformFeeBalanceScreen() {
  const navigation = useNavigation();
  const { user } = useAuthStore();

  const [balance, setBalance]       = useState<ProviderFeeBalance | null>(null);
  const [fees, setFees]             = useState<PlatformFee[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;

    const [balRes, feesRes] = await Promise.all([
      supabase.rpc('get_provider_fee_balance', { p_provider_id: user.id }),
      supabase
        .from('provider_platform_fees')
        .select('*')
        .eq('provider_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (balRes.data && balRes.data.length > 0) {
      setBalance(balRes.data[0] as ProviderFeeBalance);
    } else {
      setBalance({ total_unpaid: 0, oldest_due_date: null, days_since_oldest: 0, balance_status: 'clear' });
    }

    setFees((feesRes.data ?? []) as PlatformFee[]);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  const handlePay = async (feeIds: string[]) => {
    if (checkoutLoading || feeIds.length === 0) return;
    setCheckoutLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-platform-fee-checkout', {
        body: { fee_ids: feeIds },
      });
      if (error || !data?.checkout_url) {
        throw new Error(error?.message ?? data?.error ?? 'Failed to create checkout session');
      }
      await Linking.openURL(data.checkout_url);
    } catch (err: any) {
      Alert.alert(
        'Payment Error',
        err.message ?? 'Something went wrong. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setCheckoutLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const cfg = balance ? STATUS_CFG[balance.balance_status] : STATUS_CFG.clear;
  const daysLeft = balance?.oldest_due_date
    ? Math.max(0, 30 - (balance.days_since_oldest ?? 0))
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Platform Balance</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={styles.content}
      >
        {/* Balance Summary Card */}
        <View style={[styles.balanceCard, { borderColor: cfg.color + '40' }]}>
          <View style={styles.balanceTop}>
            <View>
              <Text style={styles.balanceLabel}>Outstanding Balance</Text>
              <Text style={[styles.balanceAmount, { color: balance?.total_unpaid ? cfg.color : COLORS.success }]}>
                {fmtPHP(balance?.total_unpaid ?? 0)}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
              <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>

          {balance?.total_unpaid ? (
            <View style={styles.balanceMeta}>
              {balance.oldest_due_date && (
                <View style={styles.metaRow}>
                  <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
                  <Text style={styles.metaText}>
                    Oldest due: {format(parseISO(balance.oldest_due_date), 'MMM d, yyyy')}
                  </Text>
                </View>
              )}
              {daysLeft !== null && daysLeft > 0 && (
                <View style={styles.metaRow}>
                  <Ionicons name="time-outline" size={14} color={COLORS.textSecondary} />
                  <Text style={styles.metaText}>Due in {daysLeft} day{daysLeft !== 1 ? 's' : ''}</Text>
                </View>
              )}
              {balance.days_since_oldest > 30 && (
                <View style={styles.metaRow}>
                  <Ionicons name="alert-circle-outline" size={14} color={cfg.color} />
                  <Text style={[styles.metaText, { color: cfg.color }]}>
                    {balance.days_since_oldest} days since oldest due date
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.metaRow}>
              <Ionicons name="checkmark-circle-outline" size={14} color={COLORS.success} />
              <Text style={[styles.metaText, { color: COLORS.success }]}>No outstanding fees</Text>
            </View>
          )}
        </View>

        {/* Pay All Fees button — only when there is an outstanding balance */}
        {balance && balance.total_unpaid > 0 && (() => {
          const unpaidIds = fees.filter((f) => f.status === 'unpaid').map((f) => f.id);
          return (
            <TouchableOpacity
              style={[styles.payAllBtn, checkoutLoading && styles.payAllBtnDisabled]}
              onPress={() => handlePay(unpaidIds)}
              disabled={checkoutLoading}
              activeOpacity={0.8}
            >
              {checkoutLoading ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <>
                  <Ionicons name="card-outline" size={18} color={COLORS.white} />
                  <Text style={styles.payAllBtnText}>
                    Pay All Fees · {fmtPHP(balance.total_unpaid)}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.white + 'CC'} />
                </>
              )}
            </TouchableOpacity>
          );
        })()}

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} />
          <Text style={styles.infoText}>
            TAGA charges a small platform fee per completed booking. Fees are due 30 days after booking completion.
            Contact support if you have questions about a specific fee.
          </Text>
        </View>

        {/* Fee List */}
        <Text style={styles.sectionTitle}>Fee History</Text>
        {fees.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No platform fees yet</Text>
            <Text style={styles.emptySubText}>Fees are generated when a booking is completed</Text>
          </View>
        ) : (
          fees.map((fee) => {
            const feeStatus = FEE_STATUS_CFG[fee.status] ?? FEE_STATUS_CFG.unpaid;
            const isPastDue = fee.status === 'unpaid' && new Date(fee.due_date) < new Date();
            return (
              <View key={fee.id} style={styles.feeCard}>
                <View style={styles.feeRow}>
                  <View style={styles.feeLeft}>
                    <Text style={styles.feeBookingId} numberOfLines={1}>
                      Booking #{fee.booking_id.slice(0, 8).toUpperCase()}
                    </Text>
                    <Text style={styles.feeDate}>
                      {format(parseISO(fee.created_at), 'MMM d, yyyy')}
                    </Text>
                  </View>
                  <View style={styles.feeRight}>
                    <Text style={styles.feeAmount}>{fmtPHP(fee.platform_fee)}</Text>
                    <View style={[styles.feeBadge, { backgroundColor: feeStatus.bg }]}>
                      <Text style={[styles.feeBadgeText, { color: feeStatus.color }]}>
                        {feeStatus.label}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.feeMeta}>
                  <Text style={styles.feeService}>
                    Booking amount: {fmtPHP(fee.booking_amount)}
                  </Text>
                  <Text style={[styles.feeDue, isPastDue && { color: COLORS.error }]}>
                    Due: {format(parseISO(fee.due_date), 'MMM d, yyyy')}
                    {isPastDue ? ' · PAST DUE' : ''}
                  </Text>
                </View>
                {fee.notes ? (
                  <Text style={styles.feeNotes}>{fee.notes}</Text>
                ) : null}
                {fee.status === 'unpaid' && (
                  <TouchableOpacity
                    style={[styles.payFeeBtn, checkoutLoading && styles.payAllBtnDisabled]}
                    onPress={() => handlePay([fee.id])}
                    disabled={checkoutLoading}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="card-outline" size={13} color={COLORS.primary} />
                    <Text style={styles.payFeeBtnText}>Pay This Fee</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: COLORS.background },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle:  { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
  content:      { padding: SPACING.md, gap: SPACING.md },

  balanceCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1.5, ...SHADOWS.small,
  },
  balanceTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.sm },
  balanceLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginBottom: 2 },
  balanceAmount: { fontSize: 28, fontFamily: FONTS.bold, color: COLORS.text },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: BORDER_RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 4,
  },
  statusText:   { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold },
  balanceMeta:  { gap: SPACING.xs },
  metaRow:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  metaText:     { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },

  infoBox: {
    flexDirection: 'row', gap: SPACING.xs, alignItems: 'flex-start',
    backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.primary + '30',
  },
  infoText: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.primary, lineHeight: 20 },

  sectionTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },

  emptyCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  emptyText:    { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.textLight, marginTop: SPACING.sm },
  emptySubText: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted, marginTop: 4, textAlign: 'center' },

  feeCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
    gap: SPACING.xs,
  },
  feeRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  feeLeft:      { flex: 1 },
  feeRight:     { alignItems: 'flex-end', gap: 4 },
  feeBookingId: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text },
  feeDate:      { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  feeAmount:    { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: COLORS.text },
  feeBadge: {
    borderRadius: BORDER_RADIUS.full, paddingHorizontal: 8, paddingVertical: 2,
  },
  feeBadgeText: { fontSize: 10, fontFamily: FONTS.semiBold },
  feeMeta:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feeService:   { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  feeDue:       { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  feeNotes:     { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontStyle: 'italic', marginTop: 2 },
  payAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs, backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg,
    ...SHADOWS.small,
  },
  payAllBtnDisabled: { opacity: 0.6 },
  payAllBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.white },
  payFeeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end',
    marginTop: SPACING.xs, borderWidth: 1, borderColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 4,
  },
  payFeeBtnText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.primary },
});
