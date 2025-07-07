# AirChainPay Relay - Production Readiness Guide

This guide covers all the production readiness components that have been added to the AirChainPay relay server.

## 📋 Production Readiness Checklist

### ✅ Core Infrastructure
- [x] Complete server implementation with Express.js
- [x] Comprehensive security measures (input sanitization, XSS prevention, SQL injection protection)
- [x] Authentication & authorization with JWT tokens
- [x] Rate limiting and CORS protection
- [x] Multi-environment support (dev/staging/prod)
- [x] Docker containerization with environment-specific configs
- [x] Health check endpoints and monitoring
- [x] Graceful shutdown handling

### ✅ Testing & Quality Assurance
- [x] **Unit Tests** - Complete test coverage for all core modules
- [x] **Integration Tests** - End-to-end API testing
- [x] **Test Scripts** - Automated testing for endpoints, BLE, key exchange
- [x] **Code Coverage** - NYC coverage reporting
- [x] **Linting** - ESLint configuration and scripts

### ✅ Monitoring & Observability
- [x] **Prometheus Configuration** - Metrics collection and alerting
- [x] **Grafana Dashboards** - Real-time monitoring and visualization
- [x] **Alertmanager** - Alert routing and notification management
- [x] **Structured Logging** - Winston-based logging with multiple transports
- [x] **Health Checks** - Comprehensive health monitoring

### ✅ Security & Compliance
- [x] **Rate Limiting** - Configurable rate limits per endpoint and user type
- [x] **Audit Logging** - Comprehensive security event logging
- [x] **Security Policies** - IP whitelisting/blacklisting, threat detection
- [x] **Secret Management** - Secure secret generation and rotation
- [x] **Input Validation** - Comprehensive input sanitization and validation

## 🧪 Testing Framework

### Unit Tests
```bash
# Run all unit tests
npm run test:unit

# Run specific unit test files
npm run test:unit -- --grep "TransactionProcessor"
```

**Test Files Created:**
- `test/unit/TransactionProcessor.test.js` - Transaction processing logic
- `test/unit/TransactionValidator.test.js` - Transaction validation
- `test/unit/blockchain.test.js` - Blockchain utilities
- `test/unit/logger.test.js` - Logging functionality
- `test/unit/BLEManager.test.js` - Bluetooth functionality

### Integration Tests
```bash
# Run integration tests
npm run test:integration

# Run all tests with coverage
npm run test:coverage
```

### Test Scripts
```bash
# Test relay functionality
npm run test-relay

# Test BLE functionality
npm run test-ble

# Test all endpoints
npm run test-endpoints
```

## 📊 Monitoring Setup

### Prometheus Configuration
```bash
# Start monitoring stack
npm run monitor:start

# Stop monitoring stack
npm run monitor:stop
```

**Files Created:**
- `monitoring/prometheus.yml` - Prometheus configuration
- `monitoring/alerts.yml` - Alerting rules
- `monitoring/grafana/dashboards/relay-dashboard.json` - Grafana dashboard

### Metrics Collected
- **Server Health**: Uptime, response time, error rates
- **Transaction Processing**: Success/failure rates, queue size, processing time
- **BLE Connections**: Connected devices, key exchange status
- **Blockchain**: Gas prices, RPC errors, transaction status
- **Security**: Authentication failures, unauthorized access attempts
- **System Resources**: CPU, memory, disk usage

### Alerts Configured
- **Critical**: Server down, high transaction failure rate
- **Warning**: High resource usage, BLE connection issues
- **Security**: Unauthorized access, suspicious activity
- **Operations**: System resource alerts, container issues

## 🔒 Security Configuration

### Rate Limiting
```json
{
  "global": {
    "windowMs": 900000,
    "max": 1000
  },
  "endpoints": {
    "/auth/token": {
      "windowMs": 300000,
      "max": 10
    },
    "/transaction/submit": {
      "windowMs": 60000,
      "max": 50
    }
  }
}
```

### Audit Logging
- **Security Events**: Unauthorized access, suspicious activity
- **Authentication**: Login attempts, token generation/validation
- **Transactions**: Submission, processing, broadcasting
- **BLE Events**: Device connections, key exchanges
- **System Events**: Startup, shutdown, configuration changes

### Security Policies
- IP whitelisting/blacklisting
- Threat detection and response
- Sensitive data masking
- Real-time security monitoring

## 📝 Structured Logging

### Log Levels
- **error**: Application errors and exceptions
- **warn**: Warning conditions
- **info**: General application information
- **http**: HTTP request/response logging
- **debug**: Debug information
- **security**: Security events
- **audit**: Audit trail events

### Log Files
- `logs/application.log` - General application logs
- `logs/error.log` - Error logs only
- `logs/security.log` - Security events
- `logs/audit.log` - Audit trail
- `logs/http.log` - HTTP request logs

