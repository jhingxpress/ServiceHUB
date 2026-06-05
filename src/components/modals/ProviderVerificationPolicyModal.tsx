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
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

interface ProviderVerificationPolicyModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function ProviderVerificationPolicyModal({ visible, onClose }: ProviderVerificationPolicyModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.card} pointerEvents="box-none">
          <View style={styles.cardInner}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Provider Verification Policy</Text>
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

              <Section title="1. Purpose">
                ServiceHub is committed to maintaining a safe and trustworthy marketplace. The Provider Verification Policy ensures that all service providers on our platform are properly vetted, qualified, and accountable to our community of customers.
              </Section>

              <Section title="2. Verification Process">
                All provider applications go through a standardized review process:
                <Bullet>Document submission through the Provider Application form.</Bullet>
                <Bullet>Automated validation of uploaded documents for completeness and format.</Bullet>
                <Bullet>Manual review by our verification team within 1–3 business days.</Bullet>
                <Bullet>Background checks on submitted business information where applicable.</Bullet>
                <Bullet>Final approval or rejection decision communicated via in-app notification and email.</Bullet>
              </Section>

              <Section title="3. Required Documents">
                Providers must submit the following:
                <Bullet><Bold>Valid Government ID:</Bold> Front and back of a Philippine-issued ID (PhilSys, Driver's License, Passport, UMID, etc.).</Bullet>
                <Bullet><Bold>Business Verification (at least one):</Bold> Barangay Clearance, Business Permit, DTI Registration, BIR Certificate, TESDA Certificate, or Professional License.</Bullet>
                <Bullet><Bold>Selfie Verification:</Bold> A clear selfie holding the submitted government ID may be requested.</Bullet>
                <Bullet>All documents must be clear, legible, and unaltered. Expired documents will be rejected.</Bullet>
              </Section>

              <Section title="4. Approval Criteria">
                Applications are approved when:
                <Bullet>All required documents are submitted and verified as authentic.</Bullet>
                <Bullet>Business information is consistent across all documents.</Bullet>
                <Bullet>The provider has no history of fraud or platform violations.</Bullet>
                <Bullet>The service category matches the provider's qualifications.</Bullet>
                <Bullet>The provider agrees to comply with all Platform policies.</Bullet>
              </Section>

              <Section title="5. Rejection Criteria">
                Applications may be rejected if:
                <Bullet>Documents are falsified, altered, or illegible.</Bullet>
                <Bullet>Required documents are missing or incomplete.</Bullet>
                <Bullet>The applicant is under 18 years of age.</Bullet>
                <Bullet>The business operates in a prohibited category.</Bullet>
                <Bullet>The applicant has a banned or suspended account.</Bullet>
                <Bullet>Information provided is found to be fraudulent or deceptive.</Bullet>
              </Section>

              <Section title="6. Reapplication Process">
                If your application is rejected:
                <Bullet>You will receive a detailed rejection reason.</Bullet>
                <Bullet>You may correct the issues and resubmit your application.</Bullet>
                <Bullet>There is no limit to the number of reapplications.</Bullet>
                <Bullet>Repeated submissions with the same deficiencies may result in permanent disqualification.</Bullet>
              </Section>

              <Section title="7. Fraud Prevention">
                ServiceHub employs multiple fraud prevention measures:
                <Bullet>Document authenticity checks using visual inspection and cross-referencing.</Bullet>
                <Bullet>Duplicate account detection across email, phone, and device fingerprints.</Bullet>
                <Bullet>Random audits of approved providers.</Bullet>
                <Bullet>Collaboration with law enforcement for serious violations.</Bullet>
                <Bullet>Providers found submitting fraudulent documents will be permanently banned and may face legal action.</Bullet>
              </Section>

              <Section title="8. Document Review Process">
                <Bullet>Documents are reviewed by trained verification specialists.</Bullet>
                <Bullet>Personal data in documents is handled in accordance with our Privacy Policy.</Bullet>
                <Bullet>Documents are stored securely and never shared with customers or third parties.</Bullet>
                <Bullet>Documents may be re-verified periodically or upon reported concerns.</Bullet>
              </Section>

              <Section title="9. Ongoing Compliance">
                Approved providers must:
                <Bullet>Maintain current and valid permits and certifications.</Bullet>
                <Bullet>Update business information promptly when changes occur.</Bullet>
                <Bullet>Cooperate with periodic re-verification requests.</Bullet>
                <Bullet>Immediately report any lost or stolen credentials.</Bullet>
              </Section>

              <Section title="10. Policy Changes">
                This policy may be updated to reflect regulatory changes or platform improvements. Providers will be notified of material changes.
              </Section>

              <Section title="11. Contact">
                For verification-related inquiries, contact verification@servicehub.ph.
              </Section>
            </ScrollView>

            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxHeight: '90%',
    ...SHADOWS.large,
  },
  cardInner: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
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
