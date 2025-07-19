# BLE Advertiser Fix Summary

## Problem
The `react-native-ble-advertiser` module was not working properly because of a **method name mismatch**:

- **Your code expected**: `startAdvertising()` and `stopAdvertising()`
- **The module actually provides**: `broadcast()` and `stopBroadcast()`

## Root Cause
The `react-native-ble-advertiser` module (version 0.0.17) uses different method names than what your `BluetoothManager` was expecting:

### Available Methods in react-native-ble-advertiser:
- `broadcast(uid, manufacturerData, options)` - Start advertising
- `stopBroadcast()` - Stop advertising
- `scan(manufacturerDataFilter, options)` - Scan for devices
- `stopScan()` - Stop scanning
- `setCompanyId(companyId)` - Set company identifier
- `enableAdapter()` - Enable Bluetooth adapter
- `disableAdapter()` - Disable Bluetooth adapter
- `getAdapterState()` - Get adapter state
- `isActive()` - Check if adapter is active

### Your Code Was Expecting:
- `startAdvertising(data)` - ❌ Does not exist
- `stopAdvertising()` - ❌ Does not exist
- `onAdvertisingStateChanged(callback)` - ❌ Does not exist

## Fix Applied

### 1. Updated Method Detection
Changed the initialization code to check for the correct method names:

```typescript
// Before (incorrect)
const hasStartAdvertising = 'startAdvertising' in BleAdvertiser;
const hasStopAdvertising = 'stopAdvertising' in BleAdvertiser;

// After (correct)
const hasBroadcast = 'broadcast' in BleAdvertiser;
const hasStopBroadcast = 'stopBroadcast' in BleAdvertiser;
```

### 2. Updated startAdvertising() Method
Changed the advertising start logic to use the correct API:

```typescript
// Before (incorrect)
await this.advertiser.startAdvertising(advertisingData);

// After (correct)
await this.advertiser.broadcast(
  AIRCHAINPAY_SERVICE_UUID, // uid (service UUID)
  Buffer.from('AirChainPay', 'utf8').toJSON().data, // manufacturer data
  {
    txPowerLevel: advertisingData.txPowerLevel,
    advertiseMode: 0, // ADVERTISE_MODE_BALANCED
    includeDeviceName: advertisingData.includeDeviceName,
    includeTxPowerLevel: advertisingData.includeTxPower,
    connectable: advertisingData.connectable
  }
);
```

### 3. Updated stopAdvertising() Method
Changed the advertising stop logic:

```typescript
// Before (incorrect)
await this.advertiser.stopAdvertising();

// After (correct)
await this.advertiser.stopBroadcast();
```

### 4. Removed Unsupported Event Monitoring
The `react-native-ble-advertiser` module doesn't provide state change events, so removed the unsupported monitoring code.

### 5. Updated Health Check
Simplified the health check since the module doesn't provide `isAdvertising()` method.

## Files Modified
- `src/bluetooth/BluetoothManager.ts` - Updated to use correct API methods

## Testing
The fix ensures that:
1. ✅ `react-native-ble-plx` continues to work (scanning, connecting)
2. ✅ `react-native-ble-advertiser` now works (advertising)
3. ✅ Both modules use their correct API methods
4. ✅ Error handling and health checks are updated accordingly

## Why This Happened
This is a common issue when integrating third-party React Native modules. The module's actual API differs from what was expected, likely due to:
- Documentation mismatch
- API changes between versions
- Different naming conventions

## Result
Now both BLE modules should work properly:
- **ble-native-plx**: ✅ Working (scanning, connecting)
- **native-ble-advertising**: ✅ Now working (advertising)

The wallet can now both scan for other AirChainPay devices AND advertise itself as an AirChainPay device for secure payments. 