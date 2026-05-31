import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Provider } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../ui/Avatar';

interface Props {
  provider: Provider | null;
  fallbackName?: string | null;
  fallbackAvatar?: string | null;
}

export default function ProviderInfoCard({ provider, fallbackName, fallbackAvatar }: Props) {
  const displayName = provider?.business_name ?? provider?.owner_name ?? fallbackName ?? 'Provider';
  const avatarUri = provider?.profile_photo_url ?? fallbackAvatar ?? null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Service Provider</Text>
      <View style={styles.row}>
        <Avatar uri={avatarUri} name={displayName} size={56} />
        <View style={styles.info}>
          <Text style={styles.name}>{displayName}</Text>
          {provider?.business_headline ? (
            <Text style={styles.headline}>{provider.business_headline}</Text>
          ) : null}
          {provider?.service_area ? (
            <View style={styles.metaRow}>
              <Ionicons name="map-outline" size={13} color={COLORS.textSecondary} />
              <Text style={styles.metaText}>{provider.service_area}</Text>
            </View>
          ) : null}
          {provider?.city ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={13} color={COLORS.textSecondary} />
              <Text style={styles.metaText}>{provider.city}{provider?.province ? `, ${provider.province}` : ''}</Text>
            </View>
          ) : null}
          {provider?.years_of_experience ? (
            <View style={styles.metaRow}>
              <Ionicons name="briefcase-outline" size={13} color={COLORS.textSecondary} />
              <Text style={styles.metaText}>{provider.years_of_experience} years experience</Text>
            </View>
          ) : null}
        </View>
      </View>
      {provider?.is_available !== undefined && (
        <View style={[styles.availabilityBadge, provider.is_available ? styles.availabilityActive : styles.availabilityInactive]}>
          <Ionicons
            name={provider.is_available ? 'checkmark-circle' : 'close-circle'}
            size={14}
            color={provider.is_available ? COLORS.success : COLORS.error}
          />
          <Text style={[styles.availabilityText, { color: provider.is_available ? COLORS.success : COLORS.error }]}>
            {provider.is_available ? 'Available for bookings' : 'Currently unavailable'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    gap: SPACING.md,
    ...SHADOWS.small,
  },
  title: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  info: { flex: 1 },
  name: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  headline: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  metaText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  availabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    alignSelf: 'flex-start',
  },
  availabilityActive: { backgroundColor: '#D1FAE5' },
  availabilityInactive: { backgroundColor: '#FEE2E2' },
  availabilityText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold },
});
