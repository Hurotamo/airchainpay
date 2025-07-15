# AirChainPay Wallet - Collaborator Guide

## Overview

The AirChainPay Wallet is a React Native mobile application that enables secure cryptocurrency payments through multiple transport methods including Bluetooth Low Energy (BLE), QR codes, and on-chain transactions. This guide will help you understand the project structure and how to effectively collaborate on this codebase.

## Project Structure

### Core Directories

```
airchainpay-wallet/
├── app/                    # Main app screens and navigation
├── src/                    # Core application logic
│   ├── components/         # Reusable UI components
│   ├── services/          # Business logic and API services
│   ├── wallet/            # Wallet management logic
│   ├── utils/             # Utility functions and helpers
│   ├── types/             # TypeScript type definitions
│   └── constants/         # App constants and configurations
├── components/            # Global UI components
├── android/               # Android-specific code
├── ios/                   # iOS-specific code
└── scripts/               # Development and deployment scripts
```

## Getting Started

### Prerequisites

1. **Node.js** (v18 or higher)
2. **React Native CLI** or **Expo CLI**
3. **Android Studio** (for Android development)
4. **Xcode** (for iOS development, macOS only)
5. **Metro bundler**

### Installation

```bash
# Navigate to the wallet directory
cd airchainpay-wallet

# Install dependencies
npm install

# For iOS (macOS only)
cd ios && pod install && cd ..
```

### Development Setup

```bash
# Start the development server
npm start

# Run on Android
npm run android

# Run on iOS (macOS only)
npm run ios
```

## Key Features & Components

### 1. Multi-Transport Payment System

The wallet supports three main payment transport methods:

- **BLE (Bluetooth Low Energy)**: For proximity-based payments
- **QR Code**: For contactless payments
- **On-Chain**: For traditional blockchain transactions

### 2. Multi-Chain Support

The wallet manages multiple blockchain networks and tokens simultaneously.

### 3. Security Features

- Encrypted wallet storage
- Secure BLE communication
- Transaction signing and validation

## Development Workflow

### Code Organization

#### App Screens (`app/`)
- `index.tsx` - Main entry point
- `(tabs)/` - Tab-based navigation screens
- `ble-payment.tsx` - BLE payment interface
- `qr-pay.tsx` - QR code payment interface
- `send-payment.tsx` - Payment sending interface
- `receive-payment.tsx` - Payment receiving interface

#### Core Services (`src/services/`)
- `PaymentService.ts` - Payment processing logic
- `TransactionService.ts` - Transaction management
- `BlockchainTransactionService.ts` - Blockchain interactions
- `transports/` - Transport layer implementations

#### Wallet Management (`src/wallet/`)
- `MultiChainWalletManager.ts` - Multi-chain wallet operations
- `TokenWalletManager.ts` - Token-specific operations

### Adding New Features

#### 1. New Payment Method
```typescript
// Create new transport in src/services/transports/
export class NewTransport extends BaseTransport {
  async sendPayment(transaction: Transaction): Promise<PaymentResult> {
    // Implementation
  }
}
```

#### 2. New Blockchain Network
```typescript
// Add to src/constants/config.ts
export const NEW_NETWORK = {
  chainId: 1234,
  name: 'New Network',
  rpcUrl: 'https://rpc.example.com',
  // ... other config
};
```

#### 3. New UI Component
```typescript
// Create in src/components/
export const NewComponent: React.FC<Props> = ({ ... }) => {
  // Component implementation
};
```

## Testing

### Running Tests
```bash
# Run all tests
npm test

# Run specific test file
npm test -- --testNamePattern="BLE"

# Run with coverage
npm test -- --coverage
```

### Testing BLE Functionality
```bash
# Test BLE on Android
npm run test-ble-android

# Test BLE on iOS
npm run test-ble-ios
```

## Debugging

### Common Issues

