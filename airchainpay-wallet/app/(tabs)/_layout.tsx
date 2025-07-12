import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { HapticTab } from '../../components/HapticTab';
import { IconSymbol } from '../../components/ui/IconSymbol';
import { getChainColor, getChainGradient } from '../../constants/Colors';
import { useSelectedChain } from '../../src/components/ChainSelector';
import { useAuthState } from '../../src/hooks/useAuthState';

export default function TabLayout() {
  const { selectedChain } = useSelectedChain();
  const { isAuthenticated } = useAuthState();
  const chainColor = getChainColor(selectedChain);
  const chainGradient = getChainGradient(selectedChain);

  const screenOptions = {
    tabBarActiveTintColor: chainColor,
    tabBarInactiveTintColor: '#94A3B8',
    headerShown: true,
    tabBarButton: HapticTab,
    headerStyle: {
      backgroundColor: 'transparent',
    },
    headerBackground: () => (
      <LinearGradient
        colors={chainGradient as any}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
    ),
    headerTintColor: 'white',
    headerTitleStyle: {
      fontWeight: 'bold' as const,
      fontSize: 18,
    },
    headerRight: () => (
      <View style={styles.headerRight}>
        {/* Theme toggle removed */}
      </View>
    ),
    headerTitle: () => (
      <View style={styles.headerContainer}>
        <IconSymbol name="wallet.pass.fill" size={24} color={chainColor} style={{ marginRight: 8 }} />
        {/* You can replace the above IconSymbol with an Image for a custom logo if desired */}
      </View>
    ),
    tabBarStyle: Platform.select({
      ios: {
        position: 'absolute' as const,
        backgroundColor: 'rgba(15, 20, 25, 0.98)',
        borderTopColor: 'rgba(148, 163, 184, 0.3)',
        borderTopWidth: 1,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        paddingTop: 8,
        paddingBottom: 38,
        height: 92,
      },
      default: {
        backgroundColor: 'rgba(15, 20, 25, 0.98)',
        borderTopColor: 'rgba(148, 163, 184, 0.3)',
        borderTopWidth: 1,
        elevation: 8,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        paddingTop: 8,
        paddingBottom: 12,
        height: 74,
      },
    }),
    tabBarLabelStyle: {
      fontSize: 10,
      fontWeight: '600' as const,
      marginBottom: Platform.OS === 'ios' ? 2 : 4,
      marginTop: Platform.OS === 'ios' ? 2 : 1,
      color: '#FFFFFF',
    },
    tabBarIconStyle: {
      marginTop: Platform.OS === 'ios' ? 0 : 4,
      marginBottom: Platform.OS === 'ios' ? 2 : 0,
    },
  };

  // If not authenticated, don't show any tabs
  if (!isAuthenticated) {
    return null;
  }

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color, focused }) => (
            <View style={[
              styles.iconContainer, 
              focused && { backgroundColor: chainColor + '20', borderColor: chainColor + '40' }
            ]}>
              <IconSymbol 
                size={26} 
                name="wallet.pass.fill" 
                color={focused ? chainColor : '#E2E8F0'}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="tx-history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, focused }) => (
            <View style={[
              styles.iconContainer, 
              focused && { backgroundColor: chainColor + '20', borderColor: chainColor + '40' }
            ]}>
              <IconSymbol 
                size={26} 
                name="list.bullet.clipboard.fill" 
                color={focused ? chainColor : '#E2E8F0'}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="ble-payment"
        options={{
          title: 'BLE',
          tabBarIcon: ({ color, focused }) => (
            <View style={[
              styles.iconContainer, 
              focused && { backgroundColor: chainColor + '20', borderColor: chainColor + '40' }
            ]}>
              <IconSymbol 
                size={26} 
                name="dot.radiowaves.left.and.right" 
                color={focused ? chainColor : '#E2E8F0'}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <View style={[
              styles.iconContainer, 
              focused && { backgroundColor: chainColor + '20', borderColor: chainColor + '40' }
            ]}>
              <IconSymbol 
                size={26} 
                name="gear" 
                color={focused ? chainColor : '#E2E8F0'}
              />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    marginRight: 16,
  },
  logo: {
    width: 140,
    height: 36,
    tintColor: 'white',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
  },
});
