# Deploy to Base Sepolia only
npx hardhat run scripts/deploy-base-sepolia.js --network base_sepolia

# Verify Base Sepolia contract
npx hardhat run scripts/verify-base-sepolia.js --network base_sepolia

# Check Base Sepolia deployment status
npx hardhat run scripts/check-base-sepolia.js --network base_sepolia