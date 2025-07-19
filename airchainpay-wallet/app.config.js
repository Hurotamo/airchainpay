// If you want to extend from app.json, you can import it here:
// const appJson = require('./app.json');

// Expo configuration for AirChainPay Wallet
module.exports = {
  expo: {
    name: "AirChainPay Wallet",
    slug: "airchainpay-wallet",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "airchainpay",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#000000"
    },
    assetBundlePatterns: ["**/*"],
    plugins: [
      "expo-sqlite",
      [
        "react-native-ble-plx",
        {
          "isBackgroundEnabled": true,
          "modes": ["peripheral", "central"]
        }
      ]
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.airchainpay.wallet",
      buildNumber: "1",
      infoPlist: {
        NSCameraUsageDescription: "We need access to your camera to scan QR codes for payments and wallet imports.",
        NSBluetoothAlwaysUsageDescription: "We need access to Bluetooth to enable secure contactless payments.",
        NSBluetoothPeripheralUsageDescription: "We need access to Bluetooth to enable secure contactless payments."
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#000000"
      },
      package: "com.airchainpay.wallet",
      versionCode: 1,
      permissions: [
        "CAMERA",
        "BLUETOOTH",
        "BLUETOOTH_ADMIN",
        "BLUETOOTH_SCAN",
        "BLUETOOTH_CONNECT",
        "BLUETOOTH_ADVERTISE",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "USE_BIOMETRIC",
        "USE_FINGERPRINT"
      ]
    },
    web: {
      favicon: "./assets/images/favicon.png"
    },
    extra: {
      eas: {
        projectId: "6ddaf098-0540-4a9e-befa-09814a2e6e45"
      },
       BASE_SEPOLIA_RPC_URL: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      CORE_TESTNET_RPC_URL: process.env.CORE_TESTNET_RPC_URL || "https://rpc.test2.btcs.network",
      BASESCAN_API_KEY: process.env.BASESCAN_API_KEY || "",
      ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY || "",
      INFURA_PROJECT_ID: process.env.INFURA_PROJECT_ID || "",
      INFURA_PROJECT_SECRET: process.env.INFURA_PROJECT_SECRET || "",
      ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY || "",
      QUICKNODE_API_KEY: process.env.QUICKNODE_API_KEY || "",
      RELAY_SERVER_URL: process.env.RELAY_SERVER_URL || "http://localhost:4000",
      RELAY_API_KEY: process.env.RELAY_API_KEY || ""
    }
  }
}; 