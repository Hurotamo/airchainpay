import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, ScrollView } from 'react-native';
import { OfflineTransactionExpiryService, ExpiryWarning } from '../services/OfflineTransactionExpiryService';
import { TxQueue } from '../services/TxQueue';
import { logger } from '../utils/Logger';
import { Colors } from '../constants/Colors';
import { useThemeContext } from '../hooks/useThemeContext';

interface OfflineTransactionExpiryWarningProps {
  onWarningDismiss?: (warning: ExpiryWarning) => void;
}

export const OfflineTransactionExpiryWarning: React.FC<OfflineTransactionExpiryWarningProps> = ({
  onWarningDismiss
}) => {
  const [warnings, setWarnings] = useState<ExpiryWarning[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<any[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const { colorScheme } = useThemeContext();
  const theme = colorScheme || 'light';
  const colors = Colors[theme];

  useEffect(() => {
    const expiryService = OfflineTransactionExpiryService.getInstance();
    
    // Check for warnings immediately
    const checkWarnings = async () => {
      try {
        await expiryService.checkExpiryWarnings();
        await loadPendingTransactions();
      } catch (error) {
        logger.error('[OfflineExpiryWarning] Failed to check warnings:', error);
      }
    };

    // Start monitoring
    const handleWarning = (warning: ExpiryWarning) => {
      setWarnings(prev => {
        // Remove existing warning for same transaction
        const filtered = prev.filter(w => w.details.transactionId !== warning.details.transactionId);
        return [...filtered, warning];
      });
      setIsVisible(true);
      
      // Show critical warnings as alerts
      if (warning.severity === 'CRITICAL') {
        Alert.alert(
          'Transaction Expiry Warning',
          warning.message,
          [
            {
              text: 'Dismiss',
              onPress: () => onWarningDismiss?.(warning)
            },
            {
              text: 'View Details',
              onPress: () => showTransactionDetails(warning.details.transactionId)
            }
          ]
        );
      }
    };

    expiryService.onExpiryWarning(handleWarning);
    expiryService.startExpiryMonitoring();
    checkWarnings();

    return () => {
      expiryService.removeExpiryWarningCallback(handleWarning);
      expiryService.stopExpiryMonitoring();
    };
  }, [onWarningDismiss]);

  const loadPendingTransactions = async () => {
    try {
      const pending = await TxQueue.getPendingTransactions();
      setPendingTransactions(pending);
      setIsVisible(pending.length > 0);
    } catch (error) {
      logger.error('[OfflineExpiryWarning] Failed to load pending transactions:', error);
    }
  };

  const getSeverityColor = (severity: ExpiryWarning['severity']) => {
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

  const getSeverityIcon = (severity: ExpiryWarning['severity']) => {
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

  const handleDismiss = (warning: ExpiryWarning) => {
    setWarnings(prev => prev.filter(w => w !== warning));
    if (warnings.length <= 1) {
      setIsVisible(false);
    }
    onWarningDismiss?.(warning);
  };

  const showTransactionDetails = (transactionId: string) => {
    const tx = pendingTransactions.find(t => t.id === transactionId);
    if (tx) {
      Alert.alert(
        'Transaction Details',
        `Recipient: ${tx.to}\nAmount: ${tx.amount} ETH\nChain: ${tx.chainId}\nCreated: ${new Date(tx.timestamp).toLocaleString()}`,
        [
          { text: 'OK' },
          {
            text: 'Cancel Transaction',
            style: 'destructive',
            onPress: () => cancelTransaction(transactionId)
          }
        ]
      );
    }
  };

  const cancelTransaction = async (transactionId: string) => {
    try {
      const expiryService = OfflineTransactionExpiryService.getInstance();
      await expiryService.cancelPendingTransaction(transactionId);
      
      Alert.alert(
        'Transaction Cancelled',
        'The transaction has been cancelled and your funds are available again.',
        [{ text: 'OK' }]
      );
      
      // Reload pending transactions
      await loadPendingTransactions();
    } catch (error) {
      logger.error('[OfflineExpiryWarning] Failed to cancel transaction:', error);
      Alert.alert('Error', 'Failed to cancel transaction. Please try again.');
    }
  };

  const showExpiryInfo = () => {
    Alert.alert(
      'Offline Transaction Expiry',
      'Offline transactions have a 24-hour expiry period. If they are not processed within this time, they will be automatically cancelled and your funds will be returned to your available balance.\n\nTo avoid expiry:\n• Go online to process pending transactions\n• Cancel transactions you no longer want to send\n• Check your transaction status regularly',
      [{ text: 'OK' }]
    );
  };

  const formatTimeRemaining = (milliseconds: number): string => {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return 'less than 1 minute';
    }
  };

  if (!isVisible || (warnings.length === 0 && pendingTransactions.length === 0)) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Expiry Warnings */}
      {warnings.map((warning, index) => (
        <View
          key={`${warning.type}-${warning.timestamp}-${index}`}
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
          
          <View style={styles.detailsContainer}>
            <Text style={[styles.detailsLabel, { color: colors.text }]}>
              Transaction Details:
            </Text>
            <Text style={[styles.detailsText, { color: colors.text }]}>
              Amount: {warning.details.amount} ETH
            </Text>
            <Text style={[styles.detailsText, { color: colors.text }]}>
              Recipient: {warning.details.recipient}
            </Text>
            {warning.details.timeUntilExpiry > 0 && (
              <Text style={[styles.detailsText, { color: getSeverityColor(warning.severity) }]}>
                Time remaining: {formatTimeRemaining(warning.details.timeUntilExpiry)}
              </Text>
            )}
          </View>
          
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.primary }]}
              onPress={() => showTransactionDetails(warning.details.transactionId)}
            >
              <Text style={[styles.actionButtonText, { color: colors.background }]}>
                View Details
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#FF4444' }]}
              onPress={() => cancelTransaction(warning.details.transactionId)}
            >
              <Text style={[styles.actionButtonText, { color: 'white' }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {/* Pending Transactions Summary */}
      {pendingTransactions.length > 0 && (
        <View style={[styles.summaryContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>
            Pending Offline Transactions ({pendingTransactions.length})
          </Text>
          
          <ScrollView style={styles.transactionList} showsVerticalScrollIndicator={false}>
            {pendingTransactions.map((tx, index) => (
              <View key={tx.id} style={styles.transactionItem}>
                <Text style={[styles.transactionText, { color: colors.text }]}>
                  {tx.amount} ETH → {tx.to.substring(0, 8)}...
                </Text>
                <Text style={[styles.transactionTime, { color: colors.text }]}>
                  {new Date(tx.timestamp).toLocaleString()}
                </Text>
              </View>
            ))}
          </ScrollView>
          
          <TouchableOpacity
            style={[styles.learnMoreButton, { backgroundColor: colors.primary }]}
            onPress={showExpiryInfo}
          >
            <Text style={[styles.learnMoreText, { color: colors.background }]}>
              Learn About Expiry
            </Text>
          </TouchableOpacity>
        </View>
      )}
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
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryContainer: {
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  transactionList: {
    maxHeight: 120,
    marginBottom: 12,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  transactionText: {
    fontSize: 12,
    flex: 1,
  },
  transactionTime: {
    fontSize: 10,
    opacity: 0.7,
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

export default OfflineTransactionExpiryWarning; 