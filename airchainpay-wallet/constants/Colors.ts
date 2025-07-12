/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

/**
 * Multi-chain themed colors for AirChainPay
 * Supporting Core DAO and Base Network themes with animations
 * Enhanced with blue and black mix theme
 */

// Chain-specific brand colors with blue-black enhancement
export const ChainColors = {
  core: {
    primary: '#FF6B35',    // Core DAO orange
    secondary: '#FF8A50',  // Lighter orange
    accent: '#FFB366',     // Accent orange
    gradient: ['#000000', '#FF6B35', '#FF8A50'], // Orange with black
    dark: '#CC5429',       // Darker orange
  },
  base: {
    primary: '#0052FF',    // Base blue
    secondary: '#1E6FFF',  // Lighter blue
    accent: '#4A90FF',     // Accent blue
    gradient: ['#000000', '#0F1419', '#0052FF'], // Blue-black gradient
    dark: '#003DB8',       // Darker blue
  },
  success: '#00D4AA',      // Teal green
  warning: '#FFB800',      // Amber
  error: '#FF4757',        // Red
  info: '#3742FA',         // Blue
  // New blue-black theme colors
  blueBlack: {
    primary: '#0052FF',
    secondary: '#1E6FFF',
    accent: '#4A90FF',
    gradient: ['#000000', '#0F1419', '#0052FF'],
    gradientReverse: ['#0052FF', '#0F1419', '#000000'],
    dark: '#000000',
    darkBlue: '#0F1419',
    mediumBlue: '#1E2A3A',
    lightBlue: '#2A3F5F',
  }
};

const tintColorLight = '#0052FF';  // Base blue as default
const tintColorDark = '#4A90FF';   // Lighter blue for dark mode

export const Colors = {
  light: {
    text: '#FFFFFF',           // White text for blue-black theme
    background: '#0F1419',     // Dark blue-black background
    backgroundSecondary: '#1E2A3A', // Slightly lighter blue-black
    tint: tintColorLight,
    icon: '#94A3B8',
    tabIconDefault: '#64748B',
    tabIconSelected: tintColorLight,
    card: '#1E2A3A',           // Dark blue card background
    cardSecondary: '#2A3F5F',  // Medium blue card
    border: '#374151',         // Blue-gray border
    borderLight: '#4B5563',    // Lighter blue-gray border
    success: ChainColors.success,
    error: ChainColors.error,
    warning: ChainColors.warning,
    info: ChainColors.info,
    buttonPrimary: tintColorLight,
    buttonSecondary: '#64748B',
    buttonSuccess: ChainColors.success,
    buttonWarning: ChainColors.warning,
    buttonError: ChainColors.error,
    inputBackground: '#2A3F5F', // Medium blue input background
    inputBorder: '#4B5563',     // Blue-gray input border
    modalBackground: 'rgba(0, 0, 0, 0.8)',
    overlay: 'rgba(0, 0, 0, 0.3)',
    shadow: 'rgba(0, 0, 0, 0.3)',
    shadowDark: 'rgba(0, 0, 0, 0.5)',
    // Chain-specific colors
    core: ChainColors.core,
    base: ChainColors.base,
    // Gradient backgrounds with blue-black mix
    gradientPrimary: ['#000000', '#0052FF'],
    gradientSecondary: ['#0F1419', '#1E2A3A'],
    gradientCard: ['#1E2A3A', '#2A3F5F'],
  },
  dark: {
    text: '#F8FAFC',
    background: '#000000',     // Pure black background
    backgroundSecondary: '#0F1419', // Very dark blue
    tint: tintColorDark,
    icon: '#94A3B8',
    tabIconDefault: '#64748B',
    tabIconSelected: tintColorDark,
    card: '#0F1419',           // Very dark blue card
    cardSecondary: '#1E2A3A',  // Dark blue card
    border: '#374151',
    borderLight: '#4B5563',
    success: ChainColors.success,
    error: ChainColors.error,
    warning: ChainColors.warning,
    info: ChainColors.info,
    buttonPrimary: tintColorDark,
    buttonSecondary: '#64748B',
    buttonSuccess: ChainColors.success,
    buttonWarning: ChainColors.warning,
    buttonError: ChainColors.error,
    inputBackground: '#1E2A3A',
    inputBorder: '#4B5563',
    modalBackground: 'rgba(0, 0, 0, 0.9)',
    overlay: 'rgba(0, 0, 0, 0.4)',
    shadow: 'rgba(0, 0, 0, 0.4)',
    shadowDark: 'rgba(0, 0, 0, 0.6)',
    // Chain-specific colors
    core: ChainColors.core,
    base: ChainColors.base,
    // Gradient backgrounds with deeper blue-black mix
    gradientPrimary: ['#000000', '#4A90FF'],
    gradientSecondary: ['#000000', '#0F1419'],
    gradientCard: ['#0F1419', '#1E2A3A'],
  },
};

// Animation configurations
export const Animations = {
  timing: {
    fast: 200,
    normal: 300,
    slow: 500,
    verySlow: 800,
  },
  easing: {
    ease: 'ease',
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
  spring: {
    tension: 100,
    friction: 8,
  },
};

// Chain-specific theme utilities with blue-black enhancements
export const getChainTheme = (chainId: string, isDark = false) => {
  const baseTheme = isDark ? Colors.dark : Colors.light;
  
  switch (chainId) {
    case 'core_testnet':
    case 'core-testnet':
      return {
        ...baseTheme,
        tint: ChainColors.core.primary,
        buttonPrimary: ChainColors.core.primary,
        tabIconSelected: ChainColors.core.primary,
        gradient: ['#000000', '#FF6B35', '#FF8A50'], // Orange with black
        chainColor: ChainColors.core,
      };
    case 'base_sepolia':
    case 'base-sepolia':
      return {
        ...baseTheme,
        tint: ChainColors.base.primary,
        buttonPrimary: ChainColors.base.primary,
        tabIconSelected: ChainColors.base.primary,
        gradient: ChainColors.blueBlack.gradient, // Blue-black gradient
        chainColor: ChainColors.base,
      };
    default:
      return {
        ...baseTheme,
        gradient: ChainColors.blueBlack.gradient,
        chainColor: ChainColors.base,
      };
  }
};

// Utility function to get chain brand color
export const getChainColor = (chainId: string) => {
  switch (chainId) {
    case 'core_testnet':
    case 'core-testnet':
      return ChainColors.core.primary;
    case 'base_sepolia':
    case 'base-sepolia':
      return ChainColors.base.primary;
    default:
      return ChainColors.base.primary;
  }
};

// Utility function to get chain gradient with blue-black mix
export const getChainGradient = (chainId: string) => {
  switch (chainId) {
    case 'core_testnet':
    case 'core-testnet':
      return ['#000000', '#FF6B35', '#FF8A50']; // Orange with black
    case 'base_sepolia':
    case 'base-sepolia':
      return ChainColors.blueBlack.gradient; // Blue-black gradient
    default:
      return ChainColors.blueBlack.gradient;
  }
};

// New utility for blue-black specific gradients
export const getBlueBlackGradient = (variant: 'primary' | 'secondary' | 'reverse' = 'primary') => {
  switch (variant) {
    case 'primary':
      return ChainColors.blueBlack.gradient;
    case 'secondary':
      return ['#0F1419', '#1E2A3A', '#2A3F5F'];
    case 'reverse':
      return ChainColors.blueBlack.gradientReverse;
    default:
      return ChainColors.blueBlack.gradient;
  }
};