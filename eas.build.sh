# Install EAS CLI globally
npm install -g @expo/eas-cli

# Login to your Expo account
eas login

# Configure EAS (if not already done)
eas build:configure

# Build APK for Android
eas build --platform android --profile preview

# Build APK for production
eas build --platform android --profile production

# Build APK for development
eas build --platform android --profile development