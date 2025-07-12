#!/bin/bash

# Find the Android SDK path
if [ -z "$ANDROID_SDK_ROOT" ]; then
  if [ -d "$HOME/Library/Android/sdk" ]; then
    ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
  elif [ -d "$HOME/Android/Sdk" ]; then
    ANDROID_SDK_ROOT="$HOME/Android/Sdk"
  else
    echo "❌ Could not find Android SDK. Please set ANDROID_SDK_ROOT environment variable."
    exit 1
  fi
fi

EMULATOR_PATH="$ANDROID_SDK_ROOT/emulator/emulator"
AVD_NAME="Medium_Phone_API_36"

# Check if emulator exists
if [ ! -f "$EMULATOR_PATH" ]; then
  echo "❌ Emulator not found at $EMULATOR_PATH"
  exit 1
fi

# Kill any running emulators
pkill -f "qemu-system-" || true
pkill -f "emulator" || true

echo "🚀 Starting emulator with optimized settings..."
"$EMULATOR_PATH" \
  -avd $AVD_NAME \
  -no-boot-anim \
  -gpu host \
  -memory 2048 \
  -no-snapshot \
  -no-audio \
  -no-snapshot-save &

echo "⏳ Waiting for emulator to boot..."
"$ANDROID_SDK_ROOT/platform-tools/adb" wait-for-device

echo "✅ Emulator started successfully!"
echo "Now run: npm run start-fixed"
