# Deploy to all networks (including all three)
npx hardhat run scripts/deploy-multichain.js

# Deploy to specific network using multichain script
npx hardhat run scripts/deploy-multichain.js base_sepolia
npx hardhat run scripts/deploy-multichain.js core_testnet
npx hardhat run scripts/deploy-multichain.js lisk_sepolia

# Verify all deployments
npx hardhat run scripts/verify-deployments.js