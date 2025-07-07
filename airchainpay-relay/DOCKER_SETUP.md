# AirChainPay Relay - Docker Setup Guide

This guide explains how to deploy the AirChainPay relay server using Docker with environment-specific configurations and proper secret management.

## 🐳 Docker Configuration Overview

The relay server supports three Docker environments:

- **Development (dev)**: Local development with hot reloading
- **Staging**: Pre-production testing with moderate security
- **Production (prod)**: Live environment with strict security

## 📁 Docker Files

### Environment-Specific Compose Files
- `docker-compose.dev.yml` - Development environment
- `docker-compose.staging.yml` - Staging environment
- `docker-compose.prod.yml` - Production environment
- `docker-compose.yml` - Default configuration

### Base Configuration
- `Dockerfile` - Multi-environment container definition

## 🚀 Quick Start

### 1. Development Environment
```bash
# Setup development environment
node scripts/deploy.js dev setup
node scripts/deploy.js dev secrets

# Build and start development container
node scripts/docker-deploy.js dev build
node scripts/docker-deploy.js dev start

# View logs
node scripts/docker-deploy.js dev logs

# Access container shell
node scripts/docker-deploy.js dev shell
```

### 2. Staging Environment
```bash
# Setup staging environment
node scripts/deploy.js staging setup
node scripts/deploy.js staging secrets

# Build and start staging container
node scripts/docker-deploy.js staging build
node scripts/docker-deploy.js staging start

# View logs
node scripts/docker-deploy.js staging logs
```

### 3. Production Environment
```bash
# Setup production environment
node scripts/deploy.js prod setup
node scripts/deploy.js prod secrets

# Build and start production container
node scripts/docker-deploy.js prod build
node scripts/docker-deploy.js prod start

# View logs
node scripts/docker-deploy.js prod logs
```

## 🔧 Manual Docker Commands

### Development
```bash
# Build development image
docker-compose -f docker-compose.dev.yml build

# Start development container
docker-compose -f docker-compose.dev.yml up -d

# Stop development container
docker-compose -f docker-compose.dev.yml down

# View logs
docker logs -f airchainpay-relay-dev
```

### Staging
```bash
# Build staging image
docker-compose -f docker-compose.staging.yml build

# Start staging container
docker-compose -f docker-compose.staging.yml up -d

# Stop staging container
docker-compose -f docker-compose.staging.yml down

# View logs
docker logs -f airchainpay-relay-staging
```

### Production
```bash
# Build production image
docker-compose -f docker-compose.prod.yml build

# Start production container
docker-compose -f docker-compose.prod.yml up -d

# Stop production container
docker-compose -f docker-compose.prod.yml down

# View logs
docker logs -f airchainpay-relay-prod
```

## 🛠️ Docker Scripts Reference

### Docker Deployment Script
```bash
node scripts/docker-deploy.js [environment] [action]
```

**Environments:**
- `dev` - Development environment
- `staging` - Staging environment
- `prod` - Production environment

**Actions:**
- `build` - Build Docker image
- `start` - Start container
- `stop` - Stop container
- `restart` - Restart container
- `logs` - View container logs
- `shell` - Access container shell
- `clean` - Clean Docker resources

## 🔐 Environment-Specific Features

### Development Container
- **Hot reloading** enabled
- **Volume mounting** for live code changes
- **Debug mode** enabled
- **Relaxed security** settings
- **Higher rate limits** for testing

### Staging Container
- **Production-like** settings
- **Moderate security** restrictions
- **Health checks** enabled
- **Monitoring** enabled
- **Testnet contracts** used

### Production Container
- **Strict security** settings
- **No debug features** enabled
- **Full monitoring** and alerting
- **Mainnet contracts** used
- **Resource limits** enforced

## 📊 Container Comparison

| Feature | Development | Staging | Production |
|---------|-------------|---------|------------|
| **Container Name** | airchainpay-relay-dev | airchainpay-relay-staging | airchainpay-relay-prod |
| **Hot Reload** | ✅ Enabled | ❌ Disabled | ❌ Disabled |
| **Debug Mode** | ✅ Enabled | ❌ Disabled | ❌ Disabled |
| **Volume Mounts** | ✅ Code + Data | ❌ Data only | ❌ Data only |
| **Security** | Relaxed | Moderate | Strict |
| **Health Checks** | Basic | Full | Full |
| **Monitoring** | Basic | Moderate | Full |

## 🔍 Container Management

### View Running Containers
```bash
docker ps
```

### View All Containers
```bash
docker ps -a
```

### View Container Details
```bash
docker inspect airchainpay-relay-dev
docker inspect airchainpay-relay-staging
docker inspect airchainpay-relay-prod
```

### View Container Resources
```bash
docker stats airchainpay-relay-dev
docker stats airchainpay-relay-staging
docker stats airchainpay-relay-prod
```

## 🚨 Troubleshooting

### Common Issues

**"Container won't start"**
```bash
# Check logs
node scripts/docker-deploy.js [environment] logs

# Check environment file
ls .env.[environment]

# Validate configuration
node scripts/deploy.js [environment] validate
```

**"Port already in use"**
```bash
# Check what's using port 4000
lsof -i :4000

# Stop conflicting containers
docker stop $(docker ps -q)
```

**"Environment file not found"**
```bash
# Generate environment files
node scripts/deploy.js [environment] setup
node scripts/deploy.js [environment] secrets
```

**"Build failed"**
```bash
# Clean Docker cache
docker system prune -a

# Rebuild without cache
docker-compose -f docker-compose.[environment].yml build --no-cache
```

## 🔒 Security Considerations

### Development
- **Volume mounting** for live development
- **Relaxed security** for debugging
- **Higher resource limits** for testing

### Staging
- **Production-like** security settings
- **Health checks** and monitoring
- **Testnet contracts** for safe testing

### Production
- **Strict security** settings
- **No volume mounting** of source code
- **Resource limits** enforced
- **Read-only** file system where possible
- **No new privileges** security option

## 📈 Monitoring & Logs

### View Real-time Logs
```bash
# Development
node scripts/docker-deploy.js dev logs

# Staging
node scripts/docker-deploy.js staging logs

# Production
node scripts/docker-deploy.js prod logs
```

### Access Container Shell
```bash
# Development
node scripts/docker-deploy.js dev shell

# Staging
node scripts/docker-deploy.js staging shell

# Production
node scripts/docker-deploy.js prod shell
```

### Health Checks
All containers include health checks:
- **Endpoint**: `http://localhost:4000/health`
- **Interval**: 30 seconds
- **Timeout**: 10 seconds
- **Retries**: 3
- **Start period**: 10 seconds

## 🧹 Cleanup

### Clean Specific Environment
```bash
# Clean development
node scripts/docker-deploy.js dev clean

# Clean staging
node scripts/docker-deploy.js staging clean

# Clean production
node scripts/docker-deploy.js prod clean
```

### Clean All Docker Resources
```bash
# Stop all containers
docker stop $(docker ps -q)

# Remove all containers
docker rm $(docker ps -aq)

# Remove all images
docker rmi $(docker images -q)

# Clean up volumes
docker volume prune
```

## 📞 Support

For Docker-related issues:

1. Check container logs: `node scripts/docker-deploy.js [env] logs`
2. Validate environment: `node scripts/deploy.js [env] validate`
3. Check Docker status: `docker ps`
4. Review environment files: `ls .env.*`
5. Clean and rebuild: `node scripts/docker-deploy.js [env] clean && node scripts/docker-deploy.js [env] build`

---

**Remember**: Always use the appropriate environment-specific Docker configuration for your deployment needs! 🐳 