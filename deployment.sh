# Generate production secrets
cd airchainpay-relay
npm run generate-secrets prod

# Configure production environment
cp sample.env.prod.sh .env.prod
# Edit .env.prod with your production values

# Deploy relay server
cd airchainpay-relay
node scripts/deploy.js prod setup
node scripts/deploy.js prod secrets
node scripts/deploy.js prod validate
docker-compose -f docker-compose.prod.yml up -d

# Deploy mainnet contracts
cd airchainpay-contracts
# Update hardhat.config.js with mainnet networks
npx hardhat run scripts/deploy-multichain.js --network base-mainnet
npx hardhat run scripts/deploy-multichain.js --network core-mainnet




 AREAS NEEDING ATTENTION
1. Mobile Wallet Issues
❌ Camera permissions not implemented (CameraPermissions.ts has TODO items)
❌ Some BLE functionality may need testing in production environment
❌ Need production app store deployment configuration
2. Production Configuration
⚠️ Mainnet contracts not deployed (currently only testnet)
⚠️ Production RPC endpoints need configuration
⚠️ SSL certificates and domain setup required
3. Security & Compliance
⚠️ Production secrets need to be generated (templates provided)
⚠️ Firewall and network security setup required
⚠️ Compliance documentation needed
npx expo install expo-camera 
eas build --profile development --platform android