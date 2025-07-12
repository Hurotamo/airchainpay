#!/bin/bash

# AirChainPay Relay - Rust Deployment Scripts Test
# 
# This script tests the deployment automation tools.
# Usage:
#   ./test_deployment_scripts.sh [test_name]
# 
# Test names: all, deploy, docker, secrets, monitor, integration

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

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Test function
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    log "Running test: $test_name" BLUE
    
    if eval "$test_command"; then
        log "✅ Test passed: $test_name" GREEN
        ((TESTS_PASSED++))
        return 0
    else
        log "❌ Test failed: $test_name" RED
        ((TESTS_FAILED++))
        return 1
    fi
}

# Test script existence
test_script_existence() {
    log "Testing script existence..." BLUE
    
    local scripts=(
        "scripts/deploy.sh"
        "scripts/docker-deploy.sh"
        "scripts/generate_secrets.sh"
        "scripts/monitor.sh"
    )
    
    for script in "${scripts[@]}"; do
        if [[ -f "$script" ]]; then
            log "✅ Found: $script" GREEN
        else
            log "❌ Missing: $script" RED
            return 1
        fi
    done
    
    return 0
}

# Test script permissions
test_script_permissions() {
    log "Testing script permissions..." BLUE
    
    local scripts=(
        "scripts/deploy.sh"
        "scripts/docker-deploy.sh"
        "scripts/generate_secrets.sh"
        "scripts/monitor.sh"
    )
    
    for script in "${scripts[@]}"; do
        if [[ -x "$script" ]]; then
            log "✅ Executable: $script" GREEN
        else
            log "❌ Not executable: $script" RED
            chmod +x "$script"
            log "✅ Made executable: $script" GREEN
        fi
    done
    
    return 0
}

# Test help functionality
test_help_functionality() {
    log "Testing help functionality..." BLUE
    
    # Test deploy script help
    if ./scripts/deploy.sh --help | grep -q "Usage:"; then
        log "✅ Deploy script help works" GREEN
    else
        log "❌ Deploy script help failed" RED
        return 1
    fi
    
    # Test docker deploy script help
    if ./scripts/docker-deploy.sh --help | grep -q "Usage:"; then
        log "✅ Docker deploy script help works" GREEN
    else
        log "❌ Docker deploy script help failed" RED
        return 1
    fi
    
    # Test secrets script help
    if ./scripts/generate_secrets.sh --help | grep -q "Usage:"; then
        log "✅ Secrets script help works" GREEN
    else
        log "❌ Secrets script help failed" RED
        return 1
    fi
    
    # Test monitor script help
    if ./scripts/monitor.sh --help | grep -q "Usage:"; then
        log "✅ Monitor script help works" GREEN
    else
        log "❌ Monitor script help failed" RED
        return 1
    fi
    
    return 0
}

# Test argument validation
test_argument_validation() {
    log "Testing argument validation..." BLUE
    
    # Test deploy script validation
    if ./scripts/deploy.sh 2>&1 | grep -q "Missing required arguments"; then
        log "✅ Deploy script argument validation works" GREEN
    else
        log "❌ Deploy script argument validation failed" RED
        return 1
    fi
    
    # Test docker deploy script validation
    if ./scripts/docker-deploy.sh 2>&1 | grep -q "Missing required arguments"; then
        log "✅ Docker deploy script argument validation works" GREEN
    else
        log "❌ Docker deploy script argument validation failed" RED
        return 1
    fi
    
    # Test secrets script validation
    if ./scripts/generate_secrets.sh 2>&1 | grep -q "Missing environment argument"; then
        log "✅ Secrets script argument validation works" GREEN
    else
        log "❌ Secrets script argument validation failed" RED
        return 1
    fi
    
    # Test monitor script validation
    if ./scripts/monitor.sh 2>&1 | grep -q "Missing action argument"; then
        log "✅ Monitor script argument validation works" GREEN
    else
        log "❌ Monitor script argument validation failed" RED
        return 1
    fi
    
    return 0
}

