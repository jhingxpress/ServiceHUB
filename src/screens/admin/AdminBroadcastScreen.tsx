import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { AdminStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

type Audience = 'all_users' | 'all_providers' | 'all_customers' | 'admins_only';
type BroadcastType = 'announcement' | 'maintenance' | 'policy_update' | 'marketing';

const AUDIENCE_OPTIONS: { value: Audience; label: string; icon: string; desc: string }[] = [
  { value: 'all_users',      label: 'All Users',       icon: 'people-outline',        desc: 'Every registered user' },
  { value: 'all_customers',  label: 'Customers Only',  icon: 'person-outline',        desc: 'All customer accounts' },
  { value: 'all_providers',  label: 'Providers Only',  icon: 'briefcase-outline',     desc: 'All provider accounts' },
  { value: 'admins_only',    label: 'Admins Only',     icon: 'shield-checkmark-outline', desc: 'Internal admin test' },
];

const TYPE_OPTIONS: { value: BroadcastType; label: string; icon: string; color: string }[] = [
  { value: 'announcement',  label: 'Announcement',  icon: 'megaphone-outline',      color: COLORS.primary },
  { value: 'maintenance',   label: 'Maintenance',   icon: 'construct-outline',      color: COLORS.warning },
  { value: 'policy_update', label: 'Policy Update', icon: 'document-text-outline',  color: '#7C3AED' },
  { value: 'marketing',     label: 'Marketing',     icon: 'gift-outline',           color: '#EA580C' },
];

export default function AdminBroadcastScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('all_users');
  const [type, setType] = useState<BroadcastType>('announcement');
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);

  const handleBroadcast = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Required', 'Please fill in both title and message.');
      return;
    }

    Alert.alert(
      'Confirm Broadcast',
      `Send "${title}" to ${AUDIENCE_OPTIONS.find((a) => a.value === audience)?.label}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSending(true);
            setSentCount(null);

            // 1. Determine target user IDs
            let query = supabase.from('users').select('id');
            if (audience === 'all_customers') {
              query = query.eq('role', 'customer');
            } else if (audience === 'all_providers') {
              query = query.eq('role', 'provider');
            } else if (audience === 'admins_only') {
              query = query.eq('role', 'admin');
            }
            query = query.eq('is_active', true);

            const { data: recipients, error: recipientsErr } = await query;
            if (recipientsErr || !recipients) {
              Alert.alert('Error', recipientsErr?.message ?? 'Failed to fetch recipients');
              setSending(false);
              return;
            }

            // 2. Insert notification records for all recipients (DB trigger handles push delivery)
            const rows = recipients.map((u: { id: string }) => ({
              user_id: u.id,
              type,
              title: title.trim(),
              body: body.trim(),
              data: { broadcast: true, audience, sent_by: user?.id },
            }));

            // Insert in batches of 500
            const BATCH = 500;
            let insertedCount = 0;
            for (let i = 0; i < rows.length; i += BATCH) {
              const batch = rows.slice(i, i + BATCH);
              const { error: insertErr } = await supabase
                .from('notifications')
                .insert(batch);
              if (!insertErr) insertedCount += batch.length;
            }

            // 3. Log to moderation_log
            await supabase.from('moderation_log').insert({
              admin_id: user!.id,
              action: 'broadcast_notification',
              metadata: { title: title.trim(), body: body.trim(), audience, type, recipient_count: insertedCount },
            });

            setSentCount(insertedCount);
            setSending(false);
            setTitle('');
            setBody('');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Broadcast</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

          {sentCount !== null && (
            <View style={styles.successBanner}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
              <Text style={styles.successText}>Broadcast sent to {sentCount} user{sentCount !== 1 ? 's' : ''}!</Text>
            </View>
          )}

          {/* Notification Type */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Type</Text>
            <View style={styles.typeGrid}>
              {TYPE_OPTIONS.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.typeCard, type === t.value && { borderColor: t.color, backgroundColor: t.color + '12' }]}
                  onPress={() => setType(t.value)}
                >
                  <Ionicons name={t.icon as React.ComponentProps<typeof Ionicons>['name']} size={20} color={type === t.value ? t.color : COLORS.textLight} />
                  <Text style={[styles.typeLabel, type === t.value && { color: t.color, fontFamily: FONTS.semiBold }]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Audience */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Audience</Text>
            {AUDIENCE_OPTIONS.map((a) => (
              <TouchableOpacity
                key={a.value}
                style={[styles.audienceRow, audience === a.value && styles.audienceRowActive]}
                onPress={() => setAudience(a.value)}
              >
                <View style={[styles.audienceIconBox, audience === a.value && { backgroundColor: COLORS.primaryLight }]}>
                  <Ionicons
                    name={a.icon as React.ComponentProps<typeof Ionicons>['name']}
                    size={18}
                    color={audience === a.value ? COLORS.primary : COLORS.textLight}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.audienceLabel, audience === a.value && { color: COLORS.primary, fontFamily: FONTS.semiBold }]}>
                    {a.label}
                  </Text>
                  <Text style={styles.audienceDesc}>{a.desc}</Text>
                </View>
                {audience === a.value && (
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Title */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Notification Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Scheduled Maintenance"
              placeholderTextColor={COLORS.textLight}
              maxLength={100}
            />
            <Text style={styles.charCount}>{title.length}/100</Text>
          </View>

          {/* Body */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Message</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={body}
              onChangeText={setBody}
              placeholder="Write your message here..."
              placeholderTextColor={COLORS.textLight}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={styles.charCount}>{body.length}/500</Text>
          </View>

          {/* Preview */}
          {(title || body) ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Preview</Text>
              <View style={styles.previewCard}>
                <View style={styles.previewHeader}>
                  <Ionicons name="notifications" size={16} color={COLORS.primary} />
                  <Text style={styles.previewApp}>ServiceHub</Text>
                </View>
                <Text style={styles.previewTitle}>{title || 'Notification Title'}</Text>
                <Text style={styles.previewBody} numberOfLines={3}>{body || 'Your message will appear here.'}</Text>
              </View>
            </View>
          ) : null}

          {/* Send */}
          <TouchableOpacity
            style={[styles.sendBtn, (sending || !title.trim() || !body.trim()) && styles.sendBtnDisabled]}
            onPress={handleBroadcast}
            disabled={sending || !title.trim() || !body.trim()}
          >
            {sending ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <>
                <Ionicons name="send-outline" size={18} color={COLORS.white} />
                <Text style={styles.sendBtnText}>Send Broadcast</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  title: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold, color: COLORS.text },
  content: { padding: SPACING.md, gap: SPACING.md },
  successBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.successLight, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: '#BBF7D0',
  },
  successText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: '#065F46', flex: 1 },
  section: { gap: SPACING.sm },
  sectionLabel: {
    fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold,
    color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.7,
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  typeCard: {
    flex: 1, minWidth: '44%', flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1.5, borderColor: COLORS.border,
  },
  typeLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  audienceRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1.5, borderColor: COLORS.border,
  },
  audienceRowActive: { borderColor: COLORS.primary, backgroundColor: '#FFF5F5' },
  audienceIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center',
  },
  audienceLabel: { fontSize: FONTS.sizes.base, fontFamily: FONTS.medium, color: COLORS.text },
  audienceDesc: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 1 },
  input: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
    fontSize: FONTS.sizes.base, color: COLORS.text,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  charCount: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, textAlign: 'right' },
  previewCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.sm },
  previewApp: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.primary },
  previewTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: 4 },
  previewBody: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 18 },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.lg, ...SHADOWS.medium,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: COLORS.white },
});
