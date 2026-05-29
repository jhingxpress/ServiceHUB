import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AuthStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING } from '../../constants/theme';

const { width } = Dimensions.get('window');

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Splash'>;
};

export default function SplashScreen({ navigation }: Props) {
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 60,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      navigation.replace('Login');
    }, 2800);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.bgCircleTop} />
      <View style={styles.bgCircleBottom} />

      <View style={styles.content}>
        <Animated.View
          style={[
            styles.logoWrapper,
            { transform: [{ scale: logoScale }], opacity: logoOpacity },
          ]}
        >
          <View style={styles.logoCircle}>
            <Ionicons name="construct" size={48} color={COLORS.white} />
          </View>
        </Animated.View>

        <Animated.Text style={[styles.appName, { opacity: textOpacity }]}>
          ServiceHub
        </Animated.Text>

        <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
          Your trusted local services marketplace
        </Animated.Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Connecting communities</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bgCircleTop: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  bgCircleBottom: {
    position: 'absolute',
    bottom: -100,
    left: -60,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  content: {
    alignItems: 'center',
  },
  logoWrapper: {
    marginBottom: SPACING.lg,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  appName: {
    fontSize: FONTS.sizes.display,
    fontFamily: FONTS.bold,
    color: COLORS.white,
    letterSpacing: -0.5,
    marginBottom: SPACING.sm,
  },
  tagline: {
    fontSize: FONTS.sizes.base,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    maxWidth: width * 0.65,
  },
  footer: {
    position: 'absolute',
    bottom: SPACING.xl,
  },
  footerText: {
    fontSize: FONTS.sizes.sm,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
  },
});
