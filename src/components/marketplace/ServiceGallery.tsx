import React, { useState } from 'react';
import { View, Text, ScrollView, Image, Dimensions, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ServiceImage } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  images: ServiceImage[];
  emptyLabel?: string;
}

export default function ServiceGallery({ images, emptyLabel = 'No photos uploaded yet' }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (images.length === 0) {
    return (
      <View style={styles.emptyPlaceholder}>
        <Ionicons name="images-outline" size={48} color={COLORS.textMuted} />
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_WIDTH - SPACING.md * 2));
          setActiveIndex(idx);
        }}
      >
        {images.map((img, idx) => (
          <View key={img.id}>
            <Image source={{ uri: img.image_url }} style={styles.carouselImage} resizeMode="cover" />
            <View style={styles.photoCountBadge}>
              <Text style={styles.photoCountText}>{idx + 1} / {images.length}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      {images.length > 1 && (
        <View style={styles.dotRow}>
          {images.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  carouselImage: {
    width: SCREEN_WIDTH - SPACING.md * 2,
    height: 260,
    borderRadius: BORDER_RADIUS.xl,
    marginHorizontal: SPACING.md,
  },
  dotRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: SPACING.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  dotActive: { backgroundColor: COLORS.primary },
  photoCountBadge: {
    position: 'absolute',
    bottom: 12,
    right: SPACING.md + 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  photoCountText: { fontSize: FONTS.sizes.xs, color: COLORS.white, fontFamily: FONTS.semiBold },
  emptyPlaceholder: {
    height: 260,
    marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  emptyText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: SPACING.sm },
});