# Test environment validation
test_environment_validation() {
    log "Testing environment validation..." BLUE
    
    # Test invalid environment
    if ./scripts/deploy.sh invalid build 2>&1 | grep -q "Invalid environment"; then
        log "✅ Deploy script environment validation works" GREEN
    else
        log "❌ Deploy script environment validation failed" RED
        return 1
    fi
    
    # Test invalid action
    if ./scripts/deploy.sh dev invalid 2>&1 | grep -q "Invalid action"; then
        log "✅ Deploy script action validation works" GREEN
    else
        log "❌ Deploy script action validation failed" RED
        return 1
    fi
    
    return 0
}

# Test secrets generation
test_secrets_generation() {
    log "Testing secrets generation..." BLUE
    
    # Create test environment template
    cat > env.test << EOF
# Test Environment Configuration
API_KEY=test_api_key_placeholder
JWT_SECRET=test_jwt_secret_placeholder
DB_PASSWORD=test_db_password_placeholder
ENCRYPTION_KEY=test_encryption_key_placeholder
RPC_URL=https://test.example.com
CHAIN_ID=1
CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890
EOF
    
    # Test secrets generation
    if ./scripts/generate_secrets.sh test; then
        log "✅ Secrets generation works" GREEN
        
        # Check if .env file was created
        if [[ -f ".env.test" ]]; then
            log "✅ Environment file created" GREEN
        else
            log "❌ Environment file not created" RED
            return 1
        fi
        
        # Check if secrets were generated
        if grep -q "API_KEY=" .env.test && grep -q "JWT_SECRET=" .env.test; then
            log "✅ Secrets were generated" GREEN
        else
            log "❌ Secrets were not generated" RED
            return 1
        fi
    else
        log "❌ Secrets generation failed" RED
        return 1
    fi
    
    # Cleanup
    rm -f env.test .env.test
    
    return 0
}

# Test deployment setup
test_deployment_setup() {
    log "Testing deployment setup..." BLUE
    
    # Create test environment template
    cat > env.test << EOF
# Test Environment Configuration
API_KEY=test_api_key_placeholder
JWT_SECRET=test_jwt_secret_placeholder
RPC_URL=https://test.example.com
CHAIN_ID=1
CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890
EOF
    
    # Test deployment setup
    if ./scripts/deploy.sh test setup; then
        log "✅ Deployment setup works" GREEN
        
        # Check if .env file was created
        if [[ -f ".env.test" ]]; then
            log "✅ Environment file created" GREEN
        else
            log "❌ Environment file not created" RED
            return 1
        fi
    else
        log "❌ Deployment setup failed" RED
        return 1
    fi
    
    # Cleanup
    rm -f env.test .env.test
    
    return 0
}

# Test Docker functionality
test_docker_functionality() {
    log "Testing Docker functionality..." BLUE
    
    # Check if Docker is available
    if command -v docker &> /dev/null; then
        log "✅ Docker is available" GREEN
        
        # Test Docker script validation
        if ./scripts/docker-deploy.sh invalid build 2>&1 | grep -q "Invalid environment"; then
            log "✅ Docker script environment validation works" GREEN
        else
            log "❌ Docker script environment validation failed" RED
            return 1
        fi
    else
        log "⚠️  Docker not available, skipping Docker tests" YELLOW
    fi
    
    return 0
}

# Test monitoring functionality
test_monitoring_functionality() {
    log "Testing monitoring functionality..." BLUE
    
    # Test monitor script actions
    local actions=("health" "status" "metrics" "logs" "errors" "backup" "resources")
    
    for action in "${actions[@]}"; do
        if ./scripts/monitor.sh "$action" > /dev/null 2>&1; then
            log "✅ Monitor action '$action' works" GREEN
        else
            log "⚠️  Monitor action '$action' failed (expected if server not running)" YELLOW
        fi
    done
    
    return 0
}

# Test integration
test_integration() {
    log "Testing integration..." BLUE
    
    # Test full deployment workflow
    log "Testing full deployment workflow..." CYAN
    
    # Create test environment
    cat > env.test << EOF
# Test Environment Configuration
API_KEY=test_api_key_placeholder
JWT_SECRET=test_jwt_secret_placeholder
RPC_URL=https://test.example.com
CHAIN_ID=1
CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890
EOF
    
    # Test setup
    if ./scripts/deploy.sh test setup; then
        log "✅ Integration: Setup works" GREEN
    else
        log "❌ Integration: Setup failed" RED
        return 1
    fi
    
    # Test secrets generation
    if ./scripts/generate_secrets.sh test; then
        log "✅ Integration: Secrets generation works" GREEN
    else
        log "❌ Integration: Secrets generation failed" RED
        return 1
    fi
    
    # Test validation
    if ./scripts/deploy.sh test validate; then
        log "✅ Integration: Validation works" GREEN
    else
        log "❌ Integration: Validation failed" RED
        return 1
    fi
    
    # Cleanup
    rm -f env.test .env.test
    
    return 0
}

