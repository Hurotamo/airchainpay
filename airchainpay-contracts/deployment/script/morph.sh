# Deploy to Holesky only
npx hardhat run scripts/deploy-holesky.js --network holesky

# Verify Holesky contract
npx hardhat run scripts/verify-holesky.js --network holesky

# Check Holesky deployment status
npx hardhat run scripts/check-holesky.js --network holesky