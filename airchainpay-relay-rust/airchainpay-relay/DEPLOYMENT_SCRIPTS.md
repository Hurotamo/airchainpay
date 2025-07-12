# AirChainPay Relay - Rust Deployment Scripts

This document describes the comprehensive deployment automation tools for the AirChainPay Relay Rust implementation, ported from the Node.js version with enhancements and improvements.

## Overview

The deployment scripts provide a complete automation solution for deploying, managing, and monitoring the AirChainPay Relay server across different environments (development, staging, production). These scripts are designed to be robust, secure, and easy to use.

## Scripts Overview

### 1. Main Deployment Script (`scripts/deploy.sh`)

The primary deployment script that handles environment setup, building, testing, and deployment.

**Features:**
- Environment management (dev, staging, prod)
- Prerequisites checking (Rust, Docker, Git)
- Environment setup and validation
- Build management (debug/release modes)
- Test execution
- Deployment automation
- Release creation
- Cleanup operations

**Usage:**
```bash
./scripts/deploy.sh [environment] [action]
```

**Environments:**
- `dev` - Development environment
- `staging` - Staging environment  
- `prod` - Production environment

**Actions:**
- `setup` - Setup environment configuration
- `secrets` - Generate environment secrets
- `validate` - Validate environment configuration
- `build` - Build the project
- `test` - Run tests
- `deploy` - Deploy to environment
- `release` - Create release build
- `clean` - Clean build artifacts

**Examples:**
```bash
# Setup development environment
./scripts/deploy.sh dev setup

# Generate secrets for production
./scripts/deploy.sh prod secrets

# Build and deploy to staging
./scripts/deploy.sh staging deploy

# Create production release
./scripts/deploy.sh prod release
```

### 2. Docker Deployment Script (`scripts/docker-deploy.sh`)

Docker-specific deployment script for containerized deployments.

**Features:**
- Docker image building
- Container management (start, stop, restart)
- Log monitoring
- Shell access to containers
- Resource cleanup
- Image registry operations

**Usage:**
```bash
./scripts/docker-deploy.sh [environment] [action]
```

**Actions:**
- `build` - Build Docker image
- `start` - Start Docker container
- `stop` - Stop Docker container
- `restart` - Restart Docker container
- `logs` - Show container logs
- `shell` - Open shell in container
- `status` - Show container status
- `clean` - Clean Docker resources
- `push` - Push image to registry

**Examples:**
```bash
# Build and start development container
./scripts/docker-deploy.sh dev build
./scripts/docker-deploy.sh dev start

# Monitor production logs
./scripts/docker-deploy.sh prod logs

# Push staging image to registry
./scripts/docker-deploy.sh staging push
```

### 3. Secrets Generation Script (`scripts/generate_secrets.sh`)

Secure secrets generation for different environments.

**Features:**
- Cryptographically secure secret generation
- Environment-specific secret management
- Template-based configuration
- Security reminders for production
- Multiple secret types (API keys, JWT secrets, DB passwords, encryption keys)

**Usage:**
```bash
./scripts/generate_secrets.sh [environment]
```

**Examples:**
```bash
# Generate secrets for development
./scripts/generate_secrets.sh dev

# Generate production secrets
./scripts/generate_secrets.sh prod
```

### 4. Monitoring Script (`scripts/monitor.sh`)

Comprehensive monitoring and health check capabilities.

**Features:**
- Health checks
- Server status monitoring
- Metrics collection
- Log monitoring and error detection
- Backup creation and management
- System resource monitoring
- Alert system (email, Slack)
- Continuous monitoring

**Usage:**
```bash
./scripts/monitor.sh [action] [options]
```

**Actions:**
- `health` - Perform health check
- `status` - Get server status
- `metrics` - Get server metrics
- `logs [lines]` - Show recent logs
- `logs-follow [lines]` - Follow logs in real-time
- `errors` - Check for errors in logs
- `backup` - Create backup
- `clean-backups [days]` - Clean old backups
- `resources` - Monitor system resources
- `monitor [interval]` - Start continuous monitoring

**Examples:**
```bash
# Check server health
./scripts/monitor.sh health

# Monitor logs in real-time
./scripts/monitor.sh logs-follow

# Create backup
./scripts/monitor.sh backup

# Start continuous monitoring
./scripts/monitor.sh monitor 30
```

## Environment Configuration

### Environment Templates

Each environment has a template file (`env.{environment}`) that defines the configuration structure:

```bash
# API Configuration
API_KEY=your_api_key_here
JWT_SECRET=your_jwt_secret_here

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=airchainpay_relay_{environment}
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
```

### Environment-Specific Files

The scripts create environment-specific files:
- `.env.{environment}` - Actual environment configuration
- `docker-compose.{environment}.yml` - Docker Compose configuration
- `logs/` - Log files directory
- `backups/` - Backup files directory

## Security Features

### Secret Management

- **Cryptographically Secure**: Uses OpenSSL for secure random generation
- **Environment Isolation**: Separate secrets for each environment
- **Production Security**: Enhanced security reminders for production
- **Secret Rotation**: Support for regular secret rotation

### Security Best Practices

- **No Hardcoded Secrets**: All secrets are generated or externalized
- **Environment Separation**: Clear separation between environments
- **Access Control**: Proper file permissions and access controls
- **Audit Logging**: Comprehensive logging of deployment activities

## Monitoring and Alerting

### Health Checks

- **Endpoint Monitoring**: Checks `/health`, `/status`, `/metrics` endpoints
- **Process Monitoring**: Verifies server process is running
- **Resource Monitoring**: CPU, memory, and disk usage monitoring
- **Error Detection**: Automatic detection of errors in logs

### Alert System