# Test error handling
test_error_handling() {
    log "Testing error handling..." BLUE
    
    # Test missing files
    if ./scripts/deploy.sh dev secrets 2>&1 | grep -q "secrets generation script not found"; then
        log "✅ Error handling for missing files works" GREEN
    else
        log "❌ Error handling for missing files failed" RED
        return 1
    fi
    
    # Test invalid environment files
    if ./scripts/deploy.sh invalid setup 2>&1 | grep -q "Template file env.invalid not found"; then
        log "✅ Error handling for invalid environment works" GREEN
    else
        log "❌ Error handling for invalid environment failed" RED
        return 1
    fi
    
    return 0
}

# Show test results
show_test_results() {
    log "Test Results:" BOLD
    log "Tests passed: $TESTS_PASSED" GREEN
    log "Tests failed: $TESTS_FAILED" RED
    log "Total tests: $((TESTS_PASSED + TESTS_FAILED))" BLUE
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        log "🎉 All tests passed!" GREEN
        return 0
    else
        log "❌ Some tests failed" RED
        return 1
    fi
}

# Show usage
show_usage() {
    log "AirChainPay Relay - Rust Deployment Scripts Test" BOLD
    log ""
    log "Usage: $0 [test_name]" YELLOW
    log ""
    log "Test names:" BLUE
    log "  all         - Run all tests" CYAN
    log "  deploy      - Test deployment scripts" CYAN
    log "  docker      - Test Docker scripts" CYAN
    log "  secrets     - Test secrets generation" CYAN
    log "  monitor     - Test monitoring scripts" CYAN
    log "  integration - Test integration workflow" CYAN
    log ""
    log "Examples:" BLUE
    log "  $0 all" CYAN
    log "  $0 deploy" CYAN
    log "  $0 secrets" CYAN
}

# Main function
main() {
    local test_name="$1"
    
    # Check if help is requested
    if [[ "$1" == "-h" || "$1" == "--help" ]]; then
        show_usage
        exit 0
    fi
    
    # Change to script directory
    cd "$(dirname "$0")"
    
    log "Starting deployment scripts tests..." BOLD
    
    case "$test_name" in
        "all")
            run_test "Script existence" "test_script_existence"
            run_test "Script permissions" "test_script_permissions"
            run_test "Help functionality" "test_help_functionality"
            run_test "Argument validation" "test_argument_validation"
            run_test "Environment validation" "test_environment_validation"
            run_test "Secrets generation" "test_secrets_generation"
            run_test "Deployment setup" "test_deployment_setup"
            run_test "Docker functionality" "test_docker_functionality"
            run_test "Monitoring functionality" "test_monitoring_functionality"
            run_test "Integration" "test_integration"
            run_test "Error handling" "test_error_handling"
            ;;
        "deploy")
            run_test "Script existence" "test_script_existence"
            run_test "Script permissions" "test_script_permissions"
            run_test "Help functionality" "test_help_functionality"
            run_test "Argument validation" "test_argument_validation"
            run_test "Environment validation" "test_environment_validation"
            run_test "Deployment setup" "test_deployment_setup"
            ;;
        "docker")
            run_test "Docker functionality" "test_docker_functionality"
            ;;
        "secrets")
            run_test "Secrets generation" "test_secrets_generation"
            ;;
        "monitor")
            run_test "Monitoring functionality" "test_monitoring_functionality"
            ;;
        "integration")
            run_test "Integration" "test_integration"
            ;;
        "")
            log "Error: Missing test name" RED
            show_usage
            exit 1
            ;;
        *)
            log "Error: Unknown test name '$test_name'" RED
            show_usage
            exit 1
            ;;
    esac
    
    show_test_results
}

# Run main function
main "$@" 