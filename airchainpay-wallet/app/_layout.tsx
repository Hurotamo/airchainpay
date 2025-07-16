// Import polyfills first before anything else
import '../src/polyfills';

import { useEffect, useState, useCallback } from 'react';
import { Platform, ActivityIndicator, View, Alert } from 'react-native';
import { initializeCameraModule } from '../src/utils/CameraModule';

import { StatusBar } from 'expo-status-bar';
// Import AsyncStorage with a fallback mechanism
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { FontAwesome } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import NetInfo from '@react-native-community/netinfo';

import { useColorScheme } from '../hooks/useColorScheme';
import { ThemeContext } from '../hooks/useThemeContext';
import WalletSetupScreen from '../src/components/WalletSetupScreen';
import { useAuthState } from '../src/hooks/useAuthState';
import { PaymentService } from '../src/services/PaymentService';

// Create a fallback storage if AsyncStorage fails
const safeStorage = {
  getItem: async (key: string) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.warn('AsyncStorage getItem error:', error);
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await AsyncStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn('AsyncStorage setItem error:', error);
      return false;
    }
  }
};

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const systemColorScheme = useColorScheme();
  const [userColorScheme, setUserColorScheme] = useState<'light' | 'dark' | null>(null);
  
  // Font loading with error handling
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Use the new authentication hook
  const { hasWallet, isAuthenticated, isLoading: authLoading, refreshAuthState } = useAuthState();

  // Load saved theme preference
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const savedTheme = await safeStorage.getItem('user-theme');
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setUserColorScheme(savedTheme);
        }
      } catch (error) {
        console.error('Failed to load theme preference:', error);
      }
    };
    
    loadThemePreference();
  }, []);

  // Determine the effective color scheme
  const colorScheme = userColorScheme || systemColorScheme || 'light';

  // Toggle theme function
  const toggleTheme = useCallback(async () => {
    const newTheme = colorScheme === 'dark' ? 'light' : 'dark';
    setUserColorScheme(newTheme);
    try {
      await safeStorage.setItem('user-theme', newTheme);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  }, [colorScheme]);

  // Handle font loading errors gracefully
  useEffect(() => {
    if (error) {
      console.warn('Font loading error, continuing with system fonts:', error);
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
      
      // Initialize camera module on app load to prevent errors
      const setupApp = async () => {
        if (Platform.OS !== 'web') {
          try {
            await initializeCameraModule();
          } catch (error) {
            console.warn('[App] Camera initialization error:', error);
          }
        }
      };
      
      setupApp();
    }
  }, [loaded]);

  // Network monitoring and queued transaction processing
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      if (state.isConnected && state.isInternetReachable) {
        // Try to process queued transactions
        try {
          const paymentService = PaymentService.getInstance();
          await paymentService.processQueuedTransactions();
          // Optionally, show a notification to the user
          // Alert.alert('Transactions Synced', 'Queued transactions have been processed.');
        } catch (error) {
          console.warn('[App] Failed to process queued transactions:', error);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Show loading indicator while fonts or auth status are loading
  if (!loaded || authLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  // If no wallet or not authenticated, show only the wallet setup screen
  if (!hasWallet || !isAuthenticated) {
    return (
      <WalletSetupScreen
        onWalletCreated={refreshAuthState}
        title={!hasWallet ? "🚀 Welcome to AirChainPay" : "🔧 Complete Wallet Setup"}
        subtitle={!hasWallet ? "Your Gateway to Multi-Chain Digital Payments" : "Secure your wallet with a password and confirm backup"}
      />
    );
  }

  return (
    <ThemeContext.Provider value={{ colorScheme: colorScheme as 'light' | 'dark', toggleTheme }}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <RootLayoutNav />
    </ThemeContext.Provider>
  );
}
