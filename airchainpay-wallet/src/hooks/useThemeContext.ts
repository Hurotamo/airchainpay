import { useColorScheme } from 'react-native';

interface ThemeProps {
  light?: string;
  dark?: string;
}

type ColorName = 'text' | 'background' | 'tint' | 'tabIconDefault' | 'tabIconSelected';

export function useThemeColor(
  props: ThemeProps,
  colorName: ColorName
): string {
  const theme = useColorScheme() || 'light';
  
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  }

  const colors = {
    light: {
      text: '#000',
      background: '#fff',
      tint: '#2196F3',
      tabIconDefault: '#ccc',
      tabIconSelected: '#2196F3',
    },
    dark: {
      text: '#fff',
      background: '#000',
      tint: '#4dabf5',
      tabIconDefault: '#666',
      tabIconSelected: '#4dabf5',
    },
  };

  return colors[theme][colorName];
}

export function useThemeContext() {
  const colorScheme = useColorScheme();
  return { colorScheme };
} 