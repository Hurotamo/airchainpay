const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function checkLiskSepoliaDeployment() {
  console.log("🔍 AirChainPay - Lisk Sepolia Testnet Deployment Check");
  console.log("=====================================================");
  
  try {
    // Check if deployment file exists
    const deploymentFile = path.join(__dirname, "../deployments/lisk_sepolia.json");
    
    if (!fs.existsSync(deploymentFile)) {
      console.log("❌ No deployment found for Lisk Sepolia Testnet");
      console.log("💡 To deploy, run: npx hardhat run scripts/deploy-lisk-sepolia.js --network lisk_sepolia");
      return;
    }
    
    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    
    console.log("📋 Deployment Information:");
    console.log(`   Network: ${deploymentInfo.chainName}`);
    console.log(`   Chain ID: ${deploymentInfo.chainId}`);
    console.log(`   Contract Address: ${deploymentInfo.contractAddress}`);
    console.log(`   Deployer: ${deploymentInfo.deployer}`);
    console.log(`   Owner: ${deploymentInfo.owner}`);
    console.log(`   Deployed At: ${deploymentInfo.deployedAt}`);
    console.log(`   Transaction Hash: ${deploymentInfo.txHash}`);
    console.log(`   Block Number: ${deploymentInfo.blockNumber}`);
    console.log(`   Gas Used: ${deploymentInfo.gasUsed}`);
    
    // Connect to the contract
    console.log("\n🔗 Connecting to deployed contract...");
    const contract = await ethers.getContractAt("AirChainPay", deploymentInfo.contractAddress);
    
    // Verify contract is accessible
    try {
      const owner = await contract.owner();
      console.log(`✅ Contract is accessible`);
      console.log(`👤 Current owner: ${owner}`);
      
      if (owner === deploymentInfo.owner) {
        console.log("✅ Owner verification passed");
      } else {
        console.log("⚠️  Owner has changed since deployment");
      }
      
    } catch (error) {
      console.log("❌ Contract is not accessible:", error.message);
    }
    
    // Check deployer balance
    const provider = ethers.provider;
    const balance = await provider.getBalance(deploymentInfo.deployer);
    console.log(`\n💰 Deployer balance: ${ethers.formatEther(balance)} ETH`);
    
    // Check contract balance
    const contractBalance = await provider.getBalance(deploymentInfo.contractAddress);
    console.log(`💰 Contract balance: ${ethers.formatEther(contractBalance)} ETH`);
    
    // Display useful links
    console.log("\n🔗 Useful Links:");
    console.log(`   Block Explorer: ${deploymentInfo.blockExplorer}/address/${deploymentInfo.contractAddress}`);
    console.log(`   Transaction: ${deploymentInfo.blockExplorer}/tx/${deploymentInfo.txHash}`);
    console.log(`   Network Info: https://chainlist.org/chain/4202`);
    
    console.log("\n✅ Deployment check completed successfully!");
    
  } catch (error) {
    console.error("❌ Deployment check failed:", error.message);
    throw error;
  }
}

// Handle errors
checkLiskSepoliaDeployment()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Check script failed:", error);
    process.exit(1);
  }); 