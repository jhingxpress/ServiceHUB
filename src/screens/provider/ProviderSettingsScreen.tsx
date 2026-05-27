import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import { ProviderStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<ProviderStackParamList>;

export default function ProviderSettingsScreen() {
  const navigation = useNavigation<NavProp>();
  const { user, signOut } = useAuthStore();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const MENU_ITEMS = [
    {
      section: 'Profile',
      items: [
        { label: 'Edit Provider Profile', icon: 'person-outline', onPress: () => navigation.navigate('ProfileSetup') },
        { label: 'Manage Services', icon: 'construct-outline', onPress: () => navigation.navigate('ManageServices') },
        { label: 'Availability Schedule', icon: 'calendar-outline', onPress: () => navigation.navigate('ProviderTabs', { screen: 'Schedule' }) },
      ],
    },
    {
      section: 'Support',
      items: [
        { label: 'Help & FAQ', icon: 'help-circle-outline', onPress: () => Alert.alert('Help & FAQ', 'How can we help you?\n\n• Booking issues: Check your booking status in the Requests tab\n• Payment questions: Contact support for billing inquiries\n• Profile updates: Go to Profile Setup to edit your information\n• Technical issues: Try restarting the app or reinstalling') },
        { label: 'Contact Support', icon: 'chatbubble-outline', onPress: () => Alert.alert('Contact Support', 'Need help? Reach out to us:\n\n📧 Email: support@servicehub.com\n📱 Phone: +63 912 345 6789\n💬 Chat: Available 9AM-6PM PH time\n\nWe typically respond within 24 hours.') },
        { label: 'Terms of Service', icon: 'document-text-outline', onPress: () => Alert.alert('Terms of Service', 'By using ServiceHub, you agree to our Terms of Service.\n\nKey points:\n• You must be at least 18 years old\n• Provide accurate information\n• Services are provided by independent contractors\n• Payments must be made through the platform\n• No off-platform arrangements allowed\n\nFull terms available at servicehub.com/terms') },
        { label: 'Privacy Policy', icon: 'shield-outline', onPress: () => Alert.alert('Privacy Policy', 'Your privacy matters to us.\n\nWe collect:\n• Account information (name, email, phone)\n• Location data for service matching\n• Booking and payment history\n• KYC documents for verification\n\nWe do not sell your data. Your information is shared only with matched providers and necessary service partners.\n\nFull policy available at servicehub.com/privacy') },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>

        {/* Profile card */}
        <View style={styles.profileCard}>
          <Avatar uri={user?.avatar_url} name={user?.full_name} size={60} borderColor={COLORS.primary} />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.full_name ?? 'Provider'}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            <View style={styles.providerBadge}>
              <Ionicons name="briefcase" size={11} color={COLORS.primary} />
              <Text style={styles.providerBadgeText}>Service Provider</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('ProfileSetup')}>
            <Ionicons name="pencil" size={16} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {MENU_ITEMS.map((section) => (
          <View key={section.section} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.section}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, i) => (
                <React.Fragment key={item.label}>
                  <TouchableOpacity style={styles.menuRow} onPress={item.onPress} activeOpacity={0.7}>
                    <View style={styles.menuIcon}>
                      <Ionicons name={item.icon as React.ComponentProps<typeof Ionicons>['name']} size={18} color={COLORS.primary} />
                    </View>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
                  </TouchableOpacity>
                  {i < section.items.length - 1 && <View style={styles.divider} />}
                </React.Fragment>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.error} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text, paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.xl, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small, marginBottom: SPACING.lg,
  },
  profileInfo: { flex: 1 },
  profileName: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  profileEmail: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 1 },
  providerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5,
    backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start',
  },
  providerBadgeText: { fontSize: 10, color: COLORS.primary, fontWeight: '600' },
  editBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  section: { marginBottom: SPACING.md },
  sectionLabel: { fontSize: FONTS.sizes.xs, fontWeight: '700', color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: SPACING.md + 4, marginBottom: SPACING.xs },
  menuCard: {
    backgroundColor: COLORS.surface, marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md },
  menuIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: FONTS.sizes.base, color: COLORS.text, fontWeight: '500' },
  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: SPACING.md + 36 + SPACING.md },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    marginHorizontal: SPACING.md, padding: SPACING.md, borderRadius: BORDER_RADIUS.xl,
    backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA', marginTop: SPACING.sm,
  },
  signOutText: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.error },
});
