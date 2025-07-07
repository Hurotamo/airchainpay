# AirChainPay Relay - Production Setup Guide

## 🔐 Security Setup

### 1. Generate Secure Secrets

Run the secret generation script:
```bash
npm run generate-secrets
```

This will generate:
- **API_KEY**: For authenticating client requests
- **JWT_SECRET**: For signing JSON Web Tokens
- **SESSION_SECRET**: For session management (optional)

### 2. Environment Configuration

Copy `env.example` to `.env`:
```bash
cp env.example .env
```

Update the `.env` file with your generated secrets and environment-specific values.

## 🚀 Deployment Options

### Option 1: Docker Deployment (Recommended)

1. **Build the Docker image:**
```bash
docker build -t airchainpay-relay .
```

2. **Run with Docker Compose:**
```bash
docker-compose up -d
```

3. **Check logs:**
```bash
docker-compose logs -f relay
```

### Option 2: Direct Node.js Deployment

1. **Install dependencies:**
```bash
npm ci --only=production
```

2. **Start the server:**
```bash
NODE_ENV=production npm start
```

### Option 3: PM2 Process Manager

1. **Install PM2:**
```bash
npm install -g pm2
```

2. **Create ecosystem file:**
```bash
pm2 init
```

3. **Start with PM2:**
```bash
pm2 start ecosystem.config.js
```

## 🔧 Environment Variables

### Required for Production:
```bash
NODE_ENV=production
API_KEY=your_generated_api_key
JWT_SECRET=your_generated_jwt_secret
PORT=4000
LOG_LEVEL=info
```

### Optional Configuration:
```bash
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
RATE_LIMIT_MAX=100
```

### Blockchain Configuration:
```bash
# Base Sepolia
BASE_SEPOLIA_CONTRACT_ADDRESS=0x7B79117445C57eea1CEAb4733020A55e1D503934
RPC_URL=https://sepolia.base.org
CHAIN_ID=84532

# Core Testnet
CORE_TESTNET_CONTRACT_ADDRESS=0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB
```

## 🛡️ Security Checklist

- [ ] Generate unique secrets for each environment
- [ ] Use HTTPS in production
- [ ] Configure firewall rules
- [ ] Set up monitoring and logging
- [ ] Implement rate limiting
- [ ] Use secure RPC endpoints
- [ ] Regular secret rotation
- [ ] Monitor for unauthorized access

## 📊 Monitoring & Health Checks

### Health Check Endpoint:
```bash
curl http://your-relay-domain:4000/health
```

Expected response:
```json
{
  "status": "healthy",
  "bleStatus": "running",
  "connectedDevices": 0,
  "queuedTransactions": 0
}
```

### Test All Endpoints:
```bash
npm run test-endpoints
```

## 🔍 Troubleshooting

### Common Issues:

1. **Port already in use:**
```bash
lsof -i :4000
kill -9 <PID>
```

2. **BLE not working:**
- Check system Bluetooth permissions
- May not work in all environments (acceptable for production)

3. **Contract connection issues:**
- Verify RPC URL is accessible
- Check contract addresses are correct
- Ensure network connectivity

## 📝 Production Checklist

- [ ] Secrets generated and configured
- [ ] Environment variables set
- [ ] Docker/PM2 configured
- [ ] Health checks passing
- [ ] All tests passing
- [ ] Monitoring configured
- [ ] Logs being captured
- [ ] Backup strategy in place
- [ ] SSL certificate configured
- [ ] Firewall rules set

## 🚨 Emergency Procedures

### Restart Service:
```bash
# Docker
docker-compose restart relay

# PM2
pm2 restart airchainpay-relay

# Direct
pkill -f "node src/server.js"
npm start
```

### View Logs:
```bash
# Docker
docker-compose logs relay

# PM2
pm2 logs airchainpay-relay

# Direct
tail -f logs/app.log
```

## 📞 Support

For issues or questions:
1. Check the logs first
2. Run health checks
3. Verify configuration
4. Test endpoints manually
5. Review security settings 