### Usage
```javascript
const { logger } = require('./logs/structured-logger');

// General logging
logger.info('Application started', { version: '1.0.0' });

// Security events
logger.security('Unauthorized access attempt', { ip: '192.168.1.1' });

// Transaction logging
logger.transaction('Transaction processed', { txId: '123', status: 'success' });

// BLE events
logger.ble('Device connected', { deviceId: 'device-123' });
```

## 🚨 Alerting & Notifications

### Alert Channels
- **Slack**: Real-time notifications to different channels
- **Email**: Alert notifications to team members
- **PagerDuty**: Critical alert escalation
- **Webhooks**: Custom integrations

### Alert Routing
- **Critical Alerts**: Immediate notification to on-call team
- **Security Alerts**: Direct notification to security team
- **Operations Alerts**: Notification to operations team
- **Development Alerts**: Notification to development team

### Alert Templates
- Customized messages for different alert types
- Actionable information and next steps
- Links to monitoring dashboards
- Severity-based formatting

## 🔧 Deployment Scripts

### Environment Setup
```bash
# Setup development environment
npm run deploy:dev:setup

# Setup staging environment
npm run deploy:staging:setup

# Setup production environment
npm run deploy:prod:setup
```

### Security Checks
```bash
# Run security audit
npm run security:audit

# Check for security vulnerabilities
npm run security:check
```

### Code Quality
```bash
# Run linting
npm run lint

# Fix linting issues
npm run lint:fix
```

## 📈 Performance Monitoring

### Key Metrics
- **Response Time**: Average and 95th percentile
- **Throughput**: Requests per second
- **Error Rate**: 4xx and 5xx error percentages
- **Resource Usage**: CPU, memory, disk utilization
- **Transaction Processing**: Success rate, queue size, processing time

### Dashboards
- **Overview Dashboard**: High-level system health
- **Transaction Dashboard**: Transaction processing metrics
- **BLE Dashboard**: Bluetooth connectivity metrics
- **Security Dashboard**: Security events and threats
- **System Dashboard**: Resource utilization

## 🛡️ Security Best Practices

### Production Deployment
1. **Generate Secure Secrets**: Use `npm run generate-secrets`
2. **Configure Environment**: Set all required environment variables
3. **Enable Monitoring**: Start monitoring stack before deployment
4. **Test Security**: Run security checks and audits
5. **Monitor Alerts**: Set up alert notifications
6. **Backup Configuration**: Backup all configuration files

### Ongoing Maintenance
1. **Regular Updates**: Keep dependencies updated
2. **Security Audits**: Run regular security checks
3. **Log Review**: Monitor logs for security events
4. **Alert Response**: Respond to alerts promptly
5. **Performance Tuning**: Monitor and optimize performance
6. **Backup Verification**: Verify backup integrity

## 🚀 Quick Start for Production

1. **Clone and Setup**:
   ```bash
   git clone <repository>
   cd airchainpay-relay
   npm install
   ```

2. **Generate Secrets**:
   ```bash
   npm run generate-secrets prod
   ```

3. **Configure Environment**:
   ```bash
   cp env.prod .env
   # Edit .env with your production values
   ```

4. **Run Tests**:
   ```bash
   npm run test:coverage
   npm run security:check
   ```

5. **Start Monitoring**:
   ```bash
   npm run monitor:start
   ```

6. **Deploy Application**:
   ```bash
   # Docker deployment
   docker-compose -f docker-compose.prod.yml up -d
   
   # Or direct deployment
   NODE_ENV=production npm start
   ```

7. **Verify Deployment**:
   ```bash
   curl http://localhost:4000/health
   npm run test-endpoints
   ```

## 📞 Support & Troubleshooting

### Common Issues
- **BLE Not Working**: Check system Bluetooth permissions
- **High Error Rate**: Review transaction validation and blockchain connectivity
- **Memory Issues**: Monitor resource usage and consider scaling
- **Security Alerts**: Review access logs and update firewall rules

### Useful Commands
```bash
# View logs
tail -f logs/application.log

# Check health
curl http://localhost:4000/health

# Test endpoints
npm run test-endpoints

# Monitor resources
docker stats

# View alerts
curl http://localhost:9090/api/v1/alerts
```

### Emergency Procedures
1. **Server Down**: Check logs, restart service, verify network
2. **Security Breach**: Block IPs, review logs, notify security team
3. **Performance Issues**: Scale resources, optimize queries, review configuration
4. **Data Loss**: Restore from backup, verify integrity

---

**Production Readiness Status: 100% Complete**

The AirChainPay relay server is now fully production-ready with comprehensive testing, monitoring, security, and alerting capabilities. All critical components have been implemented and tested, including the complete BLE receive logic implementation. 