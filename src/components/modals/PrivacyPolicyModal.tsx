import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

interface PrivacyPolicyModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function PrivacyPolicyModal({ visible, onClose }: PrivacyPolicyModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <View style={styles.card}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Privacy Policy</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              <Text style={styles.lastUpdated}>Last Updated: June 5, 2026</Text>

              <Section title="1. Introduction">
                ServiceHub ("we", "us", "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and services.
              </Section>

              <Section title="2. Information We Collect">
                <Bullet><Bold>Personal Information:</Bold> Name, email address, phone number, address, date of birth, gender, and profile photo.</Bullet>
                <Bullet><Bold>Location Data:</Bold> GPS coordinates when you enable location services for bookings, provider discovery, or provider verification.</Bullet>
                <Bullet><Bold>Device Information:</Bold> Device type, operating system, unique device identifiers, and IP address.</Bullet>
                <Bullet><Bold>Usage Data:</Bold> Booking history, search queries, interactions with providers, and app usage patterns.</Bullet>
                <Bullet><Bold>Verification Documents:</Bold> Government IDs, business permits, and certifications submitted by providers.</Bullet>
                <Bullet><Bold>Payment Information:</Bold> Payment method details processed by third-party payment processors.</Bullet>
              </Section>

              <Section title="3. How We Use Your Information">
                We use your information to:
                <Bullet>Create and manage your account.</Bullet>
                <Bullet>Facilitate bookings and service delivery.</Bullet>
                <Bullet>Verify provider identities and qualifications.</Bullet>
                <Bullet>Process payments and commissions.</Bullet>
                <Bullet>Send booking confirmations, updates, and notifications.</Bullet>
                <Bullet>Improve Platform functionality and user experience.</Bullet>
                <Bullet>Detect and prevent fraud, abuse, and security threats.</Bullet>
                <Bullet>Comply with legal obligations.</Bullet>
              </Section>

              <Section title="4. Location Data">
                With your consent, we collect precise location data to:
                <Bullet>Help customers find nearby providers.</Bullet>
                <Bullet>Enable providers to set their service area and business location.</Bullet>
                <Bullet>Support navigation and route optimization.</Bullet>
                <Bullet>Assist with fraud prevention and platform security.</Bullet>
                You may disable location services at any time through your device settings, though some features may be limited.
              </Section>

              <Section title="5. Information Sharing">
                We do not sell your personal information. We may share information with:
                <Bullet><Bold>Other Users:</Bold> Customers see provider business profiles; providers see customer booking details necessary to perform the service.</Bullet>
                <Bullet><Bold>Service Providers:</Bold> Payment processors, cloud hosting providers, and analytics partners bound by confidentiality obligations.</Bullet>
                <Bullet><Bold>Legal Authorities:</Bold> When required by law, court order, or to protect our rights and safety.</Bullet>
              </Section>

              <Section title="6. Data Retention">
                We retain your information for as long as your account is active or as needed to provide services. Account deletion requests will be honored within 30 days, except where retention is required for legal, security, or fraud prevention purposes.
              </Section>

              <Section title="7. Security">
                We implement industry-standard security measures including encryption, access controls, and regular security audits. However, no method of transmission over the internet is 100% secure.
              </Section>

              <Section title="8. Your Rights">
                You have the right to:
                <Bullet>Access, correct, or delete your personal information.</Bullet>
                <Bullet>Withdraw consent for data processing (where applicable).</Bullet>
                <Bullet>Object to certain types of processing.</Bullet>
                <Bullet>Request a copy of your data in a portable format.</Bullet>
                Contact us at privacy@servicehub.ph to exercise these rights.
              </Section>

              <Section title="9. Children's Privacy">
                The Platform is not intended for individuals under 18. We do not knowingly collect data from children.
              </Section>

              <Section title="10. Changes to This Policy">
                We may update this Privacy Policy periodically. Significant changes will be notified through the Platform or via email.
              </Section>

              <Section title="11. Contact Us">
                For privacy-related questions, contact privacy@servicehub.ph.
              </Section>

              {/* Close button inside scroll so it never blocks content on small screens */}
              <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
              <View style={{ height: SPACING.lg }} />
            </ScrollView>
          </View>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionText}>{children}</Text>
    </View>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <Text style={styles.bullet}>
      {'\u2022'} {children}
    </Text>
  );
}

function Bold({ children }: { children: React.ReactNode }) {
  return <Text style={styles.bold}>{children}</Text>;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  safe: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    maxHeight: '92%',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    ...SHADOWS.large,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONTS.sizes.xl,
    fontFamily: FONTS.bold,
    color: COLORS.text,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  lastUpdated: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textLight,
    marginBottom: SPACING.md,
    fontFamily: FONTS.medium,
  },
  section: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  sectionText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  bullet: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginLeft: SPACING.sm,
    marginTop: 2,
  },
  bold: {
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
  },
  closeButton: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.semiBold,
    color: COLORS.white,
  },
});
