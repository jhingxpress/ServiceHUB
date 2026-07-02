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

interface TermsOfServiceModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function TermsOfServiceModal({ visible, onClose }: TermsOfServiceModalProps) {
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
              <Text style={styles.title}>Terms of Service</Text>
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
                Welcome to TAGA, a marketplace platform connecting customers with independent service providers. By accessing or using the TAGA mobile application or website, you agree to be bound by these Terms of Service.
              </Section>

              <Section title="2. Definitions">
                <Bullet>"Platform" refers to the TAGA mobile application and related services.</Bullet>
                <Bullet>"Customer" means a user who books services through the Platform.</Bullet>
                <Bullet>"Provider" means an independent service provider who offers services through the Platform.</Bullet>
                <Bullet>"User" refers to any individual who accesses or uses the Platform, including both Customers and Providers.</Bullet>
              </Section>

              <Section title="3. Eligibility">
                You must be at least 18 years old to use the Platform. By registering, you represent and warrant that you meet this requirement and that all information you provide is accurate and complete.
              </Section>

              <Section title="4. Account Registration & Security">
                You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized use of your account. TAGA is not liable for any loss or damage arising from your failure to safeguard your account.
              </Section>

              <Section title="5. Service Description">
                TAGA facilitates connections between Customers and Providers. We do not provide the services listed on the Platform. Providers are independent contractors, not employees or agents of TAGA.
              </Section>

              <Section title="6. Provider Obligations">
                Providers agree to:
                <Bullet>Provide accurate business and identification information.</Bullet>
                <Bullet>Deliver services in a professional and timely manner.</Bullet>
                <Bullet>Comply with all applicable laws and regulations.</Bullet>
                <Bullet>Maintain appropriate licenses, permits, and insurance.</Bullet>
                <Bullet>Not engage in fraudulent, deceptive, or illegal activities.</Bullet>
              </Section>

              <Section title="7. Customer Obligations">
                Customers agree to:
                <Bullet>Provide accurate booking information.</Bullet>
                <Bullet>Pay for services as agreed with the Provider.</Bullet>
                <Bullet>Treat Providers with respect and professionalism.</Bullet>
                <Bullet>Not use the Platform for unlawful purposes.</Bullet>
              </Section>

              <Section title="8. Reviews & Content">
                Users may submit reviews and photos. By submitting content, you grant TAGA a non-exclusive, royalty-free license to use, display, and distribute that content on the Platform. You are solely responsible for the content you submit.
              </Section>

              <Section title="9. Prohibited Activities">
                Users may not:
                <Bullet>Submit false or misleading information.</Bullet>
                <Bullet>Harass, abuse, or discriminate against other users.</Bullet>
                <Bullet>Circumvent the Platform to avoid fees.</Bullet>
                <Bullet>Use bots, scrapers, or automated systems.</Bullet>
                <Bullet>Upload malicious software or harmful content.</Bullet>
              </Section>

              <Section title="10. Termination">
                TAGA reserves the right to suspend or terminate any account that violates these Terms. Users may delete their account at any time by contacting support.
              </Section>

              <Section title="11. Limitation of Liability">
                TAGA is not liable for disputes between Customers and Providers. We do not guarantee the quality, safety, or legality of services provided. Users assume all risks associated with using the Platform.
              </Section>

              <Section title="12. Changes to Terms">
                We may update these Terms at any time. Material changes will be communicated through the Platform. Continued use constitutes acceptance of the updated Terms.
              </Section>

              <Section title="13. Contact">
                For questions about these Terms, contact support@taga.ph.
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
