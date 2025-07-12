#!/bin/bash

# AirChainPay Relay - Rust Docker Deployment Script
# 
# This script helps deploy the relay server using Docker for different environments.
# Usage:
#   ./scripts/docker-deploy.sh [environment] [action]
# 
# Environments: dev, staging, prod
# Actions: build, start, stop, restart, logs, shell, clean, push

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
    local valid_actions=("build" "start" "stop" "restart" "logs" "shell" "clean" "push" "status")
    
    for act in "${valid_actions[@]}"; do
        if [[ "$action" == "$act" ]]; then
            return 0
        fi
    done
    
    log "Error: Invalid action '$action'" RED
    log "Valid actions: ${valid_actions[*]}" YELLOW
    exit 1
}

# Check if Docker is available
check_docker() {
    if ! command -v docker &> /dev/null; then
        log "Error: Docker not found. Please install Docker first." RED
        log "Visit: https://docs.docker.com/get-docker/" CYAN
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log "Error: Docker daemon not running. Please start Docker." RED
        exit 1
    fi
    
    log "✅ Docker is available" GREEN
}

# Check environment files
check_environment_files() {
    local environment="$1"
    local env_file=".env.${environment}"
    local compose_file="docker-compose.${environment}.yml"
    
    if [[ ! -f "$env_file" ]]; then
        log "Warning: $env_file file not found" YELLOW
        log "Run: ./scripts/deploy.sh $environment secrets" CYAN
    fi
    
    if [[ ! -f "$compose_file" ]]; then
        log "Error: $compose_file not found" RED
        log "Available compose files:" YELLOW
        for file in docker-compose.*.yml; do
            if [[ -f "$file" ]]; then
                log "  - $file" CYAN
            fi
        done
        exit 1
    fi
    
    return 0
}

# Get container name
get_container_name() {
    local environment="$1"
    local container_names=(
        ["dev"]="airchainpay-relay-dev"
        ["staging"]="airchainpay-relay-staging"
        ["prod"]="airchainpay-relay-prod"
    )
    echo "${container_names[$environment]}"
}

# Get image name
get_image_name() {
    local environment="$1"
    echo "airchainpay-relay:${environment}"
}

# Build Docker image
build_docker_image() {
    local environment="$1"
    
    log "Building Docker image for $environment environment..." BLUE
    
    # Check environment files
    check_environment_files "$environment"
    
    # Build the image
    local compose_file="docker-compose.${environment}.yml"
    local image_name=$(get_image_name "$environment")
    
    log "Building image: $image_name" CYAN
    
    if ! docker-compose -f "$compose_file" build; then
        log "❌ Docker build failed" RED
        exit 1
    fi
    
    log "✅ Docker image built successfully!" GREEN
    log "Image: $image_name" CYAN
}

# Start Docker container
start_docker_container() {
    local environment="$1"
    
    log "Starting Docker container for $environment environment..." BLUE
    
    # Check environment files
    check_environment_files "$environment"
    
    # Start the container
    local compose_file="docker-compose.${environment}.yml"
    local container_name=$(get_container_name "$environment")
    
    log "Starting container: $container_name" CYAN
    
    if ! docker-compose -f "$compose_file" up -d; then
        log "❌ Docker start failed" RED
        exit 1
    fi
    
    log "✅ Docker container started successfully!" GREEN
    log "Container name: $container_name" CYAN
    log "Port: 8080" CYAN
    
    # Show container status
    show_container_status "$environment"
}

# Stop Docker container
stop_docker_container() {
    local environment="$1"
    
    log "Stopping Docker container for $environment environment..." BLUE
    
    # Check environment files
    check_environment_files "$environment"
    
    # Stop the container
    local compose_file="docker-compose.${environment}.yml"
    
    if ! docker-compose -f "$compose_file" down; then
        log "❌ Docker stop failed" RED
        exit 1
    fi
    
    log "✅ Docker container stopped successfully!" GREEN
}

# Restart Docker container
restart_docker_container() {
    local environment="$1"
    
    log "Restarting Docker container for $environment environment..." BLUE
    
    # Check environment files
    check_environment_files "$environment"
    
    # Restart the container
    local compose_file="docker-compose.${environment}.yml"
    
    if ! docker-compose -f "$compose_file" restart; then
        log "❌ Docker restart failed" RED
        exit 1
    fi
    
    log "✅ Docker container restarted successfully!" GREEN
    
    # Show container status
    show_container_status "$environment"
}

