# AirChainPay Wallet - Development Quick Reference

## Essential Commands

### Project Setup
```bash
# Install dependencies
npm install

# iOS dependencies (macOS only)
cd ios && pod install && cd ..

# Start development server
npm start

# Run on device/emulator
npm run android    # Android
npm run ios        # iOS (macOS only)
```

### Development Workflow
```bash
# Start with debugging
npm run start-dev

# Clear Metro cache
npx react-native start --reset-cache

# Reset project (clean build)
npm run reset-project
```

### Testing
```bash
# Run all tests
npm test

# Run specific test
npm test -- --testNamePattern="BLE"

# Test BLE functionality
npm run test-ble-manager
npm run test-ble-android
npm run test-ble-ios
```

### Debugging
```bash
# Fix common BLE issues
npm run fix-ble-issues

# Debug wallet creation
npm run debug-wallet-creation

# Test APK readiness
npm run test-apk-readiness
```

## File Structure Quick Reference

### Key Files
```
app/
├── index.tsx              # Main app entry
├── (tabs)/
│   ├── index.tsx          # Home screen
│   ├── ble-payment.tsx    # BLE payment
│   ├── qr-pay.tsx         # QR payment
│   ├── send-payment.tsx   # Send payment
│   ├── receive-payment.tsx # Receive payment
│   ├── tx-history.tsx     # Transaction history
│   └── settings.tsx       # Settings
└── import-wallet.tsx      # Wallet import

src/
├── services/
│   ├── PaymentService.ts      # Payment orchestration
│   ├── TransactionService.ts  # Transaction management
│   ├── BlockchainTransactionService.ts # Blockchain ops
│   └── transports/
│       ├── BLETransport.ts    # BLE transport
│       ├── QRTransport.ts     # QR transport
│       └── OnChainTransport.ts # On-chain transport
├── wallet/
│   ├── MultiChainWalletManager.ts # Multi-chain wallet
│   └── TokenWalletManager.ts      # Token operations
├── components/
│   ├── ChainSelector.tsx      # Chain selection
│   ├── TokenSelector.tsx      # Token selection
│   ├── QRCodeScanner.tsx      # QR scanning
│   └── MultiTokenBalanceView.tsx # Balance display
├── utils/
│   ├── crypto/
│   │   ├── WalletEncryption.ts # Wallet encryption
│   │   └── BLESecurity.ts      # BLE security
│   ├── TransactionBuilder.ts   # Transaction building
│   ├── SecureStorageService.ts # Hardware-backed secure storage
│   └── StorageMigration.ts     # Migration utility
└── constants/
    ├── config.ts              # App configuration
    ├── contract.ts            # Contract addresses
    └── abi.ts                 # Contract ABIs
```

## Common Development Tasks

### Adding a New Blockchain Network

1. **Add network configuration** (`src/constants/config.ts`):
```typescript
export const NEW_NETWORK = {
  chainId: 1234,
  name: 'New Network',
  rpcUrl: 'https://rpc.example.com',
  blockExplorer: 'https://explorer.example.com',
  nativeCurrency: {
    name: 'New Token',
    symbol: 'NEW',
    decimals: 18
  }
}
```

2. **Add to supported networks**:
```typescript
export const SUPPORTED_NETWORKS = [
  // ... existing networks
  NEW_NETWORK
]
```

3. **Update wallet manager** (`src/wallet/MultiChainWalletManager.ts`):
```typescript
async createWallet(chainId: ChainId): Promise<Wallet> {
  // Add support for new chainId
}
```

### Adding a New Payment Method

1. **Create transport class** (`src/services/transports/NewTransport.ts`):
```typescript
export class NewTransport extends BaseTransport {
  async sendPayment(transaction: Transaction): Promise<PaymentResult> {
    // Implementation
  }
  
  async receivePayment(): Promise<PaymentResult> {
    // Implementation
  }
}
```

2. **Register transport** (`src/services/PaymentService.ts`):
```typescript
private transports: Map<TransportType, BaseTransport> = new Map([
  // ... existing transports
  [TransportType.NEW, new NewTransport()]
])
```

3. **Add UI component** (`app/new-payment.tsx`):
```typescript
export default function NewPaymentScreen() {
  // UI implementation
}
```

### Debugging BLE Issues

1. **Check device permissions**:
```typescript
// In src/utils/PermissionsHelper.ts
await requestBluetoothPermissions()
```

2. **Test BLE connection**:
```bash
npm run test-ble-manager
```

3. **Fix common issues**:
```bash
npm run fix-ble-issues
```

