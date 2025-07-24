import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet, Animated, Easing, Image, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SUPPORTED_CHAINS, ChainConfig, STORAGE_KEYS } from '../constants/AppConfig';
import { secureStorage } from '../utils/SecureStorageService';
import { logger } from '../utils/Logger';
import { Colors, getChainColor, getChainGradient } from '../../constants/Colors';
import { useThemeContext } from '../../hooks/useThemeContext';
import { getNetworkLogo, getLogoUri } from '../constants/logos';

interface ChainSelectorProps {
  selectedChain: string;
  onChainChange: (chainId: string) => void;
  style?: StyleProp<ViewStyle>;
}

export const ChainSelector: React.FC<ChainSelectorProps> = ({
  selectedChain,
  onChainChange,
  style,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [chains] = useState(Object.values(SUPPORTED_CHAINS));
  const { colorScheme } = useThemeContext();
  const theme = colorScheme || 'light';
  const colors = Colors[theme];
  
  // Debug logging
  console.log('[ChainSelector] Props:', { selectedChain, chainsCount: chains.length });
  console.log('[ChainSelector] Available chains:', chains.map(c => c.id));
  
  // Animation values
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const modalSlideAnim = React.useRef(new Animated.Value(0)).current;

  const selectedChainConfig = SUPPORTED_CHAINS[selectedChain];

  const handleChainSelect = async (chainId: string) => {
    console.log('[ChainSelector] Selecting chain:', chainId);
    try {
      await secureStorage.setItem(STORAGE_KEYS.SELECTED_CHAIN, chainId);
      onChainChange(chainId);
      closeModal();
      logger.info(`[ChainSelector] Chain changed to: ${chainId}`);
    } catch (error) {
      console.error('[ChainSelector] Failed to save selected chain:', error);
      logger.error('[ChainSelector] Failed to save selected chain:', error);
    }
  };

  const openModal = () => {
    console.log('[ChainSelector] Opening modal...');
    setModalVisible(true);
    Animated.timing(modalSlideAnim, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const closeModal = () => {
    Animated.timing(modalSlideAnim, {
      toValue: 0,
      duration: 250,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setModalVisible(false);
    });
  };

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const getChainDisplayName = (config: ChainConfig) => {
    switch (config.id) {
      case 'base_sepolia':
        return 'Base Sepolia';
      case 'core_testnet':
        return 'Core Testnet';
      default:
        return config.name;
    }
  };

  const renderChainItem = ({ item, index }: { item: ChainConfig; index: number }) => {
    const isSelected = selectedChain === item.id;
    const chainColor = getChainColor(item.id);
    const logoUri = getLogoUri(getNetworkLogo(item.id));
    
    return (
      <Animated.View
        style={{
          opacity: modalSlideAnim,
          transform: [
            {
              translateY: modalSlideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [50 + index * 10, 0],
              }),
            },
          ],
        }}
      >
        <TouchableOpacity
          style={[
            styles.chainItem,
            { backgroundColor: colors.card, borderColor: colors.border },
            isSelected && { borderColor: chainColor, borderWidth: 2 },
          ]}
          onPress={() => handleChainSelect(item.id)}
          activeOpacity={0.8}
        >
          {isSelected && (
            <LinearGradient
              colors={[chainColor + '20', chainColor + '10']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          )}
          
          <View style={styles.chainItemContent}>
            <View style={styles.chainIcon}>
              <View style={[styles.iconContainer, { backgroundColor: chainColor + '20', borderColor: chainColor }]}>
                <Image 
                  source={logoUri} 
                  style={styles.networkLogo}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.chainInfo}>
                <Text style={[styles.chainName, { color: colors.text }]}>
                  {getChainDisplayName(item)}
                </Text>
                <Text style={[styles.chainSymbol, { color: colors.icon }]}>
                  {item.nativeCurrency.symbol} • {item.type.toUpperCase()}
                </Text>
              </View>
            </View>
            
            {isSelected && (
              <View style={[styles.selectedIndicator, { backgroundColor: chainColor }]}>
                <Ionicons name="checkmark" size={16} color="white" />
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const modalTranslateY = modalSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [400, 0],
  });

  const selectedLogoUri = getLogoUri(getNetworkLogo(selectedChain));

  return (
    <View style={[styles.container, style]}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity
          style={[
            styles.selectorButton, 
            { 
              backgroundColor: 'rgba(255, 255, 255, 0.15)', 
              borderColor: 'rgba(255, 255, 255, 0.3)',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 4,
              elevation: 5,
            }
          ]}
          onPress={openModal}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={0.8}
        >
          <View style={styles.selectedChainInfo}>
            <View style={styles.selectedChainIcon}>
              <View style={[styles.iconContainer, { backgroundColor: getChainColor(selectedChain) + '30', borderColor: getChainColor(selectedChain) }]}>
                <Image 
                  source={selectedLogoUri} 
                  style={styles.networkLogo}
                  resizeMode="contain"
                />
              </View>
              <View>
                <Text style={[styles.selectedChainName, { color: 'white' }]}>
                  {getChainDisplayName(selectedChainConfig)}
                </Text>
                <Text style={[styles.selectedChainSymbol, { color: 'rgba(255, 255, 255, 0.8)' }]}>
                  {selectedChainConfig?.nativeCurrency.symbol}
                </Text>
              </View>
            </View>
            <View style={styles.chevronContainer}>
              <Ionicons name="chevron-down" size={20} color="rgba(255, 255, 255, 0.8)" />
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={closeModal}
        statusBarTranslucent={true}
      >
        <View style={[styles.modalOverlay, { zIndex: 9999 }]}>
          <TouchableOpacity 
            style={styles.modalBackground} 
            activeOpacity={1} 
            onPress={closeModal}
          />
          <Animated.View
            style={[
              styles.modalContent,
              { backgroundColor: colors.background, zIndex: 10000 },
              {
                transform: [{ translateY: modalTranslateY }],
              },
            ]}
          >
            <LinearGradient
              colors={getChainGradient(selectedChain) as any}
              style={styles.modalHeader}
            >
              <View style={styles.modalHeaderContent}>
                <Text style={styles.modalTitle}>Select Network</Text>
                <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color="white" />
                </TouchableOpacity>
              </View>
            </LinearGradient>
            
            <FlatList
              data={chains}
              renderItem={renderChainItem}
              keyExtractor={(item) => item.id}
              style={styles.chainList}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.chainListContent}
            />
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  selectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 2,
    minHeight: 56,
  },
  selectedChainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectedChainIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
  },
  networkLogo: {
    width: 20,
    height: 20,
  },
  selectedChainName: {
    fontSize: 16,
    fontWeight: '600',
  },
  selectedChainSymbol: {
    fontSize: 12,
    marginTop: 2,
  },
  chevronContainer: {
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalBackground: {
    flex: 1,
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  modalHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chainList: {
    flex: 1,
  },
  chainListContent: {
    padding: 16,
  },
  chainItem: {
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  chainItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  chainIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  chainInfo: {
    flex: 1,
  },
  chainName: {
    fontSize: 16,
    fontWeight: '600',
  },
  chainSymbol: {
    fontSize: 12,
    marginTop: 2,
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// Chain selector hook
export const useSelectedChain = () => {
  const [selectedChain, setSelectedChain] = useState<string>('base_sepolia');

  const changeChain = useCallback((chainId: string) => {
    if (chainId in SUPPORTED_CHAINS) {
      setSelectedChain(chainId);
      logger.info(`[Chain] Changed to ${chainId}`);
    } else {
      logger.error(`[Chain] Unsupported chain: ${chainId}`);
    }
  }, []);

  return {
    selectedChain,
    changeChain,
    selectedChainConfig: SUPPORTED_CHAINS[selectedChain],
  };
}; 