import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { COLORS, BORDER_RADIUS } from '../../constants/theme';

interface AvatarProps {
  uri?: string | null;
  name?: string | null;
  size?: number;
  borderColor?: string;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function stringToColor(str: string): string {
  const colors = [
    '#6366F1', '#8B5CF6', '#EC4899', '#10B981',
    '#F59E0B', '#3B82F6', '#EF4444', '#06B6D4',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default React.memo(function Avatar({ uri, name, size = 40, borderColor }: AvatarProps) {
  const initials = name ? getInitials(name) : '?';
  const bgColor = name ? stringToColor(name) : COLORS.primary;
  const fontSize = size * 0.38;

  if (uri) {
    return (
      <Image
        source={{ uri, cache: 'force-cache' }}
        style={[
          styles.image,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: borderColor ? 2 : 0,
            borderColor: borderColor,
          },
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.placeholder,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
          borderWidth: borderColor ? 2 : 0,
          borderColor: borderColor,
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  image: {
    backgroundColor: COLORS.border,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: COLORS.white,
    fontFamily: FONTS.semiBold,
  },
});
