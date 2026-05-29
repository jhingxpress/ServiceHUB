import { TextStyle } from 'react-native';
import { COLORS, FONTS } from './theme';

export const TYPOGRAPHY: Record<string, TextStyle> = {
  h1: {
    fontFamily: FONTS.bold,
    fontSize: FONTS.sizes.display,
    color: COLORS.text,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  h2: {
    fontFamily: FONTS.bold,
    fontSize: FONTS.sizes.xxxl,
    color: COLORS.text,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  h3: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.xxl,
    color: COLORS.text,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  h4: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.xl,
    color: COLORS.text,
    lineHeight: 24,
    letterSpacing: -0.1,
  },
  body: {
    fontFamily: FONTS.regular,
    fontSize: FONTS.sizes.base,
    color: COLORS.textSecondary,
    lineHeight: 22,
    letterSpacing: 0,
  },
  bodyMedium: {
    fontFamily: FONTS.medium,
    fontSize: FONTS.sizes.base,
    color: COLORS.text,
    lineHeight: 22,
    letterSpacing: 0,
  },
  caption: {
    fontFamily: FONTS.regular,
    fontSize: FONTS.sizes.sm,
    color: COLORS.textLight,
    lineHeight: 18,
    letterSpacing: 0.2,
  },
  small: {
    fontFamily: FONTS.regular,
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    lineHeight: 16,
    letterSpacing: 0.3,
  },
  button: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.base,
    color: COLORS.white,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  badge: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.xs,
    color: COLORS.white,
    lineHeight: 14,
    letterSpacing: 0.5,
  },
  label: {
    fontFamily: FONTS.medium,
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  price: {
    fontFamily: FONTS.bold,
    fontSize: FONTS.sizes.xl,
    color: COLORS.primary,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
};
