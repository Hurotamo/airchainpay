# Relay Configuration Guide

## Overview
The AirChainPay wallet uses a secure configuration system for relay endpoints that automatically adapts to different environments.

## Environment Configuration

### Development
For local development, the wallet automatically uses:
- `http://localhost:4000`
- `http://127.0.0.1:4000` 
- `http://10.0.2.2:4000` (Android emulator)

### Production
Set these environment variables for production:

```bash
# Primary relay server
RELAY_URL=https://relay.airchainpay.com

# Backup relay server (optional)
RELAY_BACKUP_URL=https://relay-backup.airchainpay.com

# Environment
NODE_ENV=production
```

### Staging
Set these environment variables for staging:

```bash
# Staging relay server
STAGING_RELAY_URL=https://staging-relay.airchainpay.com

# Environment
NODE_ENV=staging
```

## Security Benefits

✅ **No hardcoded IP addresses** in the codebase  
✅ **Environment-specific configuration**  
✅ **Fallback endpoints** for reliability  
✅ **Secure by default** - development URLs only work locally  

## Configuration Files

- `src/constants/config.ts` - Main configuration logic
- `src/services/transports/RelayTransport.ts` - Uses configuration
- `test-relay-connection.js` - Test script with configuration

## Deployment Checklist

1. Set appropriate environment variables
2. Ensure relay servers are accessible
3. Test connectivity with `test-relay-connection.js`
4. Verify health endpoints respond correctly 