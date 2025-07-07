# AirChainPay Relay - Environment Setup Guide

This guide explains how to set up and manage different environments (dev/staging/prod) for the AirChainPay relay server with proper secret management.

## 🏗️ Environment Structure

The relay server supports three environments:

- **Development (dev)**: Local development with relaxed security
- **Staging**: Pre-production testing with moderate security
- **Production (prod)**: Live environment with strict security

## 📁 Environment Files

### Template Files
- `env.dev` - Development environment template
- `env.staging` - Staging environment template  
- `env.prod` - Production environment template

### Actual Environment Files
- `.env.dev` - Development environment configuration (generated)
- `.env.staging` - Staging environment configuration (generated)
- `.env.prod` - Production environment configuration (generated)

## 🔐 Secret Management

### Development Secrets
- **API Key**: Predictable, less secure keys for local development
- **JWT Secret**: Development-specific JWT signing secret
- **Security**: Relaxed CORS, higher rate limits, debug enabled

### Staging Secrets
- **API Key**: Cryptographically secure, environment-specific
- **JWT Secret**: Secure JWT signing secret for staging
- **Security**: Moderate CORS restrictions, balanced rate limits

### Production Secrets
- **API Key**: Maximum security, cryptographically random
- **JWT Secret**: High-security JWT signing secret
- **Security**: Strict CORS, low rate limits, no debug features

## 🚀 Quick Start

### 1. Setup Development Environment
```bash
# Setup development environment
node scripts/deploy.js dev setup

# Generate development secrets
node scripts/deploy.js dev secrets

# Validate configuration
node scripts/deploy.js dev validate

# Deploy development server
node scripts/deploy.js dev deploy
```

### 2. Setup Staging Environment
```bash
# Setup staging environment
node scripts/deploy.js staging setup

# Generate staging secrets
node scripts/deploy.js staging secrets

# Validate configuration
node scripts/deploy.js staging validate

# Deploy staging server
node scripts/deploy.js staging deploy
```

### 3. Setup Production Environment
```bash
# Setup production environment
node scripts/deploy.js prod setup

# Generate production secrets
node scripts/deploy.js prod secrets

# Validate configuration
node scripts/deploy.js prod validate

# Deploy production server
node scripts/deploy.js prod deploy
```

## 🔧 Manual Setup

### Generate Secrets Manually
```bash
# Generate secrets for specific environment
node scripts/generate-secrets.js dev
node scripts/generate-secrets.js staging
node scripts/generate-secrets.js prod
```

### Environment-Specific Configuration

#### Development (.env.dev)
```bash
NODE_ENV=development
PORT=4000
LOG_LEVEL=debug
API_KEY=dev_api_key_1234567890abcdef...
JWT_SECRET=dev_jwt_secret_1234567890abcdef...
CORS_ORIGINS=*
RATE_LIMIT_MAX=1000
DEBUG=true
ENABLE_SWAGGER=true
```

#### Staging (.env.staging)
```bash
NODE_ENV=staging
PORT=4000
LOG_LEVEL=info
API_KEY=staging_api_key_9876543210fedcba...
JWT_SECRET=staging_jwt_secret_9876543210fedcba...
CORS_ORIGINS=https://staging.airchainpay.com,https://staging-wallet.airchainpay.com
RATE_LIMIT_MAX=500
DEBUG=false
ENABLE_SWAGGER=true
```

#### Production (.env.prod)
```bash
NODE_ENV=production
PORT=4000
LOG_LEVEL=warn
API_KEY=PRODUCTION_API_KEY_PLACEHOLDER_REPLACE_WITH_SECURE_KEY
JWT_SECRET=PRODUCTION_JWT_SECRET_PLACEHOLDER_REPLACE_WITH_SECURE_SECRET
CORS_ORIGINS=https://app.airchainpay.com,https://wallet.airchainpay.com
RATE_LIMIT_MAX=100
DEBUG=false
ENABLE_SWAGGER=false
```

## 🔒 Security Best Practices

### Development
- Use predictable secrets for easy debugging
- Enable all debug features
- Allow all CORS origins
- Higher rate limits for testing

### Staging
- Use cryptographically secure secrets
- Moderate security restrictions
- Enable monitoring and health checks
- Test production-like conditions

### Production
- **ALWAYS** generate new secure secrets
- Use mainnet contracts and RPC URLs
- Strict security restrictions
- Full monitoring and alerting
- Regular secret rotation

## 🛠️ Scripts Reference

### Deployment Script
```bash
node scripts/deploy.js [environment] [action]
```

**Actions:**
- `setup` - Create environment configuration
- `secrets` - Generate environment-specific secrets
- `validate` - Validate environment configuration
- `deploy` - Deploy to environment

### Secrets Generation Script
```bash
node scripts/generate-secrets.js [environment]
```

**Features:**
- Generates cryptographically secure secrets
- Updates environment template files
- Creates actual .env files
- Provides security reminders

## 🔍 Configuration Validation

The system validates:

### Development
- Basic configuration presence
- Development-specific settings

### Staging
- API key and JWT secret presence
- Staging-specific configuration

### Production
- All required secrets present
- Production-grade security settings
- Mainnet contract addresses
- Proper CORS and rate limiting

## 📊 Environment Comparison

| Feature | Development | Staging | Production |
|---------|-------------|---------|------------|
| **Log Level** | debug | info | warn |
| **CORS** | * (all) | staging domains | production domains |
| **Rate Limit** | 1000 req/15min | 500 req/15min | 100 req/15min |
| **Debug** | enabled | disabled | disabled |
| **Swagger** | enabled | enabled | disabled |
| **Monitoring** | basic | moderate | full |
| **Secrets** | predictable | secure | maximum security |
| **Contracts** | testnet | testnet | mainnet |

## 🚨 Security Warnings

### ⚠️ Critical Security Notes

1. **Never commit .env files to version control**
2. **Use different secrets for each environment**
3. **Rotate production secrets regularly**
4. **Use secure secret management in production**
5. **Monitor for unauthorized access**
6. **Validate all configuration before deployment**

### 🔐 Production Security Checklist

- [ ] Generate new secure secrets
- [ ] Use mainnet contracts and RPC URLs
- [ ] Enable all security features
- [ ] Set up monitoring and alerting
- [ ] Configure proper CORS origins
- [ ] Set appropriate rate limits
- [ ] Disable debug features
- [ ] Use HTTPS only
- [ ] Regular security audits

## 🐛 Troubleshooting

### Common Issues

**"Template file not found"**
```bash
# Check available templates
ls env.*

# Create missing template
cp env.example env.[environment]
```

**"Configuration validation failed"**
```bash
# Check environment file exists
ls .env.[environment]

# Regenerate secrets
node scripts/deploy.js [environment] secrets
```

**"Missing required configuration"**
```bash
# Validate configuration
node scripts/deploy.js [environment] validate

# Check environment file content
cat .env.[environment]
```

## 📞 Support

For issues with environment setup:

1. Check the configuration validation
2. Review the security checklist
3. Ensure all required files exist
4. Verify secrets are properly generated
5. Check environment-specific settings

---

**Remember**: Security is paramount in production environments. Always follow security best practices and never use development secrets in production! 