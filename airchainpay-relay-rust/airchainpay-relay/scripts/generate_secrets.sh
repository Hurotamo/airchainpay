#!/bin/bash

# AirChainPay Relay - Rust Secret Generation Script
# 
# This script generates secure secrets for different environments.
# Usage:
#   ./scripts/generate_secrets.sh [environment]
# 
# Environments: dev, staging, prod

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

# Generate secure secret
generate_secure_secret() {
    local length="${1:-32}"
    openssl rand -hex "$length"
}

# Generate API key
generate_api_key() {
    generate_secure_secret 32
}

# Generate JWT secret
generate_jwt_secret() {
    generate_secure_secret 64
}

# Generate database password
generate_db_password() {
    generate_secure_secret 24
}

# Generate encryption key
generate_encryption_key() {
    generate_secure_secret 32
}

# Generate environment secrets
generate_environment_secrets() {
    local environment="$1"
    
    local secrets=(
        ["api_key"]=$(generate_api_key)
        ["jwt_secret"]=$(generate_jwt_secret)
        ["db_password"]=$(generate_db_password)
        ["encryption_key"]=$(generate_encryption_key)
    )
    
    log "Generated secrets for $environment environment:" GREEN
    log "API_KEY=${secrets[api_key]}" CYAN
    log "JWT_SECRET=${secrets[jwt_secret]}" CYAN
    log "DB_PASSWORD=${secrets[db_password]}" CYAN
    log "ENCRYPTION_KEY=${secrets[encryption_key]}" CYAN
    
    echo "${secrets[@]}"
}

# Update environment file
update_environment_file() {
    local environment="$1"
    local secrets=("${@:2}")
    
    local env_file="env.${environment}"
    
    if [[ ! -f "$env_file" ]]; then
        log "Error: Template file $env_file not found" RED
        log "Create the template file first" YELLOW
        exit 1
    fi
    
    # Read the template content
    local content=$(cat "$env_file")
    
    # Replace placeholders with generated secrets
    content=$(echo "$content" | sed "s/API_KEY=.*/API_KEY=${secrets[0]}/")
    content=$(echo "$content" | sed "s/JWT_SECRET=.*/JWT_SECRET=${secrets[1]}/")
    content=$(echo "$content" | sed "s/DB_PASSWORD=.*/DB_PASSWORD=${secrets[2]}/")
    content=$(echo "$content" | sed "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=${secrets[3]}/")
    
    # Write updated content back to file
    echo "$content" > "$env_file"
    
    log "Updated $env_file with new secrets" GREEN
}

# Create .env file
create_env_file() {
    local environment="$1"
    local secrets=("${@:2}")
    
    local env_file=".env.${environment}"
    local template_file="env.${environment}"
    
    if [[ ! -f "$template_file" ]]; then
        log "Error: Template file $template_file not found" RED
        log "Create the template file first" YELLOW
        exit 1
    fi
    
    # Read the template content
    local content=$(cat "$template_file")
    
    # Replace placeholders with generated secrets
    content=$(echo "$content" | sed "s/API_KEY=.*/API_KEY=${secrets[0]}/")
    content=$(echo "$content" | sed "s/JWT_SECRET=.*/JWT_SECRET=${secrets[1]}/")
    content=$(echo "$content" | sed "s/DB_PASSWORD=.*/DB_PASSWORD=${secrets[2]}/")
    content=$(echo "$content" | sed "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=${secrets[3]}/")
    
    # Write the actual .env file
    echo "$content" > "$env_file"
    
    log "Created $env_file with generated secrets" GREEN
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

# Create template file if it doesn't exist
create_template_file() {
    local environment="$1"
    local template_file="env.${environment}"
    
    if [[ ! -f "$template_file" ]]; then
        log "Creating template file: $template_file" BLUE
        
        cat > "$template_file" << EOF
# AirChainPay Relay - ${environment^} Environment Configuration

# API Configuration
API_KEY=your_api_key_here
JWT_SECRET=your_jwt_secret_here

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=airchainpay_relay_${environment}
DB_USER=airchainpay_user
DB_PASSWORD=your_db_password_here

# Blockchain Configuration
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your_api_key
CHAIN_ID=11155111
CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890

# Security Configuration
ENCRYPTION_KEY=your_encryption_key_here
CORS_ORIGINS=*

# Logging Configuration
RUST_LOG=info
LOG_LEVEL=info

# Server Configuration
PORT=8080
HOST=0.0.0.0

# BLE Configuration
BLE_ENABLED=true
BLE_SCAN_INTERVAL=5000

# Monitoring Configuration
METRICS_ENABLED=true
HEALTH_CHECK_INTERVAL=30

# Rate Limiting
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX_REQUESTS=1000
EOF
        
        log "✅ Template file created: $template_file" GREEN
    fi
}

# Show security reminders
show_security_reminders() {
    local environment="$1"
    
    if [[ "$environment" == "prod" ]]; then
        log "⚠️  PRODUCTION SECURITY REMINDERS:" RED
        log "• Rotate secrets regularly" YELLOW
        log "• Use secure secret management (AWS Secrets Manager, etc.)" YELLOW
        log "• Monitor for unauthorized access" YELLOW
        log "• Never commit .env files to version control" YELLOW
        log "• Use strong, unique secrets for each environment" YELLOW
        log "• Enable audit logging" YELLOW
        log "• Regular security assessments" YELLOW
    fi
}

# Show usage
show_usage() {
    log "AirChainPay Relay - Rust Secret Generation Script" BOLD
    log ""
    log "Usage: $0 [environment]" YELLOW
    log ""
    log "Environments:" BLUE
    log "  dev      - Development environment" CYAN
    log "  staging  - Staging environment" CYAN
    log "  prod     - Production environment" CYAN
    log ""
    log "Examples:" BLUE
    log "  $0 dev" CYAN
    log "  $0 staging" CYAN
    log "  $0 prod" CYAN
    log ""
    log "This script will:" BLUE
    log "1. Generate secure secrets for the specified environment" CYAN
    log "2. Update the environment template file" CYAN
    log "3. Create the actual .env file" CYAN
    log "4. Provide security reminders for production" CYAN
}

# Main function
main() {
    local environment="$1"
    
    # Check if help is requested
    if [[ "$1" == "-h" || "$1" == "--help" ]]; then
        show_usage
        exit 0
    fi
    
    # Validate arguments
    if [[ -z "$environment" ]]; then
        log "Error: Missing environment argument" RED
        show_usage
        exit 1
    fi
    
    # Validate environment
    validate_environment "$environment"
    
    # Change to script directory
    cd "$(dirname "$0")/.."
    
    log "Generating secrets for $environment environment..." BLUE
    
    try {
        # Create template file if it doesn't exist
        create_template_file "$environment"
        
        # Generate secrets
        local secrets=($(generate_environment_secrets "$environment"))
        
        # Update the template file
        update_environment_file "$environment" "${secrets[@]}"
        
        # Create the actual .env file
        create_env_file "$environment" "${secrets[@]}"
        
        log "✅ Secrets generated successfully for $environment environment!" GREEN
        log "Next steps:" YELLOW
        log "1. Review the generated secrets in .env.$environment" CYAN
        log "2. Update your deployment configuration" CYAN
        log "3. Store secrets securely (not in version control)" CYAN
        log "4. Test the configuration: ./scripts/deploy.sh $environment validate" CYAN
        
        # Show security reminders
        show_security_reminders "$environment"
        
    } catch {
        log "❌ Error generating secrets:" RED
        log "$1" RED
        exit 1
    }
}

# Run main function
main "$@" 