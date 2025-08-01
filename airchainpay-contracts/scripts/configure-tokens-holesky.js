const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Holesky token configurations
const HOLESKY_TOKENS = {
  // Mock USDC for testing (you'll need to deploy or get real addresses)
  USDC: {
    address: "0x0000000000000000000000000000000000000000", // Replace with actual USDC address
    symbol: "USDC",
    isStablecoin: true,
    decimals: 6,
    minAmount: ethers.parseUnits("1", 6), // 1 USDC
    maxAmount: ethers.parseUnits("10000", 6) // 10,000 USDC
  },
  // Mock USDT for testing (you'll need to deploy or get real addresses)
  USDT: {
    address: "0x0000000000000000000000000000000000000000", // Replace with actual USDT address
    symbol: "USDT",
    isStablecoin: true,
    decimals: 6,
    minAmount: ethers.parseUnits("1", 6), // 1 USDT
    maxAmount: ethers.parseUnits("10000", 6) // 10,000 USDT
  }
};

async function configureTokensForHolesky() {
  console.log("⚙️  AirChainPayToken - Holesky Token Configuration");
  console.log("==================================================");
  
  try {
    // Load deployment info
    const deploymentsDir = path.join(__dirname, "../deployments");
    const deploymentFile = path.join(deploymentsDir, "holesky_airchainpaytoken.json");
    
    if (!fs.existsSync(deploymentFile)) {
      throw new Error("AirChainPayToken deployment not found. Please deploy the contract first.");
    }
    
    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    const contractAddress = deploymentInfo.contractAddress;
    
    console.log(`📋 Using contract: ${contractAddress}`);
    
    // Get the contract instance
    const AirChainPayToken = await ethers.getContractFactory("AirChainPayToken");
    const contract = AirChainPayToken.attach(contractAddress);
    
    // Get deployer account
    const [deployer] = await ethers.getSigners();
    console.log(`👤 Configuring with account: ${deployer.address}`);
    
    // Check if deployer is the contract owner
    const owner = await contract.owner();
    if (owner !== deployer.address) {
      throw new Error("Deployer is not the contract owner. Cannot configure tokens.");
    }
    
    console.log("✅ Deployer is contract owner");
    
    // Configure each token
    for (const [tokenName, tokenConfig] of Object.entries(HOLESKY_TOKENS)) {
      console.log(`\n📦 Configuring ${tokenName}...`);
      
      // Check if token address is valid (not zero address)
      if (tokenConfig.address === "0x0000000000000000000000000000000000000000") {
        console.log(`⚠️  ${tokenName} address not set. Skipping configuration.`);
        console.log(`   Please update the address in this script and run again.`);
        continue;
      }
      
      try {
        // Add token to the contract
        const tx = await contract.addToken(
          tokenConfig.address,
          tokenConfig.symbol,
          tokenConfig.isStablecoin,
          tokenConfig.decimals,
          tokenConfig.minAmount,
          tokenConfig.maxAmount
        );
        
        console.log(`⏳ Adding ${tokenName}...`);
        const receipt = await tx.wait();
        
        console.log(`✅ ${tokenName} configured successfully!`);
        console.log(`   Address: ${tokenConfig.address}`);
        console.log(`   Symbol: ${tokenConfig.symbol}`);
        console.log(`   Decimals: ${tokenConfig.decimals}`);
        console.log(`   Min Amount: ${ethers.formatUnits(tokenConfig.minAmount, tokenConfig.decimals)} ${tokenConfig.symbol}`);
        console.log(`   Max Amount: ${ethers.formatUnits(tokenConfig.maxAmount, tokenConfig.decimals)} ${tokenConfig.symbol}`);
        console.log(`   Transaction: ${receipt.hash}`);
        
      } catch (error) {
        console.error(`❌ Failed to configure ${tokenName}:`, error.message);
        
        // Check if token is already configured
        if (error.message.includes("Token already supported")) {
          console.log(`   ${tokenName} is already configured.`);
        } else {
          throw error;
        }
      }
    }
    
    // Verify token configuration
    console.log("\n🔍 Verifying token configuration...");
    
    const supportedTokens = await contract.getSupportedTokens();
    console.log(`📋 Total supported tokens: ${supportedTokens.length}`);
    
    for (let i = 0; i < supportedTokens.length; i++) {
      const tokenAddress = supportedTokens[i];
      const config = await contract.getTokenConfig(tokenAddress);
      
      if (tokenAddress === ethers.ZeroAddress) {
        console.log(`   ${i + 1}. Native Token (${config.symbol})`);
      } else {
        console.log(`   ${i + 1}. ${config.symbol} (${tokenAddress})`);
      }
    }
    
    console.log("\n🎉 Token configuration completed successfully!");
    console.log("=====================================");
    console.log("📝 Note: Update token addresses in this script for real tokens");
    console.log("🔗 Contract: " + contractAddress);
    
  } catch (error) {
    console.error("❌ Token configuration failed:", error.message);
    throw error;
  }
}

// Handle errors
configureTokensForHolesky()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Configuration script failed:", error);
    process.exit(1);
  }); 