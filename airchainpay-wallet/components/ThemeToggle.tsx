import React from 'react';
import { TouchableOpacity, StyleSheet, View, Platform } from 'react-native';
import { ThemedText } from './ThemedText';
import { IconSymbol } from './ui/IconSymbol';
import { useThemeContext } from '../hooks/useThemeContext';

export function ThemeToggle() {
  const { colorScheme, toggleTheme } = useThemeContext();
  const isDark = colorScheme === 'dark';

  return (
    <TouchableOpacity 
      onPress={toggleTheme}
      activeOpacity={0.7}
      style={[
        styles.container, 
        { backgroundColor: isDark ? '#3a3a3c' : '#f2f2f7' }
      ]}
    >
      <View style={styles.toggleWrapper}>
        <IconSymbol 
          name={isDark ? "sun.max.fill" : "moon.fill"}
          size={22} 
          color={isDark ? '#ffcc00' : '#6e6e6e'} 
        />
        <ThemedText style={styles.toggleText}>
          {isDark ? 'Light' : 'Dark'}
        </ThemedText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    margin: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  toggleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  }
}); 