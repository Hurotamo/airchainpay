import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
  Linking
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getAllTransactions, TxRow } from '../services/TxQueue';
import { MultiChainWalletManager } from '../wallet/MultiChainWalletManager';
import { TokenWalletManager } from '../wallet/TokenWalletManager';
import { logger } from '../utils/Logger';
import { SUPPORTED_CHAINS, DEFAULT_CHAIN_ID } from '../constants/AppConfig';
import { getChainColor } from '../../constants/Colors';
import { Transaction } from '../types/transaction';

// Import themed components
import { ThemedView } from '../../components/ThemedView';
import { useThemeColor } from '../../hooks/useThemeColor';

export default function TransactionHistoryScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedChain, setSelectedChain] = useState(DEFAULT_CHAIN_ID);
  
  const textColor = useThemeColor({ light: '#000', dark: '#fff' }, 'text');
  const cardColor = useThemeColor({ light: '#f5f5f5', dark: '#2c2c2e' }, 'card');
  const accentColor = useThemeColor({ light: '#2196F3', dark: '#4dabf5' }, 'tint');

  // Load transactions when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadTransactions();
      loadWalletAddress();
    }, [selectedChain])
  );

  const loadWalletAddress = async () => {
    try {
      const walletInfo = await MultiChainWalletManager.getInstance().getWalletInfo(selectedChain);
      const address = walletInfo.address;
      // setWalletAddress(address); // This line was removed as per the edit hint
    } catch (error) {
      logger.error('Failed to load wallet in history screen:', error);
    }
  };

  const loadTransactions = async () => {
    setLoading(true);
    try {
      // Get pending transactions from queue
      const queuedTxs = await getAllTransactions();
      
      // Get completed transactions from token history
      const tokenManager = new TokenWalletManager();
      const address = (await MultiChainWalletManager.getInstance().getWalletInfo(selectedChain)).address;
      
      // For now, only use queued transactions since getTokenTransactionHistory doesn't exist
      const tokenTxs: Transaction[] = [];

      // Convert queued transactions to common format
      const formattedQueuedTxs: Transaction[] = queuedTxs.map((tx: TxRow) => {
        try {
          // Handle new transaction format with transport and metadata
          const transport = tx.transport || 'unknown';
          const metadata = tx.metadata || {};
          
          return {
            id: tx.id.toString(),
            hash: tx.hash || '',
            type: 'send', // Queued transactions are always sends
            amount: tx.amount || '0',
            token: metadata.token?.symbol || 'ETH',
            status: tx.status as 'pending' | 'confirmed' | 'failed',
            timestamp: tx.timestamp || new Date().toISOString(),
            chainId: tx.chainId || selectedChain,
            to: tx.to || '',
            from: '', // Will be filled from wallet address
            transport: transport,
            metadata: metadata
          };
        } catch (e) {
          logger.error('Error parsing queued transaction:', e);
          return null;
        }
      }).filter(tx => tx !== null) as Transaction[];

      // Convert token transactions to common format
      const formattedTokenTxs: Transaction[] = tokenTxs.map((tx: Transaction) => ({
        id: tx.hash,
        hash: tx.hash,
        type: tx.from.toLowerCase() === address.toLowerCase() ? 'send' : 'receive',
        amount: tx.amount,
        token: tx.token,
        status: tx.status,
        timestamp: new Date(tx.timestamp).toISOString(),
        chainId: tx.chainId,
        to: tx.to,
        from: tx.from
      }));

      // Combine and sort all transactions
      const allTxs = [...formattedQueuedTxs, ...formattedTokenTxs];
      const sortedTxs = allTxs.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setTransactions(sortedTxs);
    } catch (error) {
      logger.error('Failed to load transactions:', error);
      Alert.alert('Error', 'Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTransactions().then(() => setRefreshing(false));
  }, [selectedChain]);

  const changeChain = useCallback((chainId: string) => {
    setSelectedChain(chainId);
    logger.info(`[TransactionHistory] Changed to chain: ${chainId}`);
  }, []);

  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const getExplorerUrl = (chainId: string, hash: string): string | null => {
    const chain = SUPPORTED_CHAINS[chainId];
    if (!chain || !chain.blockExplorer) return null;
    return `${chain.blockExplorer}/tx/${hash}`;
  };

  const openTransaction = (tx: Transaction) => {
    const explorerUrl = getExplorerUrl(tx.chainId, tx.hash);
    
    const transportInfo = tx.transport ? `Transport: ${tx.transport.toUpperCase()}` : '';
    const merchantInfo = tx.metadata?.merchant ? `Merchant: ${tx.metadata.merchant}` : '';
    const locationInfo = tx.metadata?.location ? `Location: ${tx.metadata.location}` : '';
    
    const details = [
      `Status: ${tx.status}`,
      `Type: ${tx.type}`,
      `Amount: ${tx.amount} ${tx.token}`,
      `Chain: ${SUPPORTED_CHAINS[tx.chainId]?.name || tx.chainId}`,
      transportInfo,
      merchantInfo,
      locationInfo,
      `From: ${formatAddress(tx.from)}`,
      `To: ${formatAddress(tx.to)}`,
      `Hash: ${formatAddress(tx.hash)}`,
      `Time: ${new Date(tx.timestamp).toLocaleString()}`
    ].filter(Boolean).join('\n');

    Alert.alert(
      'Transaction Details', 
      details,
      [
        { text: 'Close' },
        explorerUrl ? {
          text: 'View in Explorer',
          onPress: () => Linking.openURL(explorerUrl)
        } : undefined,
      ].filter(Boolean) as any
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#FF9800';
      case 'confirmed': return '#4CAF50';
      case 'failed': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  const renderTransactionItem = ({ item }: { item: Transaction }) => {
    const statusColor = getStatusColor(item.status);
    const chain = SUPPORTED_CHAINS[item.chainId];
    
    // Get transport icon
    const getTransportIcon = (transport?: string) => {
      switch (transport) {
        case 'qr': return 'qr-code';
        case 'ble': return 'bluetooth';
        case 'onchain': return 'link';
        default: return 'card';
      }
    };
    
    return (
      <TouchableOpacity
        style={[styles.txItem, { backgroundColor: String(cardColor) }]}
        onPress={() => openTransaction(item)}
      >
        <View style={styles.txHeader}>
          <View style={styles.txIconContainer}>
            <Ionicons 
              name={item.type === 'send' ? 'arrow-up-circle' : 'arrow-down-circle'} 
              size={24} 
              color={item.type === 'send' ? '#ff6b6b' : '#51cf66'} 
            />
            {item.transport && (
              <Ionicons 
                name={getTransportIcon(item.transport) as any} 
                size={16} 
                color="#2196F3" 
                style={{ marginLeft: 4 }}
              />
            )}
          </View>
          <View style={styles.txInfo}>
            <View style={styles.txTopRow}>
              <Text style={[styles.txAmount, { color: String(textColor) }]}>
                {item.type === 'send' ? '-' : '+'}{item.amount} {item.token}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {item.status}
                </Text>
              </View>
            </View>
            <View style={styles.txBottomRow}>
              <Text style={[styles.txChain, { color: String(textColor) + '80' }]}>
                {chain?.name || item.chainId}
              </Text>
              <Text style={[styles.txTime, { color: String(textColor) + '80' }]}>
                {new Date(item.timestamp).toLocaleString()}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={String(accentColor)} />
        <Text style={[styles.loadingText, { color: String(textColor) }]}>
          Loading transactions...
        </Text>
      </View>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Chain Selector Header */}
      <View style={[styles.chainSelectorContainer, { backgroundColor: String(cardColor) }]}>
        <Text style={[styles.chainSelectorTitle, { color: String(textColor) }]}>
          Select Network:
        </Text>
        <View style={styles.chainButtonsContainer}>
          <TouchableOpacity
            style={[
              styles.chainButton,
              { backgroundColor: getChainColor('core_testnet') + '20', borderColor: getChainColor('core_testnet') },
              selectedChain === 'core_testnet' && { borderWidth: 2 }
            ]}
            onPress={() => changeChain('core_testnet')}
          >
            <Text style={[
              styles.chainButtonText,
              { color: getChainColor('core_testnet') },
              selectedChain === 'core_testnet' && { fontWeight: 'bold' }
            ]}>
              Core Testnet {selectedChain === 'core_testnet' ? '✓' : ''}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.chainButton,
              { backgroundColor: getChainColor('base_sepolia') + '20', borderColor: getChainColor('base_sepolia') },
              selectedChain === 'base_sepolia' && { borderWidth: 2 }
            ]}
            onPress={() => changeChain('base_sepolia')}
          >
            <Text style={[
              styles.chainButtonText,
              { color: getChainColor('base_sepolia') },
              selectedChain === 'base_sepolia' && { fontWeight: 'bold' }
            ]}>
              Base Sepolia {selectedChain === 'base_sepolia' ? '✓' : ''}
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* Network Info */}
        <View style={styles.networkInfo}>
          <Ionicons name="information-circle" size={16} color={getChainColor(selectedChain)} />
          <Text style={[styles.networkInfoText, { color: String(textColor) + '80' }]}>
            Showing transactions for {SUPPORTED_CHAINS[selectedChain]?.name || selectedChain}
          </Text>
        </View>
      </View>

      <FlatList
        data={transactions}
        renderItem={renderTransactionItem}
        keyExtractor={(item) => item.id}
        style={styles.transactionList}
        contentContainerStyle={styles.transactionListContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[String(accentColor)]}
            tintColor={String(accentColor)}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-outline" size={48} color={String(textColor) + '40'} />
            <Text style={[styles.emptyText, { color: String(textColor) + '80' }]}>
              No transactions found on {SUPPORTED_CHAINS[selectedChain]?.name || selectedChain}
            </Text>
          </View>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  walletContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  walletAddress: {
    marginLeft: 8,
    fontSize: 14,
  },
  listContainer: {
    padding: 16,
  },
  txItem: {
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  txHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  txIconContainer: {
    marginRight: 12,
  },
  txInfo: {
    flex: 1,
  },
  txTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  txBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  txChain: {
    fontSize: 12,
  },
  txTime: {
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
  // New styles for chain selector
  chainSelectorContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee', // Default border for light mode
  },
  chainSelectorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  chainButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  chainButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  chainButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  networkInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0', // Default background for light mode
    padding: 10,
    borderRadius: 8,
  },
  networkInfoText: {
    marginLeft: 8,
    fontSize: 13,
  },
  transactionList: {
    flex: 1,
  },
  transactionListContent: {
    padding: 16,
  },
}); 