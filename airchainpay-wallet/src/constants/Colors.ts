/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

/**
 * App color themes and chain-specific colors
 * Supporting Core DAO and Base Network themes with animations
 */

export const ChainColors = {
  base: {
    primary: '#0052FF',    // Base blue
    secondary: '#627EEA',  // Ethereum blue
    accent: '#00D4FF',     // Light blue
    gradient: ['#0052FF', '#00D4FF'] as const,
  },
  core: {
    primary: '#00D4AA',    // Core green
    secondary: '#00FFD1',  // Light green
    accent: '#00D4FF',     // Light blue
    gradient: ['#00D4AA', '#00FFD1'] as const,
  },
  success: "#10B981",
  info: "#3B82F6",
  warning: "#F59E0B",
  error: "#EF4444",
} as const;

interface ThemeColors {
  text: string;
  background: string;
  tint: string;
  tabIconDefault: string;
  tabIconSelected: string;
  buttonPrimary: string;
  buttonSecondary: string;
  border: string;
  card?: string;
  chainColor: typeof ChainColors.base | typeof ChainColors.core;
  icon?: string;
}

export const Colors = {
  light: {
    text: '#000',
    background: '#fff',
    tint: ChainColors.base.primary,
    buttonPrimary: ChainColors.base.primary,
    tabIconSelected: ChainColors.base.primary,
    tabIconDefault: '#ccc',
    buttonSecondary: '#e5e7eb',
    border: '#e5e7eb',
    card: '#ffffff',
    chainColor: ChainColors.base,
    icon: '#64748B',
  } as ThemeColors,
  dark: {
    text: '#fff',
    background: '#000',
    tint: ChainColors.core.primary,
    buttonPrimary: ChainColors.core.primary,
    tabIconSelected: ChainColors.core.primary,
    tabIconDefault: '#666',
    buttonSecondary: '#1f2937',
    border: '#1f2937',
    card: '#1c1c1e',
    chainColor: ChainColors.core,
    icon: '#94A3B8',
  } as ThemeColors,
} as const;

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

export const getChainTheme = (chain: string, isDark: boolean = false): ThemeColors => {
  switch (chain) {
    case 'base_sepolia':
      return {
        text: isDark ? '#FFFFFF' : '#000000',
        background: isDark ? '#000000' : '#FFFFFF',
        tint: ChainColors.base.primary,
        buttonPrimary: ChainColors.base.primary,
        tabIconSelected: ChainColors.base.primary,
        tabIconDefault: isDark ? '#666666' : '#CCCCCC',
        buttonSecondary: isDark ? '#1A1A1A' : '#F5F5F5',
        border: isDark ? '#333333' : '#E5E5E5',
        chainColor: ChainColors.base,
        icon: isDark ? '#FFFFFF' : '#000000',
      };
    case 'core_testnet':
      return {
        text: isDark ? '#FFFFFF' : '#000000',
        background: isDark ? '#000000' : '#FFFFFF',
        tint: ChainColors.core.primary,
        buttonPrimary: ChainColors.core.primary,
        tabIconSelected: ChainColors.core.primary,
        tabIconDefault: isDark ? '#666666' : '#CCCCCC',
        buttonSecondary: isDark ? '#1A1A1A' : '#F5F5F5',
        border: isDark ? '#333333' : '#E5E5E5',
        chainColor: ChainColors.core,
        icon: isDark ? '#FFFFFF' : '#000000',
      };
    default:
      return isDark ? Colors.dark : Colors.light;
  }
};

export const getChainColor = (chain: string): string => {
  switch (chain) {
    case 'base_sepolia':
      return ChainColors.base.primary;
    case 'core_testnet':
      return ChainColors.core.primary;
    default:
      return ChainColors.base.primary;
  }
};

export const getChainGradient = (chain: string): readonly [string, string] => {
  switch (chain) {
    case 'base_sepolia':
      return ChainColors.base.gradient;
    case 'core_testnet':
      return ChainColors.core.gradient;
    default:
      return ChainColors.base.gradient;
  }
};

export const getBlueBlackGradient = (isDark: boolean): [string, string] => {
  return isDark ? ['#000000', '#0052FF'] : ['#FFFFFF', '#0052FF'];
};