import React, { useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  Alert, 
  TouchableOpacity,
  Switch,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { MultiChainWalletManager } from '../../src/wallet/MultiChainWalletManager';
import { logger } from '../../src/utils/Logger';
import { AnimatedCard } from '../../components/AnimatedComponents';
import { Colors, getChainColor, getChainGradient } from '../../constants/Colors';
import { useThemeContext } from '../../hooks/useThemeContext';
import { useSelectedChain } from '../../src/components/ChainSelector';
import { useAuthState } from '../../src/hooks/useAuthState';
import WalletSetupScreen from '../../src/components/WalletSetupScreen';

export default function SettingsScreen() {
  const [loading, setLoading] = useState(false);
  const { hasWallet, isAuthenticated, refreshAuthState } = useAuthState();
  
  // Security modal states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<'seedPhrase' | 'privateKey' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  

  
  // Theme context
  const { colorScheme, toggleTheme } = useThemeContext();
  const theme = colorScheme || 'light';
  const colors = Colors[theme];
  
  // Chain context
  const { selectedChain } = useSelectedChain();
  const chainColor = getChainColor(selectedChain);
  const chainGradient = getChainGradient(selectedChain);

  // Show wallet setup screen if no wallet exists or not authenticated
  if (!loading && (!hasWallet || !isAuthenticated)) {
    return (
      <WalletSetupScreen
        onWalletCreated={refreshAuthState}
        title="Settings"
        subtitle="Create or import a wallet to access settings"
      />
    );
  }

  const handleLogout = async () => {
    if (!hasWallet) {
      Alert.alert('No Wallet', 'No wallet account found to log out from.');
      return;
    }

    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to log out? This will remove all wallet keys and data from this device. Make sure you have backed up your private keys before proceeding.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await MultiChainWalletManager.getInstance().logout();
              refreshAuthState();
              Alert.alert(
                'Logged Out',
                'You have been successfully logged out. All wallet data has been cleared from this device.',
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      // The user will need to create or import a wallet again
                      refreshAuthState();
                    }
                  }
                ]
              );
            } catch (error) {
              // Log the error but don't show alert since logout method handles errors internally
              logger.error('Logout process completed with warnings:', error);
              // Still mark as logged out since the logout method doesn't throw errors anymore
              refreshAuthState();
              Alert.alert(
                'Logged Out',
                'You have been logged out. Some data may not have been cleared completely.',
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      refreshAuthState();
                    }
                  }
                ]
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleClearTransactionHistory = async () => {
    Alert.alert(
      'Clear Transaction History',
      'Are you sure you want to clear all transaction history? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await MultiChainWalletManager.getInstance().clearTransactionHistory();
              Alert.alert('Success', 'Transaction history has been cleared.');
            } catch (error) {
              logger.error('Failed to clear transaction history:', error);
              Alert.alert('Error', 'Failed to clear transaction history.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleSecurityAccess = (action: 'seedPhrase' | 'privateKey') => {
    setPendingAction(action);
    setPassword('');
    setShowPasswordModal(true);
  };

  const handlePasswordVerification = async () => {
    if (!password) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    setPasswordLoading(true);
    try {
      const isValid = await MultiChainWalletManager.getInstance().verifyWalletPassword(password);
      
      if (!isValid) {
        Alert.alert('Invalid Password', 'The password you entered is incorrect');
        return;
      }

      // Password is correct, proceed with the action
      setShowPasswordModal(false);
      setPassword('');

      if (pendingAction === 'seedPhrase') {
        await showSeedPhrase();
      } else if (pendingAction === 'privateKey') {
        await showPrivateKey();
      }
    } catch (error) {
      logger.error('Failed to verify password:', error);
      Alert.alert('Error', 'Failed to verify password');
    } finally {
      setPasswordLoading(false);
      setPendingAction(null);
    }
  };

  const showSeedPhrase = async () => {
    try {
      const seedPhrase = await MultiChainWalletManager.getInstance().getSeedPhrase();
      
      Alert.alert(
        'Seed Phrase',
        `Your 12-word seed phrase:\n\n${seedPhrase}\n\nKeep this safe and never share it with anyone!`,
        [
          {
            text: 'Copy to Clipboard',
            onPress: () => {
              // In a real app, you'd use Clipboard API here
              Alert.alert('Security Warning', 'For security reasons, copying is disabled in this demo. Please write it down manually.');
            }
          },
          { text: 'Close', style: 'cancel' }
        ]
      );
    } catch (error) {
      logger.error('Failed to get seed phrase:', error);
      Alert.alert('Error', String(error));
    }
  };

  const showPrivateKey = async () => {
    try {
      const privateKey = await MultiChainWalletManager.getInstance().exportPrivateKey();
      
      Alert.alert(
        'Private Key',
        `Your private key:\n\n${privateKey}\n\nKeep this safe and never share it with anyone!`,
        [
          {
            text: 'Copy to Clipboard',
            onPress: () => {
              // In a real app, you'd use Clipboard API here
              Alert.alert('Security Warning', 'For security reasons, copying is disabled in this demo. Please write it down manually.');
            }
          },
          { text: 'Close', style: 'cancel' }
        ]
      );
    } catch (error) {
      logger.error('Failed to get private key:', error);
      Alert.alert('Error', String(error));
    }
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPassword('');
    setPendingAction(null);
  };

  const SettingItem = ({ 
    icon, 
    title, 
    subtitle, 
    onPress, 
    rightComponent, 
    destructive = false 
  }: {
    icon: string;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    rightComponent?: React.ReactNode;
    destructive?: boolean;
  }) => (
    <TouchableOpacity 
      style={[styles.settingItem, { backgroundColor: colors.card }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.settingLeft}>
        <View style={[
          styles.settingIcon,
          { backgroundColor: destructive ? '#ff4444' : chainColor + '20' }
        ]}>
          <Ionicons 
            name={icon as any} 
            size={20} 
            color={destructive ? '#fff' : chainColor} 
          />
        </View>
        <View style={styles.settingContent}>
          <Text style={[
            styles.settingTitle, 
            { color: destructive ? '#ff4444' : colors.text }
          ]}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.settingSubtitle, { color: colors.icon }]}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {rightComponent || (
        <Ionicons 
          name="chevron-forward" 
          size={20} 
          color={colors.icon} 
        />
      )}
    </TouchableOpacity>
  );

  return (
    <LinearGradient
      colors={chainGradient as any}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* App Settings */}
        <AnimatedCard delay={0} style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            App Settings
          </Text>
          
          <SettingItem
            icon="moon"
            title="Dark Mode"
            subtitle="Toggle between light and dark themes"
            rightComponent={
              <Switch
                value={theme === 'dark'}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.border, true: chainColor }}
                thumbColor={theme === 'dark' ? '#fff' : '#f4f3f4'}
              />
            }
          />
        </AnimatedCard>

        {/* Wallet Settings */}
        <AnimatedCard delay={100} style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Wallet Settings
          </Text>
          
          <SettingItem
            icon="key"
            title="Wallet Status"
            subtitle={hasWallet ? 'Wallet is active' : 'No wallet found'}
            rightComponent={
              <View style={[
                styles.statusDot,
                { backgroundColor: hasWallet ? '#4CAF50' : '#ff4444' }
              ]} />
            }
          />
        </AnimatedCard>

        {/* Security */}
        {hasWallet && (
          <AnimatedCard delay={150} style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Security & Backup
            </Text>
            
            <SettingItem
              icon="document-text"
              title="View Seed Phrase"
              subtitle="Show your 12-word recovery phrase"
              onPress={() => handleSecurityAccess('seedPhrase')}
            />
            
            <SettingItem
              icon="shield"
              title="View Private Key"
              subtitle="Show your wallet's private key"
              onPress={() => handleSecurityAccess('privateKey')}
            />
          </AnimatedCard>
        )}

        {/* Data Management */}
        <AnimatedCard delay={200} style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Data Management
          </Text>
          
          <SettingItem
            icon="trash"
            title="Clear Transaction History"
            subtitle="Remove all stored transaction records"
            onPress={handleClearTransactionHistory}
            destructive={false}
          />
        </AnimatedCard>

        {/* Danger Zone */}
        {hasWallet && (
          <AnimatedCard delay={300} style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: '#ff4444' }]}>Danger Zone</Text>
            <SettingItem
              icon="log-out"
              title="Logout"
              subtitle="Remove all wallet keys and data from this device"
              onPress={handleLogout}
              destructive={true}
            />
            <SettingItem
              icon="alert-circle"
              title="Reset Wallet"
              subtitle="Completely clear wallet and all related data"
              onPress={handleLogout}
              destructive={true}
            />
          </AnimatedCard>
        )}

        {/* Bluetooth Diagnostic */}


        {/* App Info */}
        <AnimatedCard delay={450} style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            About
          </Text>
          
          <SettingItem
            icon="information-circle"
            title="AirChainPay Wallet"
            subtitle="Version 1.0.0"
          />
          
          <SettingItem
            icon="shield-checkmark"
            title="Security"
            subtitle="Your keys are stored securely on this device"
          />
        </AnimatedCard>

        {/* Loading state */}
        {loading && (
          <AnimatedCard delay={500} style={styles.loadingCard}>
            <View style={styles.loadingContent}>
              <Ionicons name="sync" size={24} color={chainColor} />
              <Text style={[styles.loadingText, { color: colors.text }]}>
                Processing...
              </Text>
            </View>
          </AnimatedCard>
        )}
      </ScrollView>

      {/* Password Verification Modal */}
      <Modal
        visible={showPasswordModal}
        animationType="slide"
        transparent={true}
        onRequestClose={closePasswordModal}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContainer}>
            <LinearGradient
              colors={chainGradient as any}
              style={styles.modalGradient}
            >
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Ionicons name="shield-checkmark" size={48} color="#4CAF50" />
                  <Text style={styles.modalTitle}>Security Verification</Text>
                  <Text style={styles.modalSubtitle}>
                    Enter your wallet password to access {pendingAction === 'seedPhrase' ? 'seed phrase' : 'private key'}
                  </Text>
                </View>
                
                <View style={styles.passwordInputContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Enter your password"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons 
                      name={showPassword ? "eye-off" : "eye"} 
                      size={20} 
                      color="rgba(255,255,255,0.7)" 
                    />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonSecondary]}
                    onPress={closePasswordModal}
                    disabled={passwordLoading}
                  >
                    <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonPrimary]}
                    onPress={handlePasswordVerification}
                    disabled={passwordLoading}
                  >
                    {passwordLoading ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <Text style={styles.modalButtonTextPrimary}>Verify</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>
          </View>
        </KeyboardAvoidingView>
      </Modal>


    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  sectionCard: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  settingSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  loadingCard: {
    padding: 20,
    alignItems: 'center',
  },
  loadingContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingText: {
    marginLeft: 12,
    fontSize: 16,
    fontWeight: '500',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalGradient: {
    padding: 24,
  },
  modalContent: {
    alignItems: 'center',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 20,
  },
  passwordInputContainer: {
    position: 'relative',
    width: '100%',
    marginBottom: 20,
  },
  passwordInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: 'white',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: 12,
    padding: 4,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  modalButtonSecondary: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  modalButtonPrimary: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  modalButtonTextSecondary: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextPrimary: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },

}); 