# Phase 1: Prebuild
# 1. Clears previous builds
rm -rf android/build
rm -rf android/app/build

# 2. Regenerates native code from app.config.js
expo prebuild --platform android

# 3. Updates Android project with new permissions
# - Merges AndroidManifest.xml changes
# - Updates build.gradle with new dependencies
# - Links native modules

# Phase 2: Gradle Build

# 4. Compiles native code
./gradlew assembleDebug

# 5. Packages APK with new permissions
# - Includes BLUETOOTH_ADVERTISE in manifest
# - Links react-native-ble-plx native code
# - Links react-native-ble-advertiser native code


# Phase 3: Installation
# 6. Installs APK on device/emulator
adb install app-debug.apk

# 7. Starts the app
adb shell am start -n com.airchainpay.wallet/.MainActivity



# Create a development build (one-time setup)
npx expo install expo-dev-client
npx expo run:android --variant debug

# Then use hot reload for JS changes
npx expo start --dev-client