# Show Docker logs
show_docker_logs() {
    local environment="$1"
    
    log "Showing logs for $environment environment..." BLUE
    
    local container_name=$(get_container_name "$environment")
    
    if ! docker logs -f "$container_name"; then
        log "❌ Failed to show logs" RED
        log "Container may not be running. Try starting it first." YELLOW
        exit 1
    fi
}

# Shell into container
shell_into_container() {
    local environment="$1"
    
    log "Opening shell in $environment container..." BLUE
    
    local container_name=$(get_container_name "$environment")
    
    if ! docker exec -it "$container_name" /bin/sh; then
        log "❌ Failed to open shell" RED
        log "Container may not be running. Try starting it first." YELLOW
        exit 1
    fi
}

# Show container status
show_container_status() {
    local environment="$1"
    
    log "Container status for $environment environment:" BLUE
    
    local container_name=$(get_container_name "$environment")
    
    if docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep "$container_name"; then
        log "✅ Container is running" GREEN
    else
        log "❌ Container is not running" RED
    fi
}

# Clean Docker resources
clean_docker_resources() {
    local environment="$1"
    
    log "Cleaning Docker resources for $environment environment..." BLUE
    
    # Check environment files
    check_environment_files "$environment"
    
    # Clean the resources
    local compose_file="docker-compose.${environment}.yml"
    
    if ! docker-compose -f "$compose_file" down --volumes --remove-orphans; then
        log "❌ Docker clean failed" RED
        exit 1
    fi
    
    # Remove the image
    local image_name=$(get_image_name "$environment")
    if docker images | grep -q "$image_name"; then
        log "Removing image: $image_name" CYAN
        docker rmi "$image_name" || true
    fi
    
    log "✅ Docker resources cleaned successfully!" GREEN
}

# Push Docker image
push_docker_image() {
    local environment="$1"
    
    log "Pushing Docker image for $environment environment..." BLUE
    
    local image_name=$(get_image_name "$environment")
    
    # Check if image exists
    if ! docker images | grep -q "$image_name"; then
        log "Error: Image $image_name not found" RED
        log "Build the image first: $0 $environment build" YELLOW
        exit 1
    fi
    
    # Tag for registry (you can customize this)
    local registry="your-registry.com"
    local tagged_image="${registry}/${image_name}"
    
    log "Tagging image: $tagged_image" CYAN
    docker tag "$image_name" "$tagged_image"
    
    log "Pushing image to registry..." CYAN
    if ! docker push "$tagged_image"; then
        log "❌ Docker push failed" RED
        exit 1
    fi
    
    log "✅ Docker image pushed successfully!" GREEN
    log "Image: $tagged_image" CYAN
}

# Show usage
show_usage() {
    log "AirChainPay Relay - Rust Docker Deployment Script" BOLD
    log ""
    log "Usage: $0 [environment] [action]" YELLOW
    log ""
    log "Environments:" BLUE
    log "  dev      - Development environment" CYAN
    log "  staging  - Staging environment" CYAN
    log "  prod     - Production environment" CYAN
    log ""
    log "Actions:" BLUE
    log "  build    - Build Docker image" CYAN
    log "  start    - Start Docker container" CYAN
    log "  stop     - Stop Docker container" CYAN
    log "  restart  - Restart Docker container" CYAN
    log "  logs     - Show container logs" CYAN
    log "  shell    - Open shell in container" CYAN
    log "  status   - Show container status" CYAN
    log "  clean    - Clean Docker resources" CYAN
    log "  push     - Push image to registry" CYAN
    log ""
    log "Examples:" BLUE
    log "  $0 dev build" CYAN
    log "  $0 dev start" CYAN
    log "  $0 dev logs" CYAN
    log "  $0 prod push" CYAN
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
    
    # Check Docker
    check_docker
    
    # Change to script directory
    cd "$(dirname "$0")/.."
    
    # Execute action
    case "$action" in
        "build")
            build_docker_image "$environment"
            ;;
        "start")
            start_docker_container "$environment"
            ;;
        "stop")
            stop_docker_container "$environment"
            ;;
        "restart")
            restart_docker_container "$environment"
            ;;
        "logs")
            show_docker_logs "$environment"
            ;;
        "shell")
            shell_into_container "$environment"
            ;;
        "status")
            show_container_status "$environment"
            ;;
        "clean")
            clean_docker_resources "$environment"
            ;;
        "push")
            push_docker_image "$environment"
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