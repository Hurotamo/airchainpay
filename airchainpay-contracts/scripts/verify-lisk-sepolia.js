const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function verifyLiskSepoliaContract() {
  console.log("🔍 AirChainPay - Lisk Sepolia Testnet Contract Verification");
  console.log("==========================================================");
  
  try {
    // Read deployment info
    const deploymentFile = path.join(__dirname, "../deployments/lisk_sepolia.json");
    
    if (!fs.existsSync(deploymentFile)) {
      throw new Error("Deployment file not found. Please deploy the contract first.");
    }
    
    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    const contractAddress = deploymentInfo.contractAddress;
    
    console.log(`📋 Contract Address: ${contractAddress}`);
    console.log(`🔗 Block Explorer: ${deploymentInfo.blockExplorer}/address/${contractAddress}`);
    
    // Verify the contract on Lisk Sepolia
    console.log("🔍 Verifying contract on Lisk Sepolia...");
    
    try {
      await hre.run("verify:verify", {
        address: contractAddress,
        constructorArguments: [],
        network: "lisk_sepolia"
      });
      
      console.log("✅ Contract verified successfully!");
      console.log(`🔗 Verified at: ${deploymentInfo.blockExplorer}/address/${contractAddress}`);
      
    } catch (verificationError) {
      if (verificationError.message.includes("Already Verified")) {
        console.log("✅ Contract is already verified!");
      } else {
        console.error("❌ Verification failed:", verificationError.message);
        throw verificationError;
      }
    }
    
    // Test contract functionality
    console.log("\n🧪 Testing contract functionality...");
    
    const contract = await ethers.getContractAt("AirChainPay", contractAddress);
    
    // Test owner
    const owner = await contract.owner();
    console.log(`👤 Contract owner: ${owner}`);
    
    // Test if owner matches deployer
    if (owner === deploymentInfo.deployer) {
      console.log("✅ Owner verification passed");
    } else {
      console.log("⚠️  Owner verification failed - owner doesn't match deployer");
    }
    
    console.log("\n🎉 Verification process completed!");
    
  } catch (error) {
    console.error("❌ Verification failed:", error.message);
    throw error;
  }
}

// Handle errors
verifyLiskSepoliaContract()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Verification script failed:", error);
    process.exit(1);
  }); 