### Testing Transactions

1. **Create test transaction**:
```typescript
const testTransaction: Transaction = {
  to: '0x...',
  value: '1000000000000000000', // 1 ETH
  chainId: 1,
  type: TransportType.ON_CHAIN
}
```

2. **Test payment flow**:
```typescript
const paymentService = new PaymentService()
const result = await paymentService.sendPayment(testTransaction)
```

### Adding New UI Components

1. **Create component** (`src/components/NewComponent.tsx`):
```typescript
import React from 'react'
import { ThemedView, ThemedText } from './ThemedView'

interface Props {
  // Component props
}

export const NewComponent: React.FC<Props> = ({ ... }) => {
  return (
    <ThemedView>
      <ThemedText>New Component</ThemedText>
    </ThemedView>
  )
}
```

2. **Use themed components**:
```typescript
// Always use themed components for consistency
<ThemedView>
<ThemedText>
<ThemeToggle />
```

## Environment Configuration

### Development Environment
```bash
# .env.development
API_URL=http://localhost:3000
RPC_URL_MAINNET=https://mainnet.infura.io/v3/YOUR_KEY
RPC_URL_TESTNET=https://goerli.infura.io/v3/YOUR_KEY
DEBUG_MODE=true
```

### Production Environment
```bash
# .env.production
API_URL=https://api.airchainpay.com
RPC_URL_MAINNET=https://mainnet.infura.io/v3/PROD_KEY
RPC_URL_TESTNET=https://goerli.infura.io/v3/PROD_KEY
DEBUG_MODE=false
```

## Common Error Solutions

### Metro Bundler Issues
```bash
# Clear cache
npx react-native start --reset-cache

# Reset project
npm run reset-project
```

### Android Build Issues
```bash
# Clean Android build
cd android && ./gradlew clean && cd ..

# Check Gradle version
./gradlew --version
```

### iOS Build Issues
```bash
# Clean iOS build
cd ios && xcodebuild clean && cd ..

# Reinstall pods
cd ios && pod install && cd ..
```

### BLE Connection Issues
```bash
# Fix BLE issues
npm run fix-ble-issues

# Test BLE functionality
npm run test-ble-manager
```

### Transaction Failures
```typescript
// Check gas estimation
const gasEstimate = await walletManager.estimateGas(transaction)

// Check balance
const balance = await walletManager.getBalance(chainId, tokenAddress)

// Validate transaction
const isValid = await transactionValidator.validate(transaction)
```

## Performance Tips

### Memory Management
```typescript
// Use React.memo for expensive components
export const ExpensiveComponent = React.memo(({ data }) => {
  // Component implementation
})

// Clean up subscriptions
useEffect(() => {
  const subscription = someService.subscribe()
  return () => subscription.unsubscribe()
}, [])
```

### Bundle Optimization
```typescript
// Lazy load components
const LazyComponent = React.lazy(() => import('./LazyComponent'))

// Use dynamic imports
const loadModule = async () => {
  const module = await import('./HeavyModule')
  return module.default
}
```

### Image Optimization
```typescript
// Use appropriate image formats
<Image 
  source={require('./image.webp')}
  resizeMode="contain"
  style={{ width: 100, height: 100 }}
/>
```

## Security Checklist

### Before Committing
- [ ] No API keys in code
- [ ] No sensitive data in logs
- [ ] Input validation implemented
- [ ] Error handling in place
- [ ] Security tests passing

### For Production
- [ ] Environment variables configured
- [ ] SSL certificates valid
- [ ] API endpoints secured
- [ ] Rate limiting implemented
- [ ] Audit trail enabled

## Git Workflow

### Feature Development
```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push and create PR
git push origin feature/new-feature
```

### Commit Message Format
```
type(scope): description

feat: add new payment method
fix: resolve BLE connection issue
docs: update API documentation
test: add unit tests for payment service
refactor: improve wallet manager performance
```

## Monitoring and Debugging

### Logging
```typescript
import { Logger } from '../utils/Logger'

// Use structured logging
Logger.info('Payment initiated', { 
  amount: '1.0 ETH',
  recipient: '0x...',
  transport: 'BLE'
})

Logger.error('Transaction failed', error)
```

### Performance Monitoring
```typescript
// Track transaction times
const startTime = Date.now()
const result = await paymentService.sendPayment(transaction)
const duration = Date.now() - startTime

Logger.info('Transaction completed', { duration })
```

---

*This quick reference should be updated as the project evolves. Keep it handy for common development tasks.* 