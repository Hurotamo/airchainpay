import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, getBlueBlackGradient } from '../../constants/Colors';
import { useThemeContext } from '../../hooks/useThemeContext';
import { AnimatedCard, AnimatedButton } from '../../components/AnimatedComponents';
import { PasswordMigration } from '../utils/crypto/PasswordMigration';

interface WalletBackupScreenProps {
  seedPhrase: string;
  onBackupConfirmed: () => void;
  onPasswordSet: (password: string) => void;
  onCancel: () => void;
}

export const WalletBackupScreen: React.FC<WalletBackupScreenProps> = ({
  seedPhrase,
  onBackupConfirmed,
  onPasswordSet,
  onCancel,
}) => {
  const { colorScheme } = useThemeContext();
  const colors = Colors[colorScheme || 'light'];
  
  const words = seedPhrase ? seedPhrase.split(' ') : [];
  const isPrivateKeyImport = !seedPhrase;
  
  const [currentStep, setCurrentStep] = useState<'backup' | 'confirm' | 'password'>(
    isPrivateKeyImport ? 'password' : 'backup'
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const validatePassword = (pass: string): string | null => {
    const validation = PasswordMigration.validatePassword(pass);
    if (!validation.isValid) {
      return validation.feedback[0] || 'Password does not meet security requirements';
    }
    return null;
  };

  const handleBackupStep = () => {
    setCurrentStep('confirm');
  };

  const handleConfirmStep = () => {
    setCurrentStep('password');
  };

  const handlePasswordStep = async () => {
    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError !== null) {
      Alert.alert('Invalid Password', passwordError);
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await onPasswordSet(password);
      if (isPrivateKeyImport) {
        // For private key imports, skip backup step
        await onBackupConfirmed();
      } else {
        await onBackupConfirmed();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const renderPasswordStep = () => (
    <AnimatedCard delay={100} style={styles.card}>
      <View style={styles.stepContent}>
        <View style={styles.stepHeader}>
          <Ionicons name="shield-checkmark" size={48} color="#4CAF50" />
          <Text style={[styles.stepTitle, { color: colors.text }]}>
            Secure Your Wallet
          </Text>
          <Text style={[styles.stepSubtitle, { color: colors.icon }]}>
            Create a password to protect access to your seed phrase and private keys
          </Text>
        </View>

        <View style={styles.inputContainer}>
          <View style={styles.passwordInputContainer}>
            <TextInput
              style={[styles.passwordInput, { color: colors.text, borderColor: colors.border }]}
              placeholder="Enter password (min 8 characters, 1 uppercase, 1 lowercase, 1 number)"
              placeholderTextColor={colors.icon}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons 
                name={showPassword ? "eye-off" : "eye"} 
                size={20} 
                color={colors.icon} 
              />
            </TouchableOpacity>
          </View>

          <View style={styles.passwordInputContainer}>
            <TextInput
              style={[styles.passwordInput, { color: colors.text, borderColor: colors.border }]}
              placeholder="Confirm password"
              placeholderTextColor={colors.icon}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              <Ionicons 
                name={showConfirmPassword ? "eye-off" : "eye"} 
                size={20} 
                color={colors.icon} 
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton, { borderColor: colors.border }]}
            onPress={() => setCurrentStep('confirm')}
          >
            <Text style={[styles.buttonText, { color: colors.text }]}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handlePasswordStep}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.primaryButtonText}>Complete Setup</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </AnimatedCard>
  );

  const renderBackupStep = () => (
    <AnimatedCard delay={100} style={styles.card}>
      <View style={styles.stepContent}>
        <View style={styles.stepHeader}>
          <Ionicons name="document-text" size={48} color="#FF9800" />
          <Text style={[styles.stepTitle, { color: colors.text }]}>
            Backup Your Seed Phrase
          </Text>
          <Text style={[styles.stepSubtitle, { color: colors.icon }]}>
            Write down these 12 words in order and store them safely. This is the only way to recover your wallet.
          </Text>
        </View>

        <View style={styles.warningBox}>
          <Ionicons name="warning" size={20} color="#FF5722" />
          <Text style={styles.warningText}>
            Never share your seed phrase with anyone. Store it offline in a secure location.
          </Text>
        </View>

        <View style={styles.seedPhraseContainer}>
          {words.map((word, index) => (
            <View key={index} style={styles.wordContainer}>
              <Text style={styles.wordNumber}>{index + 1}</Text>
              <Text style={[styles.word, { color: colors.text }]}>{word}</Text>
            </View>
          ))}
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton, { borderColor: colors.border }]}
            onPress={onCancel}
          >
            <Text style={[styles.buttonText, { color: colors.text }]}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleBackupStep}
          >
            <Text style={styles.primaryButtonText}>I&apos;ve Written It Down</Text>
          </TouchableOpacity>
        </View>
      </View>
    </AnimatedCard>
  );

  const renderConfirmStep = () => (
    <AnimatedCard delay={100} style={styles.card}>
      <View style={styles.stepContent}>
        <View style={styles.stepHeader}>
          <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
          <Text style={[styles.stepTitle, { color: colors.text }]}>
            Confirm Backup
          </Text>
          <Text style={[styles.stepSubtitle, { color: colors.icon }]}>
            Please confirm that you have safely stored your seed phrase
          </Text>
        </View>

        <View style={styles.confirmationContainer}>
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setBackupConfirmed(!backupConfirmed)}
          >
            <View style={[
              styles.checkbox,
              { borderColor: colors.border },
              backupConfirmed ? styles.checkboxChecked : undefined
            ]}>
              {backupConfirmed && (
                <Ionicons name="checkmark" size={16} color="white" />
              )}
            </View>
            <Text style={[styles.checkboxText, { color: colors.text }]}>
              I have written down my seed phrase and stored it in a secure location
            </Text>
          </TouchableOpacity>

          <View style={styles.reminderBox}>
            <Text style={[styles.reminderText, { color: colors.icon }]}>
              Remember: If you lose your seed phrase, you will lose access to your wallet permanently.
            </Text>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton, { borderColor: colors.border }]}
            onPress={() => setCurrentStep('backup')}
          >
            <Text style={[styles.buttonText, { color: colors.text }]}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.primaryButton,
              !backupConfirmed ? styles.disabledButton : undefined
            ]}
            onPress={handleConfirmStep}
            disabled={!backupConfirmed}
          >
            <Text style={styles.primaryButtonText}>Continue to Password</Text>
          </TouchableOpacity>
        </View>
      </View>
    </AnimatedCard>
  );

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={getBlueBlackGradient('primary') as any}
        style={styles.gradient}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {currentStep === 'password' && renderPasswordStep()}
            {currentStep === 'backup' && renderBackupStep()}
            {currentStep === 'confirm' && renderConfirmStep()}
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    padding: 24,
  },
  stepContent: {
    alignItems: 'center',
  },
  stepHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 24,
  },
  passwordInputContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  passwordInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: 12,
    padding: 4,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 87, 34, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    width: '100%',
  },
  warningText: {
    color: '#FF5722',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  seedPhraseContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 24,
  },
  wordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
    width: '48%',
  },
  wordNumber: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginRight: 8,
    minWidth: 16,
  },
  word: {
    fontSize: 14,
    fontWeight: '500',
  },
  confirmationContainer: {
    width: '100%',
    marginBottom: 24,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: 4,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  checkboxText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  reminderBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 12,
    borderRadius: 8,
  },
  reminderText: {
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  primaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  disabledButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
}); 