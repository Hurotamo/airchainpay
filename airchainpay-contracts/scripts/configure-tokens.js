const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function configureTokens(networkName) {
  console.log(`\n🔧 Configuring tokens for ${networkName}...`);
  
  try {
    // Load deployment info
    const deploymentFile = path.join(__dirname, "../deployments", `${networkName}-token.json`);
    if (!fs.existsSync(deploymentFile)) {
      throw new Error(`Deployment file not found: ${deploymentFile}`);
    }
    
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    console.log(`📄 Loaded deployment: ${deployment.contractAddress}`);
    
    // Get contract instance
    const AirChainPayToken = await ethers.getContractFactory("AirChainPayToken");
    const contract = AirChainPayToken.attach(deployment.contractAddress);
    
    // Get deployer account
    const [deployer] = await ethers.getSigners();
    console.log(`📝 Using account: ${deployer.address}`);
    
    // Configure USDC
    if (deployment.testTokens && deployment.testTokens.usdc) {
      console.log("🪙 Configuring USDC...");
      const usdcTx = await contract.addToken(
        deployment.testTokens.usdc,
        "USDC",
        true, // isStablecoin
        6,    // decimals
        ethers.parseUnits("1", 6),      // minAmount (1 USDC)
        ethers.parseUnits("100000", 6)  // maxAmount (100,000 USDC)
      );
      await usdcTx.wait();
      console.log(`✅ USDC configured: ${deployment.testTokens.usdc}`);
    }
    
    // Configure USDT
    if (deployment.testTokens && deployment.testTokens.usdt) {
      console.log("🪙 Configuring USDT...");
      const usdtTx = await contract.addToken(
        deployment.testTokens.usdt,
        "USDT",
        true, // isStablecoin
        6,    // decimals
        ethers.parseUnits("1", 6),      // minAmount (1 USDT)
        ethers.parseUnits("100000", 6)  // maxAmount (100,000 USDT)
      );
      await usdtTx.wait();
      console.log(`✅ USDT configured: ${deployment.testTokens.usdt}`);
    }
    
    // Get updated supported tokens
    const supportedTokens = await contract.getSupportedTokens();
    console.log(`🎯 Total supported tokens: ${supportedTokens.length}`);
    
    // Update deployment file
    deployment.supportedTokens = supportedTokens;
    deployment.tokensConfigured = true;
    deployment.lastUpdated = new Date().toISOString();
    
    fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
    console.log(`📄 Updated deployment file: ${deploymentFile}`);
    
    return deployment;
    
  } catch (error) {
    console.error(`❌ Token configuration failed:`, error.message);
    throw error;
  }
}

async function main() {
  console.log("🔧 AirChainPay Token Configuration");
  console.log("==================================");
  
  const networkName = network.name;
  console.log(`🌐 Network: ${networkName}`);
  
  try {
    const result = await configureTokens(networkName);
    
    console.log("\n✅ Configuration completed successfully!");
    console.log(`📊 Contract: ${result.contractAddress}`);
    console.log(`🪙 USDC: ${result.testTokens?.usdc || 'Not configured'}`);
    console.log(`🪙 USDT: ${result.testTokens?.usdt || 'Not configured'}`);
    
  } catch (error) {
    console.error("\n❌ Configuration failed:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 