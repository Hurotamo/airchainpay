import { useState, useEffect } from 'react';
import { BluetoothManager } from '../../bluetooth/BluetoothManager';

export function useBLEManager() {
  const [manager, setManager] = useState<BluetoothManager | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [bleStatus, setBleStatus] = useState<{
    available: boolean;
    error: string | null;
    platform: string;
    nativeModuleFound: boolean;
    permissionsGranted: boolean;
    state: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    
    const initializeBLE = async () => {
      try {
        console.log('[useBLEManager] Creating BluetoothManager...');
        setIsInitializing(true);
        setError(null);
        
        const bleManager = BluetoothManager.getInstance();
        
        if (mounted) {
          setManager(bleManager);
          console.log('[useBLEManager] BluetoothManager created successfully');
          
          // Get initial BLE status
          try {
            const status = await bleManager.getBleStatus();
            if (mounted) {
              setBleStatus(status);
            }
          } catch (statusError) {
            console.warn('[useBLEManager] Error getting BLE status:', statusError);
          }
        }
        
        return () => {
          console.log('[useBLEManager] Destroying BluetoothManager...');
          bleManager.destroy();
        };
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setManager(null);
        }
      } finally {
        if (mounted) {
          setIsInitializing(false);
        }
      }
    };

    initializeBLE();

    return () => {
      mounted = false;
    };
  }, []);

  // Function to refresh BLE status
  const refreshBleStatus = async () => {
    if (manager) {
      try {
        const status = await manager.getBleStatus();
        setBleStatus(status);
      } catch (error) {
        console.warn('[useBLEManager] Error refreshing BLE status:', error);
      }
    }
  };

  return { 
    manager, 
    error, 
    isInitializing,
    bleStatus,
    refreshBleStatus
  };
} 