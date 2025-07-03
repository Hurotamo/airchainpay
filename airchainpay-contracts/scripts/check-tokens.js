const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function checkTokens(networkName) {
  console.log(`\n🔍 Checking supported tokens for ${networkName}...`);
  
  try {
    // Load deployment info
    const deploymentFile = path.join(__dirname, "../deployments", `${networkName}-token.json`);
    if (!fs.existsSync(deploymentFile)) {
      throw new Error(`Deployment file not found: ${deploymentFile}`);
    }
    
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    console.log(`📄 Contract: ${deployment.contractAddress}`);
    
    // Get contract instance
    const AirChainPayToken = await ethers.getContractFactory("AirChainPayToken");
    const contract = AirChainPayToken.attach(deployment.contractAddress);
    
    // Get supported tokens
    const supportedTokens = await contract.getSupportedTokens();
    console.log(`🎯 Total supported tokens: ${supportedTokens.length}`);
    
    // Check each token
    for (let i = 0; i < supportedTokens.length; i++) {
      const tokenAddress = supportedTokens[i];
      
      try {
        const tokenInfo = await contract.getTokenInfo(tokenAddress);
        console.log(`\n📄 Token ${i + 1}:`);
        console.log(`   Address: ${tokenAddress}`);
        console.log(`   Symbol: ${tokenInfo.symbol}`);
        console.log(`   Decimals: ${tokenInfo.decimals}`);
        console.log(`   Is Stablecoin: ${tokenInfo.isStablecoin}`);
        console.log(`   Min Amount: ${ethers.formatUnits(tokenInfo.minAmount, tokenInfo.decimals)}`);
        console.log(`   Max Amount: ${ethers.formatUnits(tokenInfo.maxAmount, tokenInfo.decimals)}`);
        console.log(`   Is Active: ${tokenInfo.isActive}`);
        
        // Check if it's native token
        if (tokenAddress === "0x0000000000000000000000000000000000000000") {
          console.log(`   Type: Native Token`);
        } else {
          console.log(`   Type: ERC-20 Token`);
          
          // Check if it matches our deployed test tokens
          if (deployment.testTokens) {
            if (tokenAddress.toLowerCase() === deployment.testTokens.usdc?.toLowerCase()) {
              console.log(`   🪙 This is our deployed USDC`);
            } else if (tokenAddress.toLowerCase() === deployment.testTokens.usdt?.toLowerCase()) {
              console.log(`   🪙 This is our deployed USDT`);
            }
          }
        }
        
      } catch (error) {
        console.log(`   ❌ Error getting token info: ${error.message}`);
      }
    }
    
    return {
      contractAddress: deployment.contractAddress,
      supportedTokens,
      testTokens: deployment.testTokens
    };
    
  } catch (error) {
    console.error(`❌ Token check failed:`, error.message);
    throw error;
  }
}

async function main() {
  console.log("🔍 AirChainPay Token Status Check");
  console.log("=================================");
  
  const networkName = network.name;
  console.log(`🌐 Network: ${networkName}`);
  
  try {
    const result = await checkTokens(networkName);
    
    console.log("\n📊 SUMMARY");
    console.log("===========");
    console.log(`📍 Contract: ${result.contractAddress}`);
    console.log(`🎯 Supported Tokens: ${result.supportedTokens.length}`);
    
    if (result.testTokens) {
      console.log(`\n🧪 Test Tokens Deployed:`);
      console.log(`   USDC: ${result.testTokens.usdc || 'Not deployed'}`);
      console.log(`   USDT: ${result.testTokens.usdt || 'Not deployed'}`);
    }
    
  } catch (error) {
    console.error("\n❌ Check failed:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 