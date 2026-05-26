import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../../constants/theme';

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  size?: number;
  color?: string;
  interactive?: boolean;
  onRate?: (rating: number) => void;
}

export default React.memo(function StarRating({
  rating,
  maxStars = 5,
  size = 16,
  color = '#F59E0B',
  interactive = false,
  onRate,
}: StarRatingProps) {
  const stars = Array.from({ length: maxStars }, (_, i) => i + 1);

  return (
    <View style={styles.container}>
      {stars.map((star) => {
        const filled = star <= Math.round(rating);
        const icon: React.ComponentProps<typeof Ionicons>['name'] = filled
          ? 'star'
          : 'star-outline';

        if (interactive && onRate) {
          return (
            <TouchableOpacity
              key={star}
              onPress={() => onRate(star)}
              activeOpacity={0.7}
            >
              <Ionicons name={icon} size={size} color={color} style={styles.star} />
            </TouchableOpacity>
          );
        }

        return (
          <Ionicons
            key={star}
            name={icon}
            size={size}
            color={color}
            style={styles.star}
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    marginHorizontal: 1,
  },
});
