# Deploy to Core Testnet only
npx hardhat run scripts/deploy-core-testnet.js --network core_testnet

# Verify Core Testnet contract
npx hardhat run scripts/verify-core-testnet.js --network core_testnet

# Check Core Testnet deployment status
npx hardhat run scripts/check-core-testnet.js --network core_testnet