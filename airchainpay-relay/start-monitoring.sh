#!/bin/bash

echo "🚀 Starting AirChainPay Relay Monitoring Stack..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    echo "   Download from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

echo "✅ Docker is running"

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose not found. Trying 'docker compose'..."
    if ! docker compose version &> /dev/null; then
        echo "❌ Neither docker-compose nor 'docker compose' is available."
        exit 1
    fi
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

echo "✅ Docker Compose is available"

# Start the monitoring stack
echo "📊 Starting Prometheus, Grafana, and Alertmanager..."
$COMPOSE_CMD -f docker-compose.monitoring.yml up -d

if [ $? -eq 0 ]; then
    echo "✅ Monitoring stack started successfully!"
    echo ""
    echo "🌐 Access your monitoring dashboards:"
    echo "   Prometheus: http://localhost:9090"
    echo "   Grafana:    http://localhost:3000 (admin/admin)"
    echo "   Alertmanager: http://localhost:9093"
    echo ""
    echo "📋 To stop the monitoring stack:"
    echo "   $COMPOSE_CMD -f docker-compose.monitoring.yml down"
else
    echo "❌ Failed to start monitoring stack"
    exit 1
fi 