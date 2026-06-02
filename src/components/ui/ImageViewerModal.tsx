import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import ImageViewing from 'react-native-image-viewing';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';

interface ImageViewerModalProps {
  visible: boolean;
  imageUrl: string;
  onClose: () => void;
  title?: string;
}

export default function ImageViewerModal({
  visible,
  imageUrl,
  onClose,
  title,
}: ImageViewerModalProps) {
  const images = [{ uri: imageUrl }];

  return (
    <ImageViewing
      images={images}
      imageIndex={0}
      visible={visible}
      onRequestClose={onClose}
      swipeToCloseEnabled
      doubleTapToZoomEnabled
      HeaderComponent={() => (
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={COLORS.white} />
          </TouchableOpacity>
          {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : <View style={styles.titlePlaceholder} />}
          <View style={{ width: 44 }} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.white,
    fontFamily: FONTS.semiBold,
    fontSize: 15,
    marginHorizontal: 8,
  },
  titlePlaceholder: { flex: 1 },
});