- **Email Alerts**: Configurable email notifications
- **Slack Integration**: Slack webhook support
- **Alert Levels**: Warning, critical, and info levels
- **Alert Logging**: All alerts are logged for audit purposes

### Backup System

- **Automatic Backups**: Scheduled backup creation
- **Backup Rotation**: Automatic cleanup of old backups
- **Backup Verification**: Backup integrity checking
- **Restore Capability**: Easy restore from backups

## Docker Integration

### Container Management

- **Multi-Environment Support**: Separate containers for each environment
- **Resource Management**: Proper resource allocation and limits
- **Network Configuration**: Isolated network configurations
- **Volume Management**: Persistent data storage

### Registry Operations

- **Image Tagging**: Proper image versioning
- **Registry Push**: Support for multiple registries
- **Image Cleanup**: Automatic cleanup of old images
- **Security Scanning**: Integration with security scanning tools

## Testing and Validation

### Test Script (`test_deployment_scripts.sh`)

Comprehensive testing of all deployment scripts:

**Test Categories:**
- Script existence and permissions
- Help functionality
- Argument validation
- Environment validation
- Secrets generation
- Deployment setup
- Docker functionality
- Monitoring functionality
- Integration testing
- Error handling

**Usage:**
```bash
./test_deployment_scripts.sh [test_name]
```

**Test Names:**
- `all` - Run all tests
- `deploy` - Test deployment scripts
- `docker` - Test Docker scripts
- `secrets` - Test secrets generation
- `monitor` - Test monitoring scripts
- `integration` - Test integration workflow

## Comparison with Node.js Version

### Enhancements in Rust Version

1. **Improved Error Handling**: More robust error handling and validation
2. **Enhanced Security**: Better secret management and security practices
3. **Comprehensive Monitoring**: More detailed monitoring and alerting
4. **Better Testing**: More comprehensive test coverage
5. **Docker Optimization**: Better Docker integration and optimization
6. **Resource Management**: Improved resource monitoring and management

### Feature Parity

- ✅ Environment management
- ✅ Secret generation
- ✅ Docker deployment
- ✅ Health checks
- ✅ Log monitoring
- ✅ Backup system
- ✅ Alert system

### Additional Features

- 🔒 Enhanced security features
- 📊 Comprehensive monitoring
- 🧪 Extensive testing
- 🐳 Better Docker integration
- 🔄 Improved backup/restore
- 📈 Resource monitoring

## Usage Examples

### Complete Deployment Workflow

```bash
# 1. Setup development environment
./scripts/deploy.sh dev setup

# 2. Generate secrets
./scripts/deploy.sh dev secrets

# 3. Validate configuration
./scripts/deploy.sh dev validate

# 4. Build and deploy
./scripts/deploy.sh dev deploy

# 5. Monitor deployment
./scripts/monitor.sh health
./scripts/monitor.sh logs-follow
```

### Production Deployment

```bash
# 1. Setup production environment
./scripts/deploy.sh prod setup

# 2. Generate production secrets
./scripts/deploy.sh prod secrets

# 3. Create production release
./scripts/deploy.sh prod release

# 4. Deploy with Docker
./scripts/docker-deploy.sh prod build
./scripts/docker-deploy.sh prod start

# 5. Monitor production
./scripts/monitor.sh monitor 60
```

### Docker Deployment

```bash
# 1. Build Docker image
./scripts/docker-deploy.sh staging build

# 2. Start container
./scripts/docker-deploy.sh staging start

# 3. Monitor container
./scripts/docker-deploy.sh staging logs

# 4. Access container shell
./scripts/docker-deploy.sh staging shell

# 5. Stop container
./scripts/docker-deploy.sh staging stop
```

## Troubleshooting

### Common Issues

1. **Script Permissions**: Ensure scripts are executable
   ```bash
   chmod +x scripts/*.sh
   ```

2. **Missing Dependencies**: Install required tools
   ```bash
   # Rust
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   
   # Docker
   curl -fsSL https://get.docker.com | sh
   ```

3. **Environment Files**: Create environment templates
   ```bash
   cp env.example env.dev
   cp env.example env.staging
   cp env.example env.prod
   ```

4. **Docker Issues**: Check Docker daemon
   ```bash
   sudo systemctl start docker
   sudo usermod -aG docker $USER
   ```

### Debug Mode

Enable debug output by setting environment variables:
```bash
export DEBUG=true
export RUST_LOG=debug
```

### Log Files

Check log files for detailed information:
- `logs/airchainpay-relay.log` - Application logs
- `logs/alerts.log` - Alert logs
- `logs/deployment.log` - Deployment logs

## Best Practices

### Security

1. **Secret Management**: Use secure secret management systems
2. **Access Control**: Implement proper access controls
3. **Audit Logging**: Enable comprehensive audit logging
4. **Regular Updates**: Keep dependencies updated
5. **Security Scanning**: Regular security scans

### Performance

1. **Resource Monitoring**: Monitor system resources
2. **Optimization**: Use release builds for production
3. **Caching**: Implement appropriate caching strategies
4. **Load Balancing**: Use load balancers for high availability

### Reliability

1. **Backup Strategy**: Regular backups and testing
2. **Monitoring**: Comprehensive monitoring and alerting
3. **Testing**: Regular testing of deployment procedures
4. **Documentation**: Keep documentation updated

## Conclusion

The AirChainPay Relay Rust deployment scripts provide a comprehensive, secure, and reliable solution for deploying and managing the relay server across different environments. With enhanced security features, comprehensive monitoring, and extensive testing, these scripts offer significant improvements over the Node.js version while maintaining full feature parity.

The scripts are designed to be easy to use while providing enterprise-grade functionality for production deployments. Regular testing and monitoring ensure reliable operation in all environments. 