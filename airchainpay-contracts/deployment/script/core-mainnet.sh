# Deploy to Core Mainnet only
npx hardhat run scripts/deploy-core-mainnet.js --network core_mainnet

# Verify Core Mainnet contract
npx hardhat run scripts/verify-core-mainnet.js --network core_mainnet

# Check Core Mainnet deployment status
npx hardhat run scripts/check-core-mainnet.js --network core_mainnet 