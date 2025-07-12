#!/bin/bash

# AirChainPay Relay - Rust Deployment Script
# 
# This script helps deploy the relay server to different environments.
# Usage:
#   ./scripts/deploy.sh [environment] [action]
# 
# Environments: dev, staging, prod
# Actions: setup, deploy, validate, secrets, build, test, clean

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

# Validate environment
validate_environment() {
    local environment="$1"
    local valid_environments=("dev" "staging" "prod")
    
    for env in "${valid_environments[@]}"; do
        if [[ "$environment" == "$env" ]]; then
            return 0
        fi
    done
    
    log "Error: Invalid environment '$environment'" RED
    log "Valid environments: ${valid_environments[*]}" YELLOW
    exit 1
}

# Validate action
validate_action() {
    local action="$1"
    local valid_actions=("setup" "deploy" "validate" "secrets" "build" "test" "clean" "release")
    
    for act in "${valid_actions[@]}"; do
        if [[ "$action" == "$act" ]]; then
            return 0
        fi
    done
    
    log "Error: Invalid action '$action'" RED
    log "Valid actions: ${valid_actions[*]}" YELLOW
    exit 1
}

# Check if required tools are installed
check_prerequisites() {
    log "Checking prerequisites..." BLUE
    
    # Check for Rust
    if ! command -v cargo &> /dev/null; then
        log "Error: Rust/Cargo not found. Please install Rust first." RED
        log "Visit: https://rustup.rs/" CYAN
        exit 1
    fi
    
    # Check for Docker (optional)
    if ! command -v docker &> /dev/null; then
        log "Warning: Docker not found. Docker deployment will not be available." YELLOW
    fi
    
    # Check for git
    if ! command -v git &> /dev/null; then
        log "Warning: Git not found. Some features may not work." YELLOW
    fi
    
    log "✅ Prerequisites check completed" GREEN
}

# Check environment setup
check_environment_setup() {
    local environment="$1"
    local env_file=".env.${environment}"
    local template_file="env.${environment}"
    
    if [[ ! -f "$template_file" ]]; then
        log "Error: Template file $template_file not found" RED
        log "Run setup first to create environment templates" YELLOW
        exit 1
    fi
    
    if [[ ! -f "$env_file" ]]; then
        log "Warning: $env_file file not found" YELLOW
        log "Run secrets action to generate environment-specific secrets" CYAN
        return 1
    fi
    
    return 0
}

# Setup environment
setup_environment() {
    local environment="$1"
    
    log "Setting up $environment environment..." BLUE
    
    # Check if template exists
    local template_file="env.${environment}"
    if [[ ! -f "$template_file" ]]; then
        log "Error: Template file $template_file not found" RED
        log "Available templates:" YELLOW
        for file in env.*; do
            if [[ -f "$file" ]]; then
                log "  - $file" CYAN
            fi
        done
        exit 1
    fi
    
    log "✅ Environment template found: $template_file" GREEN
    
    # Create .env file from template
    local env_file=".env.${environment}"
    cp "$template_file" "$env_file"
    
    # Replace placeholders with environment-specific values
    if [[ "$environment" == "dev" ]]; then
        sed -i.bak 's/API_KEY=.*/API_KEY=dev_api_key_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef/' "$env_file"
        sed -i.bak 's/JWT_SECRET=.*/JWT_SECRET=dev_jwt_secret_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef/' "$env_file"
        rm -f "${env_file}.bak"
    fi
    
    log "✅ Created $env_file file" GREEN
    
    log "Environment setup complete!" GREEN
    log "Next steps:" YELLOW
    log "1. Review $env_file file" CYAN
    log "2. Run: ./scripts/deploy.sh $environment secrets" CYAN
    log "3. Run: ./scripts/deploy.sh $environment validate" CYAN
}

# Generate secrets
generate_secrets() {
    local environment="$1"
    
    log "Generating secrets for $environment environment..." BLUE
    
    # Run the secrets generation script
    if [[ -f "scripts/generate_secrets.sh" ]]; then
        ./scripts/generate_secrets.sh "$environment"
    else
        log "Error: secrets generation script not found" RED
        exit 1
    fi
    
    log "✅ Secrets generated successfully!" GREEN
}

