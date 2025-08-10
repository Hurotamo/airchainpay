# BLE Device Scanner

This component provides a clean, user-friendly interface for scanning and discovering nearby Bluetooth Low Energy (BLE) devices that are advertising payment availability.

## Features

- **Automatic Device Discovery**: Scans for nearby BLE devices automatically
- **Payment Data Display**: Shows payment information when available (amount, token, wallet address)
- **Signal Strength**: Displays RSSI values to help users identify nearby devices
- **Real-time Updates**: Refreshes device list automatically during scanning
- **Error Handling**: Graceful handling of Bluetooth permissions and availability
- **Dark/Light Theme Support**: Automatically adapts to the app's theme

## Usage

### Basic Implementation

```tsx
import BLEDeviceScanner from '../components/BLEDeviceScanner';

// In your component
<BLEDeviceScanner
  onDeviceSelect={(device, paymentData) => {
    // Handle device selection
    console.log('Selected device:', device.name);
    console.log('Payment data:', paymentData);
  }}
  autoScan={true}
  scanTimeout={30000}
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onDeviceSelect` | `(device: Device, paymentData?: BLEPaymentData) => void` | Required | Callback when a device is selected |
| `autoScan` | `boolean` | `false` | Whether to start scanning automatically |
| `scanTimeout` | `number` | `30000` | Scan timeout in milliseconds |

### Device Selection

When a user taps on a device, the `onDeviceSelect` callback is triggered with:

- `device`: The BLE device object from react-native-ble-plx
- `paymentData`: Optional payment information if the device is advertising payment availability

### Payment Data Structure

```typescript
interface BLEPaymentData {
  walletAddress: string;
  amount: string;
  token: string;
  chainId: string;
}
```

## Integration with BLEPaymentScreen

The scanner is now integrated into the main BLE payment screen, replacing the previous manual scanning implementation. Users can:

1. **Scan Tab**: Discover nearby payment devices
2. **Advertise Tab**: Advertise their own payment availability
3. **Device Selection**: Tap on discovered devices to initiate payments

## Styling

The component automatically adapts to the app's theme context and provides:

- Clean, modern card-based design
- Proper spacing and typography
- Theme-aware colors and contrast
- Responsive layout for different screen sizes

## Error States

The component handles various error states gracefully:

- **Bluetooth Not Available**: Shows when BLE is not supported
- **Permissions Required**: Prompts for Bluetooth permissions
- **Scan Errors**: Displays scan-related errors with retry options
- **Empty State**: Shows helpful message when no devices are found

## Performance

- Efficient device list rendering with FlatList
- Automatic cleanup of scan resources
- Debounced refresh controls
- Memory-efficient device storage

## Dependencies

- `react-native-ble-plx`: Core BLE functionality
- `@expo/vector-icons`: Icon library
- React Native core components
- Custom theme context hook

## Example Output

```
┌─────────────────────────────────────┐
│ 🔍 Scan for Payment Devices        │
├─────────────────────────────────────┤
│ [Start Scan] [Stop Scan]           │
│                                     │
│ 📱 iPhone 14 Pro                   │
│ ID: 00:11:22:33:44:55             │
│ 💰 25.00 USDC                      │
│ 0x1234...5678                      │
│ Signal: -45 dBm                    │
│                                     │
│ 📱 Samsung Galaxy S23              │
│ ID: AA:BB:CC:DD:EE:FF             │
│ 💰 10.50 USDT                      │
│ 0x9876...4321                      │
│ Signal: -62 dBm                    │
└─────────────────────────────────────┘
```

## Troubleshooting

### Common Issues

1. **No devices found**: Ensure Bluetooth is enabled and devices are advertising
2. **Permission errors**: Grant Bluetooth permissions in device settings
3. **Scan timeout**: Increase `scanTimeout` value for longer scans
4. **Performance issues**: Use `autoScan={false}` for manual control

### Debug Mode

Enable debug logging by setting the `DEBUG` environment variable:

```bash
export DEBUG=true
npm start
```

## Future Enhancements

- Device filtering by signal strength
- Payment amount filtering
- Device history and favorites
- Advanced scanning options
- Background scanning support
