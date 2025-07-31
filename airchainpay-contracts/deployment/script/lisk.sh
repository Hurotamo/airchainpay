# Deploy to Lisk Sepolia only
npx hardhat run scripts/deploy-lisk-sepolia.js --network lisk_sepolia

# Deploy to all networks (including Lisk Sepolia)
npx hardhat run scripts/deploy-multichain.js

# Deploy to specific network
npx hardhat run scripts/deploy-multichain.js lisk_sepolia

# Verify Lisk Sepolia contract
npx hardhat run scripts/verify-lisk-sepolia.js --network lisk_sepolia

# Check Lisk Sepolia deployment status
npx hardhat run scripts/check-lisk-sepolia.js --network lisk_sepolia