# Validate environment configuration
validate_environment_config() {
    local environment="$1"
    
    log "Validating $environment environment configuration..." BLUE
    
    # Check if .env file exists
    local env_file=".env.${environment}"
    if [[ ! -f "$env_file" ]]; then
        log "Error: $env_file file not found" RED
        log "Run setup and secrets actions first" YELLOW
        exit 1
    fi
    
    log "✅ Environment file found: $env_file" GREEN
    
    # Load and validate configuration
    source "$env_file"
    
    # Validate required fields
    local required_fields=("API_KEY" "JWT_SECRET" "RPC_URL" "CHAIN_ID" "CONTRACT_ADDRESS")
    local missing_fields=()
    
    for field in "${required_fields[@]}"; do
        if [[ -z "${!field}" ]]; then
            missing_fields+=("$field")
        fi
    done
    
    if [[ ${#missing_fields[@]} -gt 0 ]]; then
        log "❌ Missing required configuration fields:" RED
        for field in "${missing_fields[@]}"; do
            log "  - $field" RED
        done
        exit 1
    fi
    
    log "✅ All required configuration fields present" GREEN
    log "✅ Configuration validation passed" GREEN
}

# Build the project
build_project() {
    local environment="$1"
    local release_flag=""
    
    if [[ "$environment" == "prod" ]]; then
        release_flag="--release"
        log "Building in release mode for production..." BLUE
    else
        log "Building in debug mode..." BLUE
    fi
    
    # Clean previous build
    log "Cleaning previous build..." CYAN
    cargo clean
    
    # Build the project
    log "Building project..." CYAN
    if ! cargo build $release_flag; then
        log "❌ Build failed" RED
        exit 1
    fi
    
    log "✅ Build completed successfully" GREEN
}

# Run tests
run_tests() {
    log "Running tests..." BLUE
    
    if ! cargo test; then
        log "❌ Tests failed" RED
        exit 1
    fi
    
    log "✅ All tests passed" GREEN
}

# Deploy environment
deploy_environment() {
    local environment="$1"
    
    log "Deploying to $environment environment..." BLUE
    
    # Validate environment first
    if ! check_environment_setup "$environment"; then
        log "Please run setup and secrets actions first" YELLOW
        exit 1
    fi
    
    # Build the project
    build_project "$environment"
    
    # Run tests
    run_tests
    
    # Start the server
    log "Starting server..." CYAN
    export RUST_LOG=info
    export ENVIRONMENT="$environment"
    
    if [[ "$environment" == "prod" ]]; then
        log "Starting production server..." GREEN
        cargo run --release &
    else
        log "Starting development server..." GREEN
        cargo run &
    fi
    
    local server_pid=$!
    log "✅ Server started with PID: $server_pid" GREEN
    
    # Wait a moment for server to start
    sleep 3
    
    # Check if server is running
    if kill -0 $server_pid 2>/dev/null; then
        log "✅ Deployment successful!" GREEN
        log "Server is running on port 8080" CYAN
    else
        log "❌ Server failed to start" RED
        exit 1
    fi
}

# Clean build artifacts
clean_project() {
    log "Cleaning project..." BLUE
    
    # Clean cargo build artifacts
    cargo clean
    
    # Remove target directory
    if [[ -d "target" ]]; then
        rm -rf target
        log "✅ Removed target directory" GREEN
    fi
    
    # Remove generated files
    if [[ -d "generated" ]]; then
        rm -rf generated
        log "✅ Removed generated directory" GREEN
    fi
    
    log "✅ Clean completed" GREEN
}

# Create release build
create_release() {
    local environment="$1"
    
    log "Creating release build for $environment..." BLUE
    
    # Validate environment
    validate_environment_config "$environment"
    
    # Build release
    build_project "$environment"
    
    # Create release directory
    local release_dir="release/${environment}"
    mkdir -p "$release_dir"
    
    # Copy binary
    if [[ "$environment" == "prod" ]]; then
        cp target/release/airchainpay-relay "$release_dir/"
    else
        cp target/debug/airchainpay-relay "$release_dir/"
    fi
    
    # Copy configuration files
    cp ".env.${environment}" "$release_dir/"
    cp "Cargo.toml" "$release_dir/"
    cp "README.md" "$release_dir/"
    
    # Create deployment script
    cat > "$release_dir/deploy.sh" << 'EOF'
#!/bin/bash
export RUST_LOG=info
export ENVIRONMENT="$1"
./airchainpay-relay
EOF
    chmod +x "$release_dir/deploy.sh"
    
    log "✅ Release created in $release_dir" GREEN
    log "To deploy: cd $release_dir && ./deploy.sh $environment" CYAN
}

# Show usage
show_usage() {
    log "AirChainPay Relay - Rust Deployment Script" BOLD
    log ""
    log "Usage: $0 [environment] [action]" YELLOW
    log ""
    log "Environments:" BLUE
    log "  dev      - Development environment" CYAN
    log "  staging  - Staging environment" CYAN
    log "  prod     - Production environment" CYAN
    log ""
    log "Actions:" BLUE
    log "  setup    - Setup environment configuration" CYAN
    log "  secrets  - Generate environment secrets" CYAN
    log "  validate - Validate environment configuration" CYAN
    log "  build    - Build the project" CYAN
    log "  test     - Run tests" CYAN
    log "  deploy   - Deploy to environment" CYAN
    log "  release  - Create release build" CYAN
    log "  clean    - Clean build artifacts" CYAN
    log ""
    log "Examples:" BLUE
    log "  $0 dev setup" CYAN
    log "  $0 dev secrets" CYAN
    log "  $0 dev validate" CYAN
    log "  $0 dev deploy" CYAN
    log "  $0 prod release" CYAN
}

# Main function
main() {
    local environment="$1"
    local action="$2"
    
    # Check if help is requested
    if [[ "$1" == "-h" || "$1" == "--help" ]]; then
        show_usage
        exit 0
    fi
    
    # Validate arguments
    if [[ -z "$environment" || -z "$action" ]]; then
        log "Error: Missing required arguments" RED
        show_usage
        exit 1
    fi
    
    # Validate environment and action
    validate_environment "$environment"
    validate_action "$action"
    
    # Check prerequisites
    check_prerequisites
    
    # Change to script directory
    cd "$(dirname "$0")/.."
    
    # Execute action
    case "$action" in
        "setup")
            setup_environment "$environment"
            ;;
        "secrets")
            generate_secrets "$environment"
            ;;
        "validate")
            validate_environment_config "$environment"
            ;;
        "build")
            build_project "$environment"
            ;;
        "test")
            run_tests
            ;;
        "deploy")
            deploy_environment "$environment"
            ;;
        "release")
            create_release "$environment"
            ;;
        "clean")
            clean_project
            ;;
        *)
            log "Error: Unknown action '$action'" RED
            show_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@" 