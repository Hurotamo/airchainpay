import { Platform, Alert, Linking, PermissionsAndroid } from 'react-native';

/**
 * Utility functions for handling Android permissions and settings redirects
 */
export class PermissionUtils {
  
  /**
   * Check if a permission is set to "never ask again"
   */
  static async isPermissionNeverAskAgain(permission: string): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }

    try {
      const apiLevel = parseInt(Platform.Version.toString(), 10);
      if (apiLevel >= 31) { // Android 12+
        // Cast to any to handle the permission string
        const result = await PermissionsAndroid.check(permission as any);
        // If permission is not granted, it might be "never ask again"
        return !result;
      }
    } catch (error) {
      console.warn('[PermissionUtils] Error checking permission status:', error);
    }
    
    return false;
  }

  /**
   * Show settings redirect dialog for BLUETOOTH_ADVERTISE permission
   */
  static showBluetoothAdvertiseSettingsDialog(): void {
    Alert.alert(
      'Bluetooth Permission Required',
      'BLUETOOTH_ADVERTISE permission is required for optimal BLE advertising. Please enable it in your device settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Open Settings', 
          onPress: () => PermissionUtils.openAppSettings()
        }
      ]
    );
  }

  /**
   * Open app settings page
   */
  static openAppSettings(): void {
    if (Platform.OS === 'android') {
      Linking.openSettings();
    } else if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    }
  }

  /**
   * Show comprehensive permission guidance
   */
  static showPermissionGuidance(missingPermissions: string[]): void {
    const hasBluetoothAdvertise = missingPermissions.includes(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE
    );

    if (hasBluetoothAdvertise) {
      Alert.alert(
        'Bluetooth Permissions',
        'Some Bluetooth permissions are missing. For optimal BLE advertising:\n\n' +
        '1. Go to Settings > Apps > AirChainPay\n' +
        '2. Tap "Permissions"\n' +
        '3. Enable "Bluetooth Advertise"\n\n' +
        'Advertising will still work without this permission, but may be limited.',
        [
          { text: 'Continue', style: 'default' },
          { 
            text: 'Open Settings', 
            onPress: () => PermissionUtils.openAppSettings()
          }
        ]
      );
    }
  }

  /**
   * Get user-friendly permission names
   */
  static getPermissionDisplayName(permission: string): string {
    const permissionNames: { [key: string]: string } = {
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: 'Bluetooth Scan',
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: 'Bluetooth Connect',
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE]: 'Bluetooth Advertise',
      [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]: 'Location',
      [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]: 'Location'
    };

    return permissionNames[permission] || permission;
  }

  /**
   * Check if all critical BLE permissions are granted
   */
  static async checkCriticalBLEPermissions(): Promise<{
    granted: boolean;
    missing: string[];
    needsSettingsRedirect: boolean;
  }> {
    if (Platform.OS !== 'android') {
      return { granted: true, missing: [], needsSettingsRedirect: false };
    }

    const criticalPermissions = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
    ];

    const missing: string[] = [];
    let needsSettingsRedirect = false;

    for (const permission of criticalPermissions) {
      try {
        const granted = await PermissionsAndroid.check(permission);
        if (!granted) {
          missing.push(permission);
          
          // Check if it's set to "never ask again"
          const neverAskAgain = await this.isPermissionNeverAskAgain(permission);
          if (neverAskAgain) {
            needsSettingsRedirect = true;
          }
        }
      } catch (error) {
        console.warn(`[PermissionUtils] Error checking ${permission}:`, error);
        missing.push(permission);
      }
    }

    return {
      granted: missing.length === 0,
      missing,
      needsSettingsRedirect
    };
  }
} 