#### 1. BLE Connection Issues
- Check device permissions
- Verify Bluetooth is enabled
- Use the BLE debugging scripts in `scripts/`

#### 2. Transaction Failures
- Check network connectivity
- Verify gas fees
- Review transaction logs

#### 3. Build Issues
```bash
# Clean and rebuild
npm run reset-project

# Fix common issues
npm run fix-ble-issues
```

### Debug Scripts

The `scripts/` directory contains helpful debugging tools:

- `fix-ble-issues.js` - Fixes common BLE problems
- `test-ble-manager.js` - Tests BLE functionality
- `debug-wallet-creation.js` - Debugs wallet creation
- `start-dev.js` - Starts development with debugging

## Deployment

### Building for Production

#### Android
```bash
# Build APK
eas build --platform android

# Build AAB (for Play Store)
eas build --platform android --profile production
```

#### iOS
```bash
# Build for iOS
eas build --platform ios
```

### Environment Configuration

Create environment-specific configs:
- `app.config.js` - Main configuration
- `eas.json` - EAS Build configuration

## Code Standards

### TypeScript
- Use strict TypeScript configuration
- Define proper interfaces for all data structures
- Avoid `any` types

### React Native
- Use functional components with hooks
- Implement proper error boundaries
- Follow React Native best practices

### Security
- Never log sensitive data
- Use secure storage for credentials
- Validate all inputs
- Implement proper error handling

## Collaboration Guidelines

### Git Workflow
1. Create feature branches from `main`
2. Use descriptive commit messages
3. Submit pull requests for review
4. Ensure all tests pass before merging

### Code Review Checklist
- [ ] Code follows project standards
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] Security considerations addressed
- [ ] Performance impact considered

### Communication
- Use GitHub Issues for bug reports
- Create feature requests with detailed descriptions
- Document API changes in comments

## Troubleshooting

### Common Development Issues

#### Metro Bundler Issues
```bash
# Clear Metro cache
npx react-native start --reset-cache
```

#### Android Build Issues
```bash
# Clean Android build
cd android && ./gradlew clean && cd ..
```

#### iOS Build Issues
```bash
# Clean iOS build
cd ios && xcodebuild clean && cd ..
```

### Getting Help

1. Check existing issues in the repository
2. Review the debugging scripts in `scripts/`
3. Consult the React Native documentation
4. Ask in team communication channels

## Security Considerations

### For Developers
- Never commit API keys or secrets
- Use environment variables for sensitive data
- Implement proper input validation
- Test security features thoroughly

### For Users
- Implement proper authentication
- Use secure storage for wallet data
- Validate all transactions
- Implement rate limiting

## Performance Optimization

### Best Practices
- Use React.memo for expensive components
- Implement proper list virtualization
- Optimize image loading
- Minimize bundle size

### Monitoring
- Use performance monitoring tools
- Track app crash rates
- Monitor transaction success rates
- Monitor BLE connection stability

## Future Development

### Planned Features
- Enhanced BLE security
- Additional blockchain networks
- Improved UI/UX
- Advanced transaction features

### Contributing to Roadmap
- Submit feature requests with detailed specifications
- Provide use cases and requirements
- Consider implementation complexity
- Discuss with the team before major changes

---

## Quick Reference

### Essential Commands
```bash
npm start          # Start development server
npm run android    # Run on Android
npm run ios        # Run on iOS
npm test           # Run tests
npm run fix-ble    # Fix BLE issues
```

### Key Files
- `app/index.tsx` - App entry point
- `src/services/PaymentService.ts` - Payment logic
- `src/wallet/MultiChainWalletManager.ts` - Wallet management
- `src/components/` - UI components
- `scripts/` - Development tools

### Important Constants
- `src/constants/config.ts` - App configuration
- `src/constants/contract.ts` - Contract addresses
- `src/constants/abi.ts` - Contract ABIs

---

*This guide should be updated as the project evolves. Please keep it current with any architectural changes or new features.* 