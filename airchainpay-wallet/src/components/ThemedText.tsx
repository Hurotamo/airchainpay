import React from 'react';
import { Text, TextProps } from 'react-native';
import { useThemeColor } from '../hooks/useThemeContext';

interface ThemedTextProps extends TextProps {
  lightColor?: string;
  darkColor?: string;
}

export function ThemedText(props: ThemedTextProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return <Text style={[{ color }, style]} {...otherProps} />;
} 