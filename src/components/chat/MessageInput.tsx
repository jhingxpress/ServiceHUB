import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../../constants/theme';

interface MessageInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
}

export default function MessageInput({
  value,
  onChangeText,
  onSend,
  disabled = false,
  sending = false,
  placeholder = 'Type a message...',
}: MessageInputProps) {
  const [height, setHeight] = useState(40);

  const handleSend = () => {
    Keyboard.dismiss();
    onSend();
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.input, { height: Math.max(40, height) }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textLight}
        multiline
        returnKeyType="default"
        onContentSizeChange={(e) => setHeight(e.nativeEvent.contentSize.height)}
        maxLength={1000}
        editable={!disabled}
      />
      <TouchableOpacity
        style={[styles.sendBtn, (!value.trim() || sending || disabled) && styles.sendBtnDisabled]}
        onPress={handleSend}
        disabled={!value.trim() || sending || disabled}
      >
        {sending ? (
          <Ionicons name="hourglass-outline" size={18} color={COLORS.white} />
        ) : (
          <Ionicons name="send" size={18} color={COLORS.white} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.sm,
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 4,
    fontSize: 16,
    color: COLORS.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});
