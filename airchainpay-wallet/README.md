# AirChainPay Wallet

This is the React Native (Expo) mobile wallet for AirChainPay, supporting offline crypto payments via Bluetooth and secure local storage.

## Features
- Bluetooth (BLE) peer-to-peer transfer (react-native-ble-plx)
- **Hybrid secure key storage** (React Native Keychain + expo-secure-store fallback)
- Offline transaction queue (expo-sqlite)
- EVM wallet and signing (ethers.js)

## Secure Key Storage (Hybrid Approach)

AirChainPay Wallet uses a hybrid approach for secure storage of sensitive wallet data (private key, seed phrase, password):

- **Primary:** [React Native Keychain](https://github.com/oblador/react-native-keychain) is used for maximum security, supporting biometrics and device authentication.
- **Fallback:** [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/) is used if Keychain is unavailable or not supported on the device.

**How it works:**
- When storing or retrieving wallet secrets, the app tries Keychain first (with biometrics/device PIN if available).
- If Keychain is not available, it falls back to SecureStore.
- This ensures maximum compatibility and security across all devices.

**Benefits:**
- Maximum security for wallet secrets (biometrics, device PIN, hardware-backed storage)
- Works on all devices, even if Keychain is not available
- No secrets are ever synced to the cloud or leave the device

## Folder Structure
```
src/
  bluetooth/   # BLE logic
  storage/     # Secure/key storage logic
  wallet/      # EVM wallet logic (ethers)
  screens/     # App screens
  components/  # Shared UI components
  utils/       # Helpers
```

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the app:
   ```bash
   npx expo start
   ```

## BLE Permissions
- On Android, the app will request Bluetooth and location permissions at runtime.

## API Keys Configuration

To enable real-time transaction history and enhanced blockchain functionality, you'll need to set up API keys. Create a `.env` file in the root directory with the following variables:

```env
# Blockchain RPC URLs
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
CORE_TESTNET_RPC_URL=https://rpc.test2.btcs.network

# Block Explorer API Keys
BASESCAN_API_KEY=your_basescan_api_key
ETHERSCAN_API_KEY=your_etherscan_api_key

# RPC Provider API Keys
INFURA_PROJECT_ID=your_infura_project_id
INFURA_PROJECT_SECRET=your_infura_project_secret
ALCHEMY_API_KEY=your_alchemy_api_key
QUICKNODE_API_KEY=your_quicknode_api_key

# Relay Server
RELAY_SERVER_URL=http://localhost:4000
RELAY_API_KEY=your_relay_api_key
```

### Getting API Keys

1. **Base Sepolia RPC**:
   - Sign up at [Infura](https://infura.io), [Alchemy](https://alchemy.com), or [QuickNode](https://quicknode.com)
   - Create a new project and get the Base Sepolia RPC URL
   - Default public RPC will be used if not provided

2. **Block Explorer APIs**:
   - Get Basescan API key from [Basescan](https://basescan.org/apis)
   - Get Etherscan API key from [Etherscan](https://etherscan.io/apis)
   - Required for detailed transaction history

3. **RPC Providers**:
   - Choose one or more providers:
     - [Infura](https://infura.io): Get Project ID and Secret
     - [Alchemy](https://alchemy.com): Get API Key
     - [QuickNode](https://quicknode.com): Get API Key
   - Recommended for production use

4. **Relay Server**:
   - For local development, use default values
   - For production, set up your own relay server

### Development vs Production

- Development:
  - Public RPCs work fine for testing
  - No API keys required to start
  - Rate limits may apply

- Production:
  - Use dedicated RPC providers
  - Set up all API keys
  - Configure custom relay server

### Security Notes

- Never commit `.env` file to git
- Keep API keys secure
- Use environment variables in production
- Rotate keys periodically
- Monitor API usage

---

For more, see the main AirChainPay monorepo.

# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.


 npm run android
- npm run ios
- npm run web