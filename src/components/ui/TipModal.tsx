import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

interface TipModalProps {
  visible: boolean;
  onDismiss: () => void;
}

const PRESET_AMOUNTS = [50, 100, 200];
const MIN_AMOUNT = 20;
const MAX_AMOUNT = 10_000;

type ModalState = 'prompt' | 'loading' | 'success';

export default function TipModal({ visible, onDismiss }: TipModalProps) {
  const [state, setState] = useState<ModalState>('prompt');
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  const reset = () => {
    setState('prompt');
    setSelectedAmount(null);
    setCustomInput('');
    setIsCustom(false);
  };

  const handleDismiss = () => {
    reset();
    onDismiss();
  };

  const getEffectiveAmount = (): number | null => {
    if (isCustom) {
      const v = parseInt(customInput, 10);
      return Number.isFinite(v) ? v : null;
    }
    return selectedAmount;
  };

  const validateAmount = (amount: number | null): string | null => {
    if (amount === null || !Number.isFinite(amount)) return 'Please enter an amount.';
    if (amount < MIN_AMOUNT) return `Minimum tip is ₱${MIN_AMOUNT}.`;
    if (amount > MAX_AMOUNT) return `Maximum tip is ₱${MAX_AMOUNT.toLocaleString()}.`;
    return null;
  };

  const handleTip = async () => {
    const amount = getEffectiveAmount();
    const err = validateAmount(amount);
    if (err) {
      Alert.alert('Invalid Amount', err);
      return;
    }

    setState('loading');
    try {
      const { data, error } = await supabase.functions.invoke('create-servicehub-tip-checkout', {
        body: { amount_pesos: amount },
      });
      if (error || !data?.checkout_url) {
        throw new Error(error?.message ?? 'Failed to create checkout');
      }
      await Linking.openURL(data.checkout_url);
      setState('success');
    } catch (invokeErr: any) {
      setState('prompt');
      Alert.alert('Error', invokeErr?.message ?? 'Could not open checkout. Please try again.');
    }
  };

  const handleSelectPreset = (amt: number) => {
    setIsCustom(false);
    setCustomInput('');
    setSelectedAmount(amt);
  };

  const handleSelectCustom = () => {
    setIsCustom(true);
    setSelectedAmount(null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          {state === 'success' ? (
            <SuccessView onDone={handleDismiss} />
          ) : (
            <PromptView
              state={state}
              selectedAmount={selectedAmount}
              isCustom={isCustom}
              customInput={customInput}
              onSetCustomInput={setCustomInput}
              onSelectPreset={handleSelectPreset}
              onSelectCustom={handleSelectCustom}
              onTip={handleTip}
              onDismiss={handleDismiss}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PromptView({
  state,
  selectedAmount,
  isCustom,
  customInput,
  onSetCustomInput,
  onSelectPreset,
  onSelectCustom,
  onTip,
  onDismiss,
}: {
  state: ModalState;
  selectedAmount: number | null;
  isCustom: boolean;
  customInput: string;
  onSetCustomInput: (v: string) => void;
  onSelectPreset: (amt: number) => void;
  onSelectCustom: () => void;
  onTip: () => void;
  onDismiss: () => void;
}) {
  const hasSelection = isCustom ? customInput.trim().length > 0 : selectedAmount !== null;

  return (
    <>
      <View style={styles.handleBar} />

      <View style={styles.iconWrap}>
        <Text style={styles.heartIcon}>❤️</Text>
      </View>

      <Text style={styles.heading}>Support ServiceHub</Text>
      <Text style={styles.subText}>
        Thank you for using ServiceHub.{'\n'}
        Your optional tip helps us maintain servers, improve security, and continue building new features for local communities.{'\n\n'}
        Every contribution helps.
      </Text>

      <View style={styles.presetRow}>
        {[50, 100, 200].map((amt) => (
          <TouchableOpacity
            key={amt}
            style={[styles.presetBtn, selectedAmount === amt && !isCustom && styles.presetBtnActive]}
            onPress={() => onSelectPreset(amt)}
            activeOpacity={0.8}
          >
            <Text style={[styles.presetText, selectedAmount === amt && !isCustom && styles.presetTextActive]}>
              ₱{amt}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.presetBtn, isCustom && styles.presetBtnActive]}
          onPress={onSelectCustom}
          activeOpacity={0.8}
        >
          <Text style={[styles.presetText, isCustom && styles.presetTextActive]}>Custom</Text>
        </TouchableOpacity>
      </View>

      {isCustom && (
        <View style={styles.customRow}>
          <Text style={styles.currencyLabel}>₱</Text>
          <TextInput
            style={styles.customInput}
            placeholder={`${MIN_AMOUNT} – ${MAX_AMOUNT.toLocaleString()}`}
            placeholderTextColor={COLORS.textLight}
            value={customInput}
            onChangeText={(v) => onSetCustomInput(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={5}
            autoFocus
          />
        </View>
      )}

      <TouchableOpacity
        style={[styles.tipBtn, !hasSelection && styles.tipBtnDisabled]}
        onPress={onTip}
        disabled={state === 'loading' || !hasSelection}
        activeOpacity={0.85}
      >
        {state === 'loading' ? (
          <ActivityIndicator color={COLORS.white} size="small" />
        ) : (
          <Text style={styles.tipBtnText}>
            {hasSelection
              ? `Send ₱${isCustom ? customInput : selectedAmount} Tip`
              : 'Select an Amount'}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.notNowBtn} onPress={onDismiss} activeOpacity={0.7}>
        <Text style={styles.notNowText}>Not Now</Text>
      </TouchableOpacity>
    </>
  );
}

function SuccessView({ onDone }: { onDone: () => void }) {
  return (
    <View style={styles.successWrap}>
      <View style={styles.handleBar} />
      <Text style={styles.heartIcon}>❤️</Text>
      <Text style={styles.heading}>Thank You!</Text>
      <Text style={styles.subText}>
        Thank you for supporting ServiceHub.{'\n'}
        Your contribution helps us continue improving the platform for everyone.
      </Text>
      <TouchableOpacity style={styles.tipBtn} onPress={onDone} activeOpacity={0.85}>
        <Text style={styles.tipBtnText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl ?? SPACING.xl,
    ...SHADOWS.large ?? SHADOWS.medium,
  },
  handleBar: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.md,
  },
  iconWrap: { alignItems: 'center', marginBottom: SPACING.sm },
  heartIcon: { fontSize: 40 },
  heading: {
    fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold,
    color: COLORS.text, textAlign: 'center', marginBottom: SPACING.sm,
  },
  subText: {
    fontSize: FONTS.sizes.sm, color: COLORS.textSecondary,
    textAlign: 'center', lineHeight: 20, marginBottom: SPACING.lg,
  },
  presetRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    gap: SPACING.sm, marginBottom: SPACING.md,
  },
  presetBtn: {
    flex: 1, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center',
  },
  presetBtnActive: { borderColor: '#E11D48', backgroundColor: '#FFF1F2' },
  presetText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.textSecondary },
  presetTextActive: { color: '#E11D48' },
  customRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5, borderColor: '#E11D48', padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  currencyLabel: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
  customInput: {
    flex: 1, fontSize: FONTS.sizes.xl, fontFamily: FONTS.semiBold, color: COLORS.text,
  },
  tipBtn: {
    backgroundColor: '#E11D48', borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md, alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  tipBtnDisabled: { backgroundColor: COLORS.border },
  tipBtnText: { color: COLORS.white, fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold },
  notNowBtn: { alignItems: 'center', paddingVertical: SPACING.sm },
  notNowText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  successWrap: { alignItems: 'center' },
});
