import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

export interface ServiceCardData {
  id: string;
  name: string;
  price: number;
  min_option_price?: number | null;
  provider_name: string | null;
  provider_rating?: number | null;
  provider_total_reviews?: number | null;
  image_url?: string | null;
}

export function getServicePriceLabel(service: ServiceCardData): string {
  const fmt = (n: number) => `₱${n.toLocaleString('en-PH')}`;
  if (service.min_option_price && service.min_option_price > 0) {
    return `From ${fmt(service.min_option_price)}`;
  }
  if (service.price > 0) {
    return fmt(service.price);
  }
  return 'Request Quote';
}

interface Props {
  service: ServiceCardData;
  onPress: () => void;
  showBookButton?: boolean;
  onBook?: () => void;
  variant?: 'featured' | 'compact';
}

export default function ServiceCard({
  service,
  onPress,
  showBookButton = false,
  onBook,
  variant = 'featured',
}: Props) {
  const formatPrice = (amount: number) => `₱${amount.toLocaleString('en-PH')}`;

  return (
    <TouchableOpacity
      style={[styles.card, variant === 'compact' && styles.compactCard]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Image */}
      <View style={[styles.imageWrap, variant === 'compact' && styles.compactImageWrap]}>
        {service.image_url ? (
          <Image source={{ uri: service.image_url }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="images-outline" size={32} color={COLORS.textLight} />
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.serviceName} numberOfLines={1}>
          {service.name}
        </Text>
        <Text style={styles.providerName} numberOfLines={1}>
          {service.provider_name ?? 'Provider'}
        </Text>

        <View style={styles.metaRow}>
          {service.provider_rating !== undefined && service.provider_rating !== null && (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={styles.ratingText}>
                {Number(service.provider_rating).toFixed(1)}
                {service.provider_total_reviews ? ` (${service.provider_total_reviews})` : ''}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.bottomRow}>
          <Text style={styles.priceText}>
            {getServicePriceLabel(service)}
          </Text>
          {showBookButton && onBook && (
            <TouchableOpacity style={styles.bookBtn} onPress={onBook} activeOpacity={0.8}>
              <Text style={styles.bookBtnText}>Book</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    width: 220,
    ...SHADOWS.small,
  },
  compactCard: {
    width: 160,
  },
  imageWrap: {
    width: '100%',
    height: 140,
  },
  compactImageWrap: {
    height: 110,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: SPACING.md,
    gap: 2,
  },
  serviceName: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.base,
    color: COLORS.text,
  },
  providerName: {
    fontFamily: FONTS.regular,
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    fontFamily: FONTS.medium,
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  priceText: {
    fontFamily: FONTS.bold,
    fontSize: FONTS.sizes.base,
    color: COLORS.primary,
  },
  bookBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  bookBtnText: {
    fontFamily: FONTS.semiBold,
    color: COLORS.white,
    fontSize: FONTS.sizes.xs,
  },
});
