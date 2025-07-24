import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Modal,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ChainColors, getChainColor, getChainGradient } from '../../constants/Colors';
import { useThemeContext } from '../../hooks/useThemeContext';
import { SUPPORTED_CHAINS } from '../constants/AppConfig';
import { getTokenLogo, getLogoUri } from '../constants/logos';
import { TokenInfo } from '../types/token';
import { useThemeColor } from '../hooks/useThemeContext';
import { MultiChainWalletManager } from '../wallet/MultiChainWalletManager';
import { TokenWalletManager } from '../wallet/TokenWalletManager';

// Correct token addresses for each network
const TOKEN_ADDRESSES = {
  base_sepolia: {
    USDC: '0xa52C05C9726f1DeFc3d9b0eB5411C66F0920bBeC',
    USDT: '0x3c6E5e4F0b3B56a5324E5e6D2a009b34Eb63885d'
  },
  core_testnet: {
    USDC: '0x960a4ecbd07ee1700e96df39242f1a13e904d50c',
    USDT: '0x2df197428353c8847b8c3d042eb9d50e52f14b5a'
  }
};

interface TokenSelectorProps {
  selectedChain: string;
  selectedToken: TokenInfo | null;
  onTokenSelect: (token: TokenInfo) => void;
  onChainChange?: (chainId: string) => void;
  showBalance?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const TokenSelector: React.FC<TokenSelectorProps> = ({
  selectedChain,
  selectedToken,
  onTokenSelect,
  onChainChange,
  showBalance = true,
  style,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [availableTokens, setAvailableTokens] = useState<TokenInfo[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);

  const { colorScheme } = useThemeContext();
  const theme = colorScheme || 'light';
  const colors = Colors[theme];

  const backgroundColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({ light: '#ccc', dark: '#333' }, 'text');
  const itemBackgroundColor = useThemeColor({ light: '#f5f5f5', dark: '#1c1c1e' }, 'background');

  // Get tokens for the selected chain and fetch balances
  useEffect(() => {
    loadTokensAndBalances(selectedChain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChain]);

  const loadTokensAndBalances = async (chainId: string) => {
    setLoading(true);
    setBalancesLoading(true);
    try {
      const tokens = getTokensForChain(chainId);
      setAvailableTokens(tokens.map(t => ({ ...t, balance: undefined })));

      // Fetch wallet address for the selected chain
      const walletManager = MultiChainWalletManager.getInstance();
      const walletInfo = await walletManager.getWalletInfo(chainId);
      const walletAddress = walletInfo.address;
      const tokenWalletManager = new TokenWalletManager();

      // Fetch balances for all tokens
      const tokensWithBalances = await Promise.all(tokens.map(async (token) => {
        try {
          const tokenBalance = await tokenWalletManager.getTokenBalance(walletAddress, token);
          return { ...token, balance: tokenBalance.formattedBalance };
        } catch (error) {
          return { ...token, balance: '0.00' };
        }
      }));
      setAvailableTokens(tokensWithBalances);

      // Auto-select first token if none selected
      if (!selectedToken && tokensWithBalances.length > 0) {
        onTokenSelect(tokensWithBalances[0]);
      }
    } catch (error) {
      console.error('Error loading tokens or balances:', error);
    } finally {
      setLoading(false);
      setBalancesLoading(false);
    }
  };

  const getTokensForChain = (chainId: string): TokenInfo[] => {
    const chainConfig = SUPPORTED_CHAINS[chainId];
    if (!chainConfig) {
      return [];
    }
    const tokens: TokenInfo[] = [];
    // Add native token with proper logo
    tokens.push({
      symbol: chainConfig.nativeCurrency.symbol,
      name: chainConfig.nativeCurrency.name,
      address: '0x0000000000000000000000000000000000000000',
      decimals: chainConfig.nativeCurrency.decimals,
      chainId,
      chainName: chainConfig.name,
      isNative: true,
      logoUri: getLogoUri(getTokenLogo(chainConfig.nativeCurrency.symbol, chainId)),
    });
    // Add ERC-20 stablecoins with correct addresses
    if (chainConfig.type === 'evm') {
      const chainTokens = TOKEN_ADDRESSES[chainId as keyof typeof TOKEN_ADDRESSES];
      if (chainTokens) {
        const stablecoins = [
          {
            symbol: 'USDC',
            name: 'USD Coin',
            address: chainTokens.USDC,
            decimals: 6,
            isStablecoin: true,
            logoUri: getLogoUri(getTokenLogo('USDC', chainId)),
          },
          {
            symbol: 'USDT',
            name: 'Tether USD',
            address: chainTokens.USDT,
            decimals: 6,
            isStablecoin: true,
            logoUri: getLogoUri(getTokenLogo('USDT', chainId)),
          },
        ];
        stablecoins.forEach(stablecoin => {
          tokens.push({
            ...stablecoin,
            chainId,
            chainName: chainConfig.name,
            isNative: false,
            contractAddress: stablecoin.address,
          });
        });
      }
    }
    return tokens;
  };

  const renderTokenItem = (token: TokenInfo) => {
    const isSelected = selectedToken?.address === token.address && selectedToken?.chainId === token.chainId;
    const chainColor = getChainColor(token.chainId);
    return (
      <TouchableOpacity
        key={`${token.chainId}-${token.address}`}
        style={[
          styles.tokenItem,
          {
            backgroundColor: itemBackgroundColor,
            borderColor: isSelected ? chainColor : borderColor,
            borderWidth: isSelected ? 2 : 1,
          }
        ]}
        onPress={() => {
          onTokenSelect(token);
          setModalVisible(false);
        }}
      >
        <View style={styles.tokenItemContent}>
          <View style={styles.tokenLeft}>
            <View style={[styles.tokenLogo, { borderColor: chainColor }]}> 
              {token.logoUri ? (
                <Image source={getLogoUri(token.logoUri)} style={styles.logoImage} />
              ) : (
                <View style={[styles.placeholderLogo, { backgroundColor: chainColor + '20' }]}> 
                  <Text style={[styles.placeholderText, { color: chainColor }]}> 
                    {token.symbol.charAt(0)}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.tokenInfo}>
              <Text style={[styles.tokenSymbol, { color: colors.text }]}> 
                {token.symbol}
              </Text>
              <Text style={[styles.tokenName, { color: colors.icon }]}> 
                {token.name}
              </Text>
              <View style={styles.tokenTags}>
                {token.isNative && (
                  <View style={[styles.tag, { backgroundColor: ChainColors.success + '20' }]}> 
                    <Text style={[styles.tagText, { color: ChainColors.success }]}>Native</Text>
                  </View>
                )}
                {token.isStablecoin && (
                  <View style={[styles.tag, { backgroundColor: ChainColors.info + '20' }]}> 
                    <Text style={[styles.tagText, { color: ChainColors.info }]}>Stable</Text>
                  </View>
                )}
                {token.contractAddress && !token.isNative && (
                  <View style={[styles.tag, { backgroundColor: chainColor + '20' }]}> 
                    <Text style={[styles.tagText, { color: chainColor }]}>{token.symbol}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
          <View style={styles.tokenRight}>
            {showBalance && (
              balancesLoading ? (
                <ActivityIndicator size="small" color={chainColor} />
              ) : (
                <Text style={[styles.tokenBalance, { color: colors.text }]}> 
                  {token.balance !== undefined ? token.balance : '0.00'}
                </Text>
              )
            )}
            <Text style={[styles.chainName, { color: colors.icon }]}> 
              {token.chainName}
            </Text>
            {isSelected && (
              <Ionicons name="checkmark-circle" size={20} color={chainColor} />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSelectedToken = () => {
    if (!selectedToken) return null;
    const chainColor = getChainColor(selectedToken.chainId);
    return (
      <TouchableOpacity
        style={[styles.selectedTokenContainer, { backgroundColor: colors.card, borderColor: chainColor }]}
        onPress={() => setModalVisible(true)}
      >
        <LinearGradient
          colors={[chainColor + '10', chainColor + '05'] as any}
          style={styles.selectedTokenGradient}
        >
          <View style={styles.selectedTokenContent}>
            <View style={styles.selectedTokenLeft}>
              <View style={[styles.selectedTokenLogo, { borderColor: chainColor }]}> 
                {selectedToken.logoUri ? (
                  <Image source={getLogoUri(selectedToken.logoUri)} style={styles.logoImage} />
                ) : (
                  <View style={[styles.placeholderLogo, { backgroundColor: chainColor + '20' }]}> 
                    <Text style={[styles.placeholderText, { color: chainColor }]}> 
                      {selectedToken.symbol.charAt(0)}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.selectedTokenInfo}>
                <Text style={[styles.selectedTokenSymbol, { color: colors.text }]}> 
                  {selectedToken.symbol}
                </Text>
                <Text style={[styles.selectedTokenChain, { color: colors.icon }]}> 
                  on {selectedToken.chainName}
                </Text>
              </View>
            </View>
            <View style={styles.selectedTokenRight}>
              {showBalance && (
                balancesLoading ? (
                  <ActivityIndicator size="small" color={chainColor} />
                ) : (
                  <Text style={[styles.selectedTokenBalance, { color: colors.text }]}> 
                    {selectedToken.balance !== undefined ? selectedToken.balance : '0.00'}
                  </Text>
                )
              )}
              <Ionicons name="chevron-down" size={20} color={colors.icon} />
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, style]}>
      {renderSelectedToken()}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: backgroundColor }]}> 
          <LinearGradient
            colors={getChainGradient(selectedChain) as any}
            style={styles.modalHeader}
          >
            <View style={styles.modalHeaderContent}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Select Token</Text>
              <View style={styles.placeholder} />
            </View>
          </LinearGradient>
          <ScrollView style={styles.tokenList} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={getChainColor(selectedChain)} />
                <Text style={[styles.loadingText, { color: colors.text }]}> 
                  Loading tokens...
                </Text>
              </View>
            ) : (
              availableTokens.map(renderTokenItem)
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  selectedTokenContainer: {
    borderRadius: 16,
    borderWidth: 2,
    overflow: 'hidden',
  },
  selectedTokenGradient: {
    padding: 16,
  },
  selectedTokenContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedTokenLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectedTokenLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    overflow: 'hidden',
    marginRight: 12,
  },
  selectedTokenInfo: {
    flex: 1,
  },
  selectedTokenSymbol: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  selectedTokenChain: {
    fontSize: 14,
    marginTop: 2,
  },
  selectedTokenRight: {
    alignItems: 'flex-end',
  },
  selectedTokenBalance: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    paddingTop: 60,
    paddingBottom: 20,
  },
  modalHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  placeholder: {
    width: 32,
  },
  tokenList: {
    flex: 1,
    padding: 16,
  },
  tokenItem: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  tokenItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  tokenLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tokenLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
    marginRight: 12,
  },
  logoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholderLogo: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  tokenInfo: {
    flex: 1,
  },
  tokenSymbol: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  tokenName: {
    fontSize: 14,
    marginTop: 2,
  },
  tokenTags: {
    flexDirection: 'row',
    marginTop: 4,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  tokenRight: {
    alignItems: 'flex-end',
  },
  tokenBalance: {
    fontSize: 14,
    fontWeight: '600',
  },
  chainName: {
    fontSize: 12,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    marginTop: 12,
  },
}); 