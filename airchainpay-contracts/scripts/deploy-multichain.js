const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Chain configurations
const CHAIN_CONFIGS = {
  base_sepolia: {
    name: "Base Sepolia",
    chainId: 84532,
    rpcUrl: "https://sepolia.base.org",
    blockExplorer: "https://sepolia.basescan.org",
    nativeCurrency: "ETH"
  },
  core_testnet: {
    name: "Core Blockchain TestNet",
    chainId: 1114,
    rpcUrl: "https://rpc.test2.btcs.network",
    blockExplorer: "https://scan.test2.btcs.network",
    nativeCurrency: "tCORE2"
  },
  lisk_sepolia: {
    name: "Lisk Sepolia Testnet",
    chainId: 4202,
    rpcUrl: "https://rpc.sepolia-api.lisk.com",
    blockExplorer: "https://sepolia.lisk.com",
    nativeCurrency: "ETH"
  },
  holesky: {
    name: "Ethereum Holesky",
    chainId: 17000,
    rpcUrl: "https://ethereum-holesky-rpc.publicnode.com/",
    blockExplorer: "https://holesky.etherscan.io",
    nativeCurrency: "ETH"
  },
  localhost: {
    name: "Localhost",
    chainId: 31337,
    rpcUrl: "http://127.0.0.1:8545",
    blockExplorer: "N/A",
    nativeCurrency: "ETH"
  }
};

async function deployToChain(chainName) {
  console.log(`\n🚀 Deploying to ${CHAIN_CONFIGS[chainName].name}...`);
  
  try {
    // Get the contract factory
    const AirChainPay = await ethers.getContractFactory("AirChainPay");
    
    // Get deployer account
    const [deployer] = await ethers.getSigners();
    const balance = await deployer.provider.getBalance(deployer.address);
    
    console.log(`📝 Deploying with account: ${deployer.address}`);
    console.log(`💰 Account balance: ${ethers.formatEther(balance)} ${CHAIN_CONFIGS[chainName].nativeCurrency}`);
    
    // Check if we have enough balance (at least 0.01 ETH/tCORE)
    if (balance < ethers.parseEther("0.01")) {
      throw new Error(`Insufficient balance. Need at least 0.01 ${CHAIN_CONFIGS[chainName].nativeCurrency}`);
    }
    
    // Deploy the contract
    console.log("📦 Deploying AirChainPay contract...");
    const contract = await AirChainPay.deploy();
    
    // Wait for deployment
    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();
    
    console.log(`✅ AirChainPay deployed to: ${contractAddress}`);
    console.log(`🔗 Block Explorer: ${CHAIN_CONFIGS[chainName].blockExplorer}/address/${contractAddress}`);
    
    // Verify contract owner
    const owner = await contract.owner();
    console.log(`👤 Contract owner: ${owner}`);
    
    // Save deployment info
    const deploymentInfo = {
      chainName,
      chainId: CHAIN_CONFIGS[chainName].chainId,
      contractAddress,
      owner,
      deployer: deployer.address,
      blockExplorer: CHAIN_CONFIGS[chainName].blockExplorer,
      deployedAt: new Date().toISOString(),
      txHash: contract.deploymentTransaction()?.hash
    };
    
    // Create deployments directory if it doesn't exist
    const deploymentsDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    // Save individual deployment file
    const deploymentFile = path.join(deploymentsDir, `${chainName}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    
    console.log(`📄 Deployment info saved to: ${deploymentFile}`);
    
    return deploymentInfo;
    
  } catch (error) {
    console.error(`❌ Deployment to ${chainName} failed:`, error.message);
    throw error;
  }
}

async function main() {
  console.log("🌐 AirChainPay Multi-Chain Deployment");
  console.log("=====================================");
  
  // Get network from command line args or use all networks
  const networkArg = process.argv[2];
  const networks = networkArg ? [networkArg] : Object.keys(CHAIN_CONFIGS);
  
  const deployments = [];
  const failures = [];
  
  for (const network of networks) {
    if (!CHAIN_CONFIGS[network]) {
      console.error(`❌ Unknown network: ${network}`);
      continue;
    }
    
    try {
      // Switch to the network
      if (network !== "localhost") {
        console.log(`🔄 Switching to network: ${network}`);
      }
      
      const deployment = await deployToChain(network);
      deployments.push(deployment);
      
      // Wait a bit between deployments
      if (networks.length > 1) {
        console.log("⏳ Waiting 5 seconds before next deployment...");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
    } catch (error) {
      failures.push({ network, error: error.message });
    }
  }
  
  // Summary
  console.log("\n📊 DEPLOYMENT SUMMARY");
  console.log("======================");
  
  if (deployments.length > 0) {
    console.log(`✅ Successful deployments: ${deployments.length}`);
    deployments.forEach(d => {
      console.log(`   • ${d.chainName}: ${d.contractAddress}`);
    });
  }
  
  if (failures.length > 0) {
    console.log(`❌ Failed deployments: ${failures.length}`);
    failures.forEach(f => {
      console.log(`   • ${f.network}: ${f.error}`);
    });
  }
  
  // Save master deployment file
  const masterFile = path.join(__dirname, "../deployments/all-chains.json");
  const masterData = {
    deployments,
    failures,
    totalDeployments: deployments.length,
    totalFailures: failures.length,
    lastUpdated: new Date().toISOString()
  };
  
  fs.writeFileSync(masterFile, JSON.stringify(masterData, null, 2));
  console.log(`\n📋 Master deployment file: ${masterFile}`);
  
  if (failures.length > 0) {
    process.exit(1);
  }
}

// Handle errors
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Deployment script failed:", error);
    process.exit(1);
  }); 