import React, { useEffect, useRef } from 'react';
import {
  Animated,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
  Easing,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, getChainGradient, getChainColor, Animations } from '../constants/Colors';
import { useThemeContext } from '../hooks/useThemeContext';



interface AnimatedCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  chainId?: string;
  delay?: number;
  onPress?: () => void;
}

export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  style,
  chainId,
  delay = 0,
  onPress,
}) => {
  const { colorScheme } = useThemeContext();
  const theme = colorScheme || 'light';
  const colors = Colors[theme];
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const translateYAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    const animateIn = () => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: Animations.timing.slow,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: Animations.timing.slow,
          delay,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
        Animated.timing(translateYAnim, {
          toValue: 0,
          duration: Animations.timing.slow,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    };

    animateIn();
  }, [fadeAnim, scaleAnim, translateYAnim, delay]);

  const animatedStyle = {
    opacity: fadeAnim,
    transform: [
      { scale: scaleAnim },
      { translateY: translateYAnim },
    ],
  };

  const cardStyle = [
    styles.animatedCard,
    {
      backgroundColor: colors.card,
      shadowColor: colors.shadow,
      borderColor: chainId ? getChainColor(chainId) + '20' : colors.border,
    },
    style,
  ];

  if (onPress) {
    return (
      <Animated.View style={animatedStyle}>
        <TouchableOpacity
          style={cardStyle}
          onPress={onPress}
          activeOpacity={0.9}
        >
          {children}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[animatedStyle, cardStyle]}>
      {children}
    </Animated.View>
  );
};

interface AnimatedGradientCardProps {
  children: React.ReactNode;
  chainId: string;
  style?: ViewStyle;
  delay?: number;
  onPress?: () => void;
}

export const AnimatedGradientCard: React.FC<AnimatedGradientCardProps> = ({
  children,
  chainId,
  style,
  delay = 0,
  onPress,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateIn = () => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: Animations.timing.verySlow,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          delay,
          tension: Animations.spring.tension,
          friction: Animations.spring.friction,
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: Animations.timing.verySlow,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    };

    animateIn();
  }, [fadeAnim, scaleAnim, rotateAnim, delay]);

  const animatedStyle = {
    opacity: fadeAnim,
    transform: [
      { scale: scaleAnim },
      {
        rotate: rotateAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['5deg', '0deg'],
        }),
      },
    ],
  };

  const gradient = getChainGradient(chainId);

  const CardComponent = onPress ? TouchableOpacity : View;
  const cardProps = onPress ? { onPress, activeOpacity: 0.95 } : {};

  return (
    <Animated.View style={animatedStyle}>
      <LinearGradient
        colors={gradient as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradientCard, style]}
      >
        <CardComponent {...cardProps} style={styles.gradientCardContent}>
          {children}
        </CardComponent>
      </LinearGradient>
    </Animated.View>
  );
};

interface AnimatedButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  chainId?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
}

export const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  chainId,
  style,
  textStyle,
  icon,
  loading = false,
  disabled = false,
}) => {
  const { colorScheme } = useThemeContext();
  const theme = colorScheme || 'light';
  const colors = Colors[theme];
  
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const loadingAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.timing(loadingAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      loadingAnim.setValue(0);
    }
  }, [loading, loadingAnim]);

  useEffect(() => {
    // Subtle glow animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [glowAnim]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const getButtonColor = () => {
    if (disabled) return colors.buttonSecondary;
    if (chainId) return getChainColor(chainId);
    
    switch (variant) {
      case 'success': return colors.buttonSuccess;
      case 'warning': return colors.buttonWarning;
      case 'error': return colors.buttonError;
      case 'secondary': return colors.buttonSecondary;
      default: return colors.buttonPrimary;
    }
  };

  const buttonStyle = [
    styles.animatedButton,
    {
      backgroundColor: getButtonColor(),
      opacity: disabled ? 0.5 : 1,
    },
    style,
  ];

  const animatedStyle = {
    transform: [{ scale: scaleAnim }],
    opacity: glowAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.9, 1],
    }),
  };

  const loadingRotation = loadingAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={animatedStyle}>
      <TouchableOpacity
        style={buttonStyle}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={0.8}
      >
        <View style={styles.buttonContent}>
          {loading ? (
            <Animated.View style={{ transform: [{ rotate: loadingRotation }] }}>
              <Ionicons name="refresh" size={20} color="white" />
            </Animated.View>
          ) : (
            icon && <Ionicons name={icon} size={20} color="white" style={styles.buttonIcon} />
          )}
          <Text style={[styles.buttonText, textStyle]}>
            {loading ? 'Loading...' : title}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

interface PulsingDotProps {
  color?: string;
  size?: number;
  delay?: number;
}

export const PulsingDot: React.FC<PulsingDotProps> = ({
  color = '#00D4AA',
  size = 8,
  delay = 0,
}) => {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            delay,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 1000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    pulse();
  }, [pulseAnim, delay]);

  const animatedStyle = {
    opacity: pulseAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 1],
    }),
    transform: [
      {
        scale: pulseAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.8, 1.2],
        }),
      },
    ],
  };

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
};

interface FloatingActionButtonProps {
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  chainId?: string;
  style?: ViewStyle;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  onPress,
  icon,
  chainId,
  style,
}) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        delay: 500,
        tension: Animations.spring.tension,
        friction: Animations.spring.friction,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: Animations.timing.verySlow,
        delay: 500,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim, rotateAnim]);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 300,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();
    
    onPress();
  };

  const animatedStyle = {
    transform: [
      { scale: scaleAnim },
      {
        rotate: rotateAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['45deg', '0deg'],
        }),
      },
    ],
  };

  const backgroundColor = chainId ? getChainColor(chainId) : Colors.light.buttonPrimary;

  return (
    <Animated.View style={[styles.fab, { backgroundColor }, style, animatedStyle]}>
      <TouchableOpacity
        style={styles.fabButton}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <Ionicons name={icon} size={24} color="white" />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  animatedCard: {
    padding: 16,
    borderRadius: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
  },
  gradientCard: {
    borderRadius: 20,
    margin: 16,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  gradientCardContent: {
    padding: 20,
    borderRadius: 20,
  },
  animatedButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginVertical: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  fabButton: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
}); 