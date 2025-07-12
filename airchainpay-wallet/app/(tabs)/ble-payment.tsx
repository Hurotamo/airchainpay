import * as React from 'react';
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { MultiChainWalletManager } from '../../src/wallet/MultiChainWalletManager';
import { logger } from '../../src/utils/Logger';
import BLEPaymentScreen from '../../src/screens/BLEPaymentScreen';
import WalletSetupScreen from '../../src/components/WalletSetupScreen';

function BLEPaymentTab() {
  const [hasWallet, setHasWallet] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkWalletStatus = useCallback(async () => {
    try {
      const walletExists = await MultiChainWalletManager.getInstance().hasWallet();
      setHasWallet(walletExists);
    } catch (error) {
      logger.error('Failed to check wallet status:', error);
      setHasWallet(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkWalletStatus();
    }, [checkWalletStatus])
  );

  const handleWalletCreated = () => {
    checkWalletStatus();
  };

  if (loading) {
    return null;
  }

  if (!hasWallet) {
    return (
      <WalletSetupScreen
        onWalletCreated={handleWalletCreated}
        title="Payment"
        subtitle="Create or import a wallet to use Bluetooth payments"
      />
    );
  }

  return <BLEPaymentScreen />;
}

export default BLEPaymentTab;