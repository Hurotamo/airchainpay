import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemedView } from '../../components/ThemedView';
import { ThemedText } from '../../components/ThemedText';
import SecureCredentialsViewer from '../components/SecureCredentialsViewer';
import { WalletEncryption } from '../utils/crypto/WalletEncryption';
import { MultiChainWalletManager } from '../wallet/MultiChainWalletManager';
import { logger } from '../utils/Logger';

export default function SettingsScreen() {
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentialType, setCredentialType] = useState<'seedphrase' | 'privatekey'>('seedphrase');
  const router = useRouter();

  const handleViewCredentials = async (type: 'seedphrase' | 'privatekey') => {
    try {
      // Check if credentials exist
      const hasCredentials = await WalletEncryption.verifyPassword('');
      if (!hasCredentials) {
        Alert.alert(
          'Not Available',
          `No ${type === 'seedphrase' ? 'seed phrase' : 'private key'} found. Please import a wallet first.`
        );
        return;
      }

      setCredentialType(type);
      setShowCredentialsModal(true);
    } catch (error) {
      logger.error('Error checking credentials:', error);
      Alert.alert('Error', 'Failed to access wallet credentials');
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout Wallet',
      'Are you sure you want to logout? This will clear all wallet data and you will need to create or import a wallet again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              logger.info('[Settings] Starting logout process...');
              
              // Clear all wallet data
              await MultiChainWalletManager.getInstance().logout();
              
              logger.info('[Settings] Logout completed successfully');
              
              // Show success message and redirect
              Alert.alert(
                'Logged Out',
                'Your wallet has been logged out successfully. You can now create a new wallet or import an existing one.',
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      // Force app restart to show wallet setup screen
                      // This will trigger the layout to re-check wallet existence
                      // We need to navigate to a route that will trigger the layout re-render
                      router.replace('/');
                    }
                  }
                ]
              );
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
              logger.error('[Settings] Failed to logout:', errorMessage);
              Alert.alert('Logout Error', 'Failed to logout. Please try again.');
            }
          }
        }
      ]
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Security</ThemedText>
          
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => handleViewCredentials('seedphrase')}
          >
            <View style={styles.menuItemContent}>
              <Ionicons name="key-outline" size={24} color="#2196F3" />
              <ThemedText style={styles.menuItemText}>View Seed Phrase</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => handleViewCredentials('privatekey')}
          >
            <View style={styles.menuItemContent}>
              <Ionicons name="lock-closed-outline" size={24} color="#2196F3" />
              <ThemedText style={styles.menuItemText}>View Private Key</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/change-password')}
          >
            <View style={styles.menuItemContent}>
              <Ionicons name="shield-outline" size={24} color="#2196F3" />
              <ThemedText style={styles.menuItemText}>Change Password</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Account</ThemedText>
          
          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleLogout}
          >
            <View style={styles.menuItemContent}>
              <Ionicons name="log-out-outline" size={24} color="#FF3B30" />
              <ThemedText style={[styles.menuItemText, { color: '#FF3B30' }]}>Logout Wallet</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Add other settings sections here */}
      </ScrollView>

      <SecureCredentialsViewer
        isVisible={showCredentialsModal}
        onClose={() => setShowCredentialsModal(false)}
        type={credentialType}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
  },
}); 