import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { CrossWalletSecurityService, SecurityWarning } from '../services/CrossWalletSecurityService';
import { logger } from '../utils/Logger';
import { Colors } from '../constants/Colors';
import { useThemeContext } from '../hooks/useThemeContext';

interface CrossWalletSecurityWarningProps {
  chainId: string;
  onWarningDismiss?: (warning: SecurityWarning) => void;
}

export const CrossWalletSecurityWarning: React.FC<CrossWalletSecurityWarningProps> = ({
  chainId,
  onWarningDismiss
}) => {
  const [warnings, setWarnings] = useState<SecurityWarning[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const { colorScheme } = useThemeContext();
  const theme = colorScheme || 'light';
  const colors = Colors[theme];

  useEffect(() => {
    const crossWalletService = CrossWalletSecurityService.getInstance();
    
    // Check for warnings immediately
    const checkWarnings = async () => {
      try {
        const securityWarnings = await crossWalletService.checkCrossWalletSecurity(chainId);
        setWarnings(securityWarnings);
        setIsVisible(securityWarnings.length > 0);
      } catch (error) {
        logger.error('[CrossWalletWarning] Failed to check warnings:', error);
      }
    };

    // Start real-time monitoring
    const handleWarnings = (newWarnings: SecurityWarning[]) => {
      setWarnings(newWarnings);
      setIsVisible(newWarnings.length > 0);
      
      // Show critical warnings as alerts
      const criticalWarnings = newWarnings.filter(w => w.severity === 'CRITICAL');
      criticalWarnings.forEach(warning => {
        Alert.alert(
          'Security Warning',
          warning.message,
          [
            {
              text: 'Dismiss',
              onPress: () => onWarningDismiss?.(warning)
            },
            {
              text: 'Learn More',
              onPress: () => showSecurityInfo()
            }
          ]
        );
      });
    };

    crossWalletService.startCrossWalletMonitoring(chainId, handleWarnings);
    checkWarnings();

    return () => {
      crossWalletService.stopCrossWalletMonitoring(chainId);
    };
  }, [chainId, onWarningDismiss]);

  const getSeverityColor = (severity: SecurityWarning['severity']) => {
    switch (severity) {
      case 'CRITICAL':
        return '#FF4444';
      case 'HIGH':
        return '#FF8800';
      case 'MEDIUM':
        return '#FFAA00';
      case 'LOW':
        return '#FFCC00';
      default:
        return '#FF8800';
    }
  };

  const getSeverityIcon = (severity: SecurityWarning['severity']) => {
    switch (severity) {
      case 'CRITICAL':
        return '🚨';
      case 'HIGH':
        return '⚠️';
      case 'MEDIUM':
        return '⚡';
      case 'LOW':
        return 'ℹ️';
      default:
        return '⚠️';
    }
  };

  const handleDismiss = (warning: SecurityWarning) => {
    setWarnings(prev => prev.filter(w => w !== warning));
    if (warnings.length <= 1) {
      setIsVisible(false);
    }
    onWarningDismiss?.(warning);
  };

  const showSecurityInfo = () => {
    Alert.alert(
      'Cross-Wallet Security',
      'When you use the same wallet address in multiple applications (like MetaMask and AirChainPay), it can cause transaction conflicts and double-spending issues.\n\nRecommendations:\n• Use only one wallet at a time\n• Check your balance before transactions\n• Wait for confirmations before new transactions',
      [{ text: 'OK' }]
    );
  };

  if (!isVisible || warnings.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {warnings.map((warning, index) => (
        <View
          key={`${warning.type}-${warning.timestamp}`}
          style={[
            styles.warningContainer,
            {
              backgroundColor: colors.card,
              borderLeftColor: getSeverityColor(warning.severity),
              borderColor: colors.border
            }
          ]}
        >
          <View style={styles.warningHeader}>
            <Text style={styles.severityIcon}>
              {getSeverityIcon(warning.severity)}
            </Text>
            <Text style={[styles.severityText, { color: getSeverityColor(warning.severity) }]}>
              {warning.severity}
            </Text>
            <TouchableOpacity
              style={styles.dismissButton}
              onPress={() => handleDismiss(warning)}
            >
              <Text style={[styles.dismissText, { color: colors.text }]}>×</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={[styles.warningMessage, { color: colors.text }]}>
            {warning.message}
          </Text>
          
          {warning.details && (
            <View style={styles.detailsContainer}>
              <Text style={[styles.detailsLabel, { color: colors.text }]}>
                Details:
              </Text>
              {warning.details.lastTransaction && (
                <Text style={[styles.detailsText, { color: colors.text }]}>
                  Last external transaction: {new Date(warning.details.lastTransaction).toLocaleString()}
                </Text>
              )}
              {warning.details.pendingAmount && (
                <Text style={[styles.detailsText, { color: colors.text }]}>
                  Pending amount: {warning.details.pendingAmount} ETH
                </Text>
              )}
              {warning.details.transactionCount && (
                <Text style={[styles.detailsText, { color: colors.text }]}>
                  External transactions: {warning.details.transactionCount}
                </Text>
              )}
            </View>
          )}
          
          <TouchableOpacity
            style={[styles.learnMoreButton, { backgroundColor: colors.primary }]}
            onPress={showSecurityInfo}
          >
            <Text style={[styles.learnMoreText, { color: colors.background }]}>
              Learn More
            </Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12
  },
  warningContainer: {
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  severityIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  severityText: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    flex: 1,
  },
  dismissButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  warningMessage: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  detailsContainer: {
    marginBottom: 12,
  },
  detailsLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  detailsText: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 2,
  },
  learnMoreButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  learnMoreText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default CrossWalletSecurityWarning; 