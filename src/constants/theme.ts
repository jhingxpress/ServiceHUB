export const COLORS = {
  // Primary: Home Credit Red
  primary: '#E31C3D',
  primaryDark: '#B91D32',
  primaryLight: '#FEE2E2',

  // Neutrals
  background: '#F5F5F5',
  surface: '#FFFFFF',
  surfaceSecondary: '#FAFAFA',
  surfaceTertiary: '#F0F0F0',

  // Text
  text: '#222222',
  textSecondary: '#666666',
  textLight: '#999999',
  textMuted: '#BBBBBB',

  // Borders
  border: '#E5E5E5',
  divider: '#EEEEEE',

  // Semantic
  success: '#16A34A',
  successLight: '#DCFCE7',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  error: '#DC2626',
  errorLight: '#FEE2E2',
  info: '#2563EB',
  infoLight: '#DBEAFE',

  // Booking status colors
  pending: '#F59E0B',
  accepted: '#2563EB',
  on_the_way: '#2563EB',
  arrived: '#7C3AED',
  in_progress: '#7C3AED',
  completed: '#16A34A',
  cancelled: '#DC2626',
  rejected: '#DC2626',
  disputed: '#EA580C',

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.5)',
  overlayLight: 'rgba(0,0,0,0.3)',
};

export const FONTS = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semiBold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
  sizes: {
    xs: 11,
    sm: 12,
    base: 14,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 20,
    xxxl: 24,
    display: 28,
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const BORDER_RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
};

export const SHADOWS = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
};

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#FEF3C7', text: '#92400E' },
  accepted: { bg: '#DBEAFE', text: '#1E40AF' },
  on_the_way: { bg: '#DBEAFE', text: '#1E40AF' },
  arrived: { bg: '#EDE9FE', text: '#4C1D95' },
  in_progress: { bg: '#EDE9FE', text: '#4C1D95' },
  completed: { bg: '#DCFCE7', text: '#166534' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B' },
  rejected: { bg: '#FEE2E2', text: '#991B1B' },
  disputed: { bg: '#FFEDD5', text: '#9A3412' },
};
