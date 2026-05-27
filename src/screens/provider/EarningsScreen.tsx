import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import EmptyState from '../../components/ui/EmptyState';

interface EarningRecord {
  id: string;
  amount: number;
  created_at: string;
  booking: { scheduled_date: string; customer: { full_name: string | null } };
}

export default function EarningsScreen() {
  const { user } = useAuthStore();
  const [total, setTotal] = useState(0);
  const [thisMonth, setThisMonth] = useState(0);
  const [records, setRecords] = useState<EarningRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) return;

      const [provRes, paymentsRes] = await Promise.all([
        supabase.from('providers').select('earnings_total').eq('id', user.id).single(),
        supabase
          .from('payments')
          .select('id, amount, created_at, booking:bookings(scheduled_date, customer:users!bookings_customer_id_fkey(full_name))')
          .eq('provider_id', user.id)
          .eq('status', 'completed')
          .order('created_at', { ascending: false }),
      ]);

      setTotal(provRes.data?.earnings_total ?? 0);

      const payments = paymentsRes.data ?? [];
      const now = new Date();
      const monthSum = payments
        .filter((p) => {
          const d = new Date(p.created_at);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        })
        .reduce((sum, p) => sum + p.amount, 0);

      setThisMonth(monthSum);
      setRecords(payments as unknown as EarningRecord[]);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Text style={styles.title}>Earnings</Text>
        </View>

        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryIcon}>
              <Ionicons name="wallet-outline" size={24} color={COLORS.primary} />
            </View>
            <Text style={styles.summaryValue}>₱{Number(total).toFixed(2)}</Text>
            <Text style={styles.summaryLabel}>Total Earned</Text>
          </View>
          <View style={[styles.summaryCard, styles.summaryCardHighlight]}>
            <View style={[styles.summaryIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Ionicons name="trending-up-outline" size={24} color={COLORS.white} />
            </View>
            <Text style={[styles.summaryValue, { color: COLORS.white }]}>₱{Number(thisMonth).toFixed(2)}</Text>
            <Text style={[styles.summaryLabel, { color: 'rgba(255,255,255,0.8)' }]}>This Month</Text>
          </View>
        </View>

        {/* Pending payout */}
        <View style={styles.payoutCard}>
          <View style={styles.payoutInfo}>
            <Text style={styles.payoutTitle}>Pending Payout</Text>
            <Text style={styles.payoutSub}>Next payment in 3 days</Text>
          </View>
          <Text style={styles.payoutAmount}>₱{(total * 0.1).toFixed(2)}</Text>
        </View>

        {/* Transaction history */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
          {records.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title="No transactions yet"
              subtitle="Your earnings will appear here after completed bookings"
            />
          ) : (
            records.map((r) => (
              <View key={r.id} style={styles.txRow}>
                <View style={styles.txIcon}>
                  <Ionicons name="arrow-down-circle-outline" size={24} color={COLORS.success} />
                </View>
                <View style={styles.txInfo}>
                  <Text style={styles.txTitle}>
                    {r.booking?.customer?.full_name ?? 'Customer'} booking
                  </Text>
                  <Text style={styles.txDate}>
                    {format(new Date(r.created_at), 'MMM d, yyyy')}
                  </Text>
                </View>
                <Text style={styles.txAmount}>+₱{Number(r.amount).toFixed(2)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text },
  summaryRow: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  summaryCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  summaryCardHighlight: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  summaryIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm,
  },
  summaryValue: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text },
  summaryLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  payoutCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  payoutInfo: {},
  payoutTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  payoutSub: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  payoutAmount: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.success },
  section: { paddingHorizontal: SPACING.md },
  sectionTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  txRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  txIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.successLight ?? '#D1FAE5', alignItems: 'center', justifyContent: 'center',
  },
  txInfo: { flex: 1 },
  txTitle: { fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.text },
  txDate: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  txAmount: { fontSize: FONTS.sizes.base, fontWeight: '800', color: COLORS.success },
});
