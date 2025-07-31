const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Core Testnet configuration
const CORE_TESTNET_CONFIG = {
  name: "Core Blockchain TestNet",
  chainId: 1114,
  rpcUrl: "https://rpc.test2.btcs.network",
  blockExplorer: "https://scan.test2.btcs.network",
  nativeCurrency: "tCORE2",
  gasPrice: "10000000000" // 10 gwei
};

async function deployToCoreTestnet() {
  console.log("🌐 AirChainPay - Core Testnet Deployment");
  console.log("========================================");
  
  try {
    // Get the contract factory
    const AirChainPay = await ethers.getContractFactory("AirChainPay");
    
    // Get deployer account
    const [deployer] = await ethers.getSigners();
    const balance = await deployer.provider.getBalance(deployer.address);
    
    console.log(`📝 Deploying with account: ${deployer.address}`);
    console.log(`💰 Account balance: ${ethers.formatEther(balance)} ${CORE_TESTNET_CONFIG.nativeCurrency}`);
    
    // Check if we have enough balance (at least 0.01 tCORE2)
    if (balance < ethers.parseEther("0.01")) {
      throw new Error(`Insufficient balance. Need at least 0.01 ${CORE_TESTNET_CONFIG.nativeCurrency}`);
    }
    
    // Deploy the contract
    console.log("📦 Deploying AirChainPay contract...");
    const contract = await AirChainPay.deploy();
    
    // Wait for deployment
    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();
    
    console.log(`✅ AirChainPay deployed to: ${contractAddress}`);
    console.log(`🔗 Block Explorer: ${CORE_TESTNET_CONFIG.blockExplorer}/address/${contractAddress}`);
    
    // Verify contract owner
    const owner = await contract.owner();
    console.log(`👤 Contract owner: ${owner}`);
    
    // Get deployment transaction details
    const deploymentTx = contract.deploymentTransaction();
    const receipt = await deploymentTx.wait();
    
    console.log(`📊 Gas used: ${receipt.gasUsed.toString()}`);
    console.log(`💰 Gas cost: ${ethers.formatEther(receipt.gasUsed * deploymentTx.gasPrice)} tCORE2`);
    
    // Save deployment info
    const deploymentInfo = {
      network: "core_testnet",
      chainName: CORE_TESTNET_CONFIG.name,
      chainId: CORE_TESTNET_CONFIG.chainId,
      contractAddress,
      owner,
      deployer: deployer.address,
      blockExplorer: CORE_TESTNET_CONFIG.blockExplorer,
      deployedAt: new Date().toISOString(),
      txHash: deploymentTx.hash,
      gasUsed: receipt.gasUsed.toString(),
      gasPrice: deploymentTx.gasPrice.toString(),
      blockNumber: receipt.blockNumber
    };
    
    // Create deployments directory if it doesn't exist
    const deploymentsDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    // Save individual deployment file
    const deploymentFile = path.join(deploymentsDir, "core_testnet.json");
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    
    console.log(`📄 Deployment info saved to: ${deploymentFile}`);
    
    // Update master deployment file
    const masterFile = path.join(deploymentsDir, "all-chains.json");
    let masterData = { deployments: [], lastUpdated: new Date().toISOString() };
    
    if (fs.existsSync(masterFile)) {
      try {
        masterData = JSON.parse(fs.readFileSync(masterFile, 'utf8'));
      } catch (error) {
        console.log("⚠️  Could not read existing master file, creating new one");
      }
    }
    
    // Add this deployment to the master file
    const existingIndex = masterData.deployments.findIndex(d => d.network === "core_testnet");
    if (existingIndex >= 0) {
      masterData.deployments[existingIndex] = deploymentInfo;
    } else {
      masterData.deployments.push(deploymentInfo);
    }
    
    fs.writeFileSync(masterFile, JSON.stringify(masterData, null, 2));
    console.log(`📋 Master deployment file updated: ${masterFile}`);
    
    console.log("\n🎉 Deployment completed successfully!");
    console.log("=====================================");
    console.log(`Contract Address: ${contractAddress}`);
    console.log(`Transaction Hash: ${deploymentTx.hash}`);
    console.log(`Block Explorer: ${CORE_TESTNET_CONFIG.blockExplorer}/tx/${deploymentTx.hash}`);
    
    return deploymentInfo;
    
  } catch (error) {
    console.error("❌ Deployment failed:", error.message);
    throw error;
  }
}

// Handle errors
deployToCoreTestnet()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Deployment script failed:", error);
    process.exit(1);
  }); 