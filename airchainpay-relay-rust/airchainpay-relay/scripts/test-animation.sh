#!/bin/bash

# AirChainPay Logo Animation Test Script
# 
# This script allows you to test different animation styles for the ASCII art logo.
# Usage:
#   ./scripts/test-animation.sh [style]
# 
# Styles: full, simple, static, matrix

set -e

# ANSI color codes for console output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Logging function
log() {
    local message="$1"
    local color="${2:-NC}"
    echo -e "${!color}${message}${NC}"
}

# Show usage
show_usage() {
    log "AirChainPay Logo Animation Test Script" BOLD
    log ""
    log "Usage: $0 [style]" YELLOW
    log ""
    log "Available styles:" BLUE
    log "  full    - Full animation with typing, color cycling, and pulse effects" CYAN
    log "  simple  - Quick typing effect with brief color cycle" CYAN
    log "  static  - Static display (no animation)" CYAN
    log "  matrix  - Matrix-style green effect" CYAN
    log ""
    log "Examples:" BLUE
    log "  $0 full" CYAN
    log "  $0 simple" CYAN
    log "  $0 static" CYAN
    log "  $0 matrix" CYAN
    log ""
    log "Environment variable:" BLUE
    log "  ANIMATION_STYLE - Set the default animation style" CYAN
}

# Check if we're in the right directory
check_directory() {
    if [[ ! -f "Cargo.toml" ]]; then
        log "Error: Please run this script from the airchainpay-relay directory" RED
        log "Current directory: $(pwd)" YELLOW
        exit 1
    fi
}

# Build the animation binary
build_animation() {
    log "Building animation binary..." BLUE
    
    if ! cargo build --bin animate_logo; then
        log "❌ Build failed" RED
        exit 1
    fi
    
    log "✅ Build completed successfully" GREEN
}

# Run animation
run_animation() {
    local style="$1"
    
    log "Running animation with style: $style" BLUE
    log "Press Ctrl+C to stop the animation" YELLOW
    log ""
    
    # Set environment variable and run
    export ANIMATION_STYLE="$style"
    cargo run --bin animate_logo "$style"
}

# Main function
main() {
    local style="${1:-full}"
    
    # Check if help is requested
    if [[ "$1" == "-h" || "$1" == "--help" ]]; then
        show_usage
        exit 0
    fi
    
    # Validate style
    case "$style" in
        full|simple|static|matrix)
            ;;
        *)
            log "Error: Invalid style '$style'" RED
            log "Valid styles: full, simple, static, matrix" YELLOW
            show_usage
            exit 1
            ;;
    esac
    
    # Check directory
    check_directory
    
    # Build and run
    build_animation
    run_animation "$style"
}

# Run main function
main "$@" 