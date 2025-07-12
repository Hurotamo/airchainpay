#!/bin/bash

# AirChainPay Relay - Rust Monitoring Script
# 
# This script provides monitoring and health check capabilities for the relay server.
# Usage:
#   ./scripts/monitor.sh [action] [options]
# 
# Actions: health, status, metrics, logs, alerts, backup

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

# Configuration
SERVER_URL="http://localhost:8080"
HEALTH_ENDPOINT="/health"
METRICS_ENDPOINT="/metrics"
STATUS_ENDPOINT="/status"
LOG_FILE="logs/airchainpay-relay.log"
BACKUP_DIR="backups"
ALERT_EMAIL="admin@airchainpay.com"

# Check if server is running
check_server_running() {
    if pgrep -f "airchainpay-relay" > /dev/null; then
        return 0
    else
        return 1
    fi
}

# Health check
health_check() {
    log "Performing health check..." BLUE
    
    if ! check_server_running; then
        log "❌ Server is not running" RED
        return 1
    fi
    
    # Check health endpoint
    local health_response
    if health_response=$(curl -s -f "$SERVER_URL$HEALTH_ENDPOINT" 2>/dev/null); then
        log "✅ Health check passed" GREEN
        log "Response: $health_response" CYAN
        return 0
    else
        log "❌ Health check failed" RED
        log "Server may be unhealthy or endpoint not responding" YELLOW
        return 1
    fi
}

# Get server status
get_server_status() {
    log "Getting server status..." BLUE
    
    if ! check_server_running; then
        log "❌ Server is not running" RED
        return 1
    fi
    
    # Get status endpoint
    local status_response
    if status_response=$(curl -s -f "$SERVER_URL$STATUS_ENDPOINT" 2>/dev/null); then
        log "✅ Server status:" GREEN
        echo "$status_response" | jq '.' 2>/dev/null || echo "$status_response"
    else
        log "❌ Failed to get server status" RED
        return 1
    fi
}

# Get metrics
get_metrics() {
    log "Getting server metrics..." BLUE
    
    if ! check_server_running; then
        log "❌ Server is not running" RED
        return 1
    fi
    
    # Get metrics endpoint
    local metrics_response
    if metrics_response=$(curl -s -f "$SERVER_URL$METRICS_ENDPOINT" 2>/dev/null); then
        log "✅ Server metrics:" GREEN
        echo "$metrics_response"
    else
        log "❌ Failed to get metrics" RED
        return 1
    fi
}

# Monitor logs
monitor_logs() {
    local lines="${1:-50}"
    local follow="${2:-false}"
    
    log "Monitoring logs..." BLUE
    
    if [[ ! -f "$LOG_FILE" ]]; then
        log "❌ Log file not found: $LOG_FILE" RED
        return 1
    fi
    
    if [[ "$follow" == "true" ]]; then
        log "Following logs (Ctrl+C to stop):" CYAN
        tail -f -n "$lines" "$LOG_FILE"
    else
        log "Recent logs (last $lines lines):" CYAN
        tail -n "$lines" "$LOG_FILE"
    fi
}

# Check for errors in logs
check_log_errors() {
    log "Checking for errors in logs..." BLUE
    
    if [[ ! -f "$LOG_FILE" ]]; then
        log "❌ Log file not found: $LOG_FILE" RED
        return 1
    fi
    
    local error_count=$(grep -c "ERROR\|CRITICAL\|FATAL" "$LOG_FILE" 2>/dev/null || echo "0")
    
    if [[ "$error_count" -gt 0 ]]; then
        log "⚠️  Found $error_count errors in logs" YELLOW
        log "Recent errors:" YELLOW
        grep "ERROR\|CRITICAL\|FATAL" "$LOG_FILE" | tail -10
        return 1
    else
        log "✅ No errors found in logs" GREEN
        return 0
    fi
}

# Send alert
send_alert() {
    local message="$1"
    local level="${2:-warning}"
    
    log "Sending $level alert: $message" YELLOW
    
    # Log the alert
    echo "$(date): [$level] $message" >> "logs/alerts.log"
    
    # Send email alert (if configured)
    if command -v mail &> /dev/null; then
        echo "$message" | mail -s "AirChainPay Relay Alert: $level" "$ALERT_EMAIL"
    fi
    
    # Send Slack alert (if configured)
    if [[ -n "$SLACK_WEBHOOK_URL" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚨 AirChainPay Relay Alert: $message\"}" \
            "$SLACK_WEBHOOK_URL" > /dev/null 2>&1
    fi
}

# Create backup
create_backup() {
    local backup_name="backup_$(date +%Y%m%d_%H%M%S)"
    local backup_path="$BACKUP_DIR/$backup_name"
    
    log "Creating backup: $backup_name" BLUE
    
    # Create backup directory
    mkdir -p "$backup_path"
    
    # Backup configuration files
    cp -r .env.* "$backup_path/" 2>/dev/null || true
    cp Cargo.toml "$backup_path/"
    cp -r config "$backup_path/" 2>/dev/null || true
    
    # Backup logs
    if [[ -d "logs" ]]; then
        cp -r logs "$backup_path/"
    fi
    
    # Backup data directory
    if [[ -d "data" ]]; then
        cp -r data "$backup_path/"
    fi
    
    # Create backup manifest
    cat > "$backup_path/manifest.txt" << EOF
AirChainPay Relay Backup
Created: $(date)
Version: $(git describe --tags 2>/dev/null || echo "unknown")
Files:
$(find "$backup_path" -type f | sed 's|.*/||')
EOF
    
    log "✅ Backup created: $backup_path" GREEN
    log "Backup size: $(du -sh "$backup_path" | cut -f1)" CYAN
}

# Clean old backups
clean_old_backups() {
    local keep_days="${1:-7}"
    
    log "Cleaning backups older than $keep_days days..." BLUE
    
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log "No backup directory found" YELLOW
        return 0
    fi
    
    local removed_count=0
    while IFS= read -r -d '' backup; do
        if [[ $(find "$backup" -maxdepth 0 -mtime +$keep_days) ]]; then
            rm -rf "$backup"
            ((removed_count++))
            log "Removed old backup: $(basename "$backup")" CYAN
        fi
    done < <(find "$BACKUP_DIR" -maxdepth 1 -type d -name "backup_*" -print0)
    
    log "✅ Cleaned $removed_count old backups" GREEN
}

# Monitor system resources
monitor_resources() {
    log "Monitoring system resources..." BLUE
    
    # CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    log "CPU Usage: ${cpu_usage}%" CYAN
    
    # Memory usage
    local mem_info=$(free -m | grep Mem)
    local mem_total=$(echo "$mem_info" | awk '{print $2}')
    local mem_used=$(echo "$mem_info" | awk '{print $3}')
    local mem_usage=$((mem_used * 100 / mem_total))
    log "Memory Usage: ${mem_usage}% (${mem_used}MB / ${mem_total}MB)" CYAN
    
    # Disk usage
    local disk_usage=$(df -h . | tail -1 | awk '{print $5}' | cut -d'%' -f1)
    log "Disk Usage: ${disk_usage}%" CYAN
    
    # Check thresholds
    if [[ "$cpu_usage" -gt 80 ]]; then
        send_alert "High CPU usage: ${cpu_usage}%" "warning"
    fi
    
    if [[ "$mem_usage" -gt 80 ]]; then
        send_alert "High memory usage: ${mem_usage}%" "warning"
    fi
    
    if [[ "$disk_usage" -gt 80 ]]; then
        send_alert "High disk usage: ${disk_usage}%" "warning"
    fi
}

# Continuous monitoring
continuous_monitoring() {
    local interval="${1:-60}"
    
    log "Starting continuous monitoring (interval: ${interval}s)" BLUE
    log "Press Ctrl+C to stop" YELLOW
    
    while true; do
        log "--- Monitoring cycle $(date) ---" CYAN
        
        # Health check
        if ! health_check; then
            send_alert "Server health check failed" "critical"
        fi
        
        # Check logs for errors
        if ! check_log_errors; then
            send_alert "Errors detected in logs" "warning"
        fi
        
        # Monitor resources
        monitor_resources
        
        # Wait for next cycle
        sleep "$interval"
    done
}

# Show usage
show_usage() {
    log "AirChainPay Relay - Rust Monitoring Script" BOLD
    log ""
    log "Usage: $0 [action] [options]" YELLOW
    log ""
    log "Actions:" BLUE
    log "  health              - Perform health check" CYAN
    log "  status              - Get server status" CYAN
    log "  metrics             - Get server metrics" CYAN
    log "  logs [lines]        - Show recent logs (default: 50)" CYAN
    log "  logs-follow [lines] - Follow logs in real-time" CYAN
    log "  errors              - Check for errors in logs" CYAN
    log "  backup              - Create backup" CYAN
    log "  clean-backups [days]- Clean old backups (default: 7)" CYAN
    log "  resources           - Monitor system resources" CYAN
    log "  monitor [interval]  - Start continuous monitoring" CYAN
    log ""
    log "Examples:" BLUE
    log "  $0 health" CYAN
    log "  $0 logs 100" CYAN
    log "  $0 logs-follow" CYAN
    log "  $0 backup" CYAN
    log "  $0 monitor 30" CYAN
}

# Main function
main() {
    local action="$1"
    local option="$2"
    
    # Check if help is requested
    if [[ "$1" == "-h" || "$1" == "--help" ]]; then
        show_usage
        exit 0
    fi
    
    # Validate arguments
    if [[ -z "$action" ]]; then
        log "Error: Missing action argument" RED
        show_usage
        exit 1
    fi
    
    # Change to script directory
    cd "$(dirname "$0")/.."
    
    # Execute action
    case "$action" in
        "health")
            health_check
            ;;
        "status")
            get_server_status
            ;;
        "metrics")
            get_metrics
            ;;
        "logs")
            monitor_logs "${option:-50}" "false"
            ;;
        "logs-follow")
            monitor_logs "${option:-50}" "true"
            ;;
        "errors")
            check_log_errors
            ;;
        "backup")
            create_backup
            ;;
        "clean-backups")
            clean_old_backups "$option"
            ;;
        "resources")
            monitor_resources
            ;;
        "monitor")
            continuous_monitoring "$option"
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