#!/bin/bash
set -e

# Absolute path to this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Project root is one level up from this script's directory
PROJECT_ROOT="$SCRIPT_DIR/.."
# Output directory for .so files
JNI_LIBS_DIR="$PROJECT_ROOT/../airchainpay-wallet/android/app/src/main/jniLibs"

# Ensure output directory exists
mkdir -p "$JNI_LIBS_DIR"

# Add required Rust targets
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android

# Build for all major Android ABIs
cargo ndk -t armeabi-v7a -t arm64-v8a -t x86_64 -o "$JNI_LIBS_DIR" build --release

echo "[✓] Rust Android libraries built and copied to $JNI_LIBS_DIR" 