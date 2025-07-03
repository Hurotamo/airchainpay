const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Token configurations for different chains
const TOKEN_CONFIGS = {
  base_sepolia: {
    chainName: "Base Sepolia",
    tokens: [
      {
        name: "USDC",
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
        symbol: "USDC",
        decimals: 6,
        isStablecoin: true,
        minAmount: "1000000", // 1 USDC (6 decimals)
        maxAmount: "100000000000", // 100,000 USDC
      },
      {
        name: "USDT",
        address: "0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df", // Base Sepolia USDT (if available)
        symbol: "USDT",
        decimals: 6,
        isStablecoin: true,
        minAmount: "1000000", // 1 USDT
        maxAmount: "100000000000", // 100,000 USDT
      }
    ]
  },
  core_testnet: {
    chainName: "Core Blockchain TestNet",
    tokens: [
      {
        name: "USDC",
        address: "0x", // Core Testnet USDC (to be updated)
        symbol: "USDC",
        decimals: 6,
        isStablecoin: true,
        minAmount: "1000000", // 1 USDC
        maxAmount: "100000000000", // 100,000 USDC
      },
      {
        name: "USDT",
        address: "0x", // Core Testnet USDT (to be updated)
        symbol: "USDT",
        decimals: 6,
        isStablecoin: true,
        minAmount: "1000000", // 1 USDT
        maxAmount: "100000000000", // 100,000 USDT
      }
    ]
  }
};

async function deployTokenContract(chainName) {
  console.log(`\n🚀 Deploying AirChainPayToken to ${TOKEN_CONFIGS[chainName].chainName}...`);
  
  try {
    // Get the contract factory
    const AirChainPayToken = await ethers.getContractFactory("AirChainPayToken");
    
    // Get deployer account
    const [deployer] = await ethers.getSigners();
    const balance = await deployer.provider.getBalance(deployer.address);
    
    console.log(`📝 Deploying with account: ${deployer.address}`);
    console.log(`💰 Account balance: ${ethers.formatEther(balance)} ETH`);
    
    // Deploy the contract
    console.log("📦 Deploying AirChainPayToken contract...");
    const contract = await AirChainPayToken.deploy();
    
    // Wait for deployment
    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();
    
    console.log(`✅ AirChainPayToken deployed to: ${contractAddress}`);
    
    // Configure supported tokens
    const chainConfig = TOKEN_CONFIGS[chainName];
    if (chainConfig && chainConfig.tokens) {
      console.log("🔧 Configuring supported tokens...");
      
      for (const token of chainConfig.tokens) {
        if (token.address && token.address !== "0x") {
          try {
            console.log(`   Adding ${token.symbol} support...`);
            const tx = await contract.addToken(
              token.address,
              token.symbol,
              token.isStablecoin,
              token.decimals,
              token.minAmount,
              token.maxAmount
            );
            await tx.wait();
            console.log(`   ✅ ${token.symbol} configured successfully`);
          } catch (error) {
            console.log(`   ⚠️  Failed to configure ${token.symbol}: ${error.message}`);
          }
        } else {
          console.log(`   ⚠️  Skipping ${token.symbol} - address not configured`);
        }
      }
    }
    
    // Verify contract owner
    const owner = await contract.owner();
    console.log(`👤 Contract owner: ${owner}`);
    
    // Get supported tokens
    const supportedTokens = await contract.getSupportedTokens();
    console.log(`🎯 Supported tokens: ${supportedTokens.length} tokens configured`);
    
    // Save deployment info
    const deploymentInfo = {
      chainName,
      chainId: network.config.chainId,
      contractAddress,
      owner,
      deployer: deployer.address,
      supportedTokens: supportedTokens,
      tokenConfigs: chainConfig?.tokens || [],
      deployedAt: new Date().toISOString(),
      txHash: contract.deploymentTransaction()?.hash
    };
    
    // Create deployments directory if it doesn't exist
    const deploymentsDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    // Save individual deployment file
    const deploymentFile = path.join(deploymentsDir, `${chainName}-token.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    
    console.log(`📄 Deployment info saved to: ${deploymentFile}`);
    
    return deploymentInfo;
    
  } catch (error) {
    console.error(`❌ Deployment to ${chainName} failed:`, error.message);
    throw error;
  }
}

async function deployTestTokens(chainName) {
  console.log(`\n🪙 Deploying test tokens for ${chainName}...`);
  
  try {
    // Deploy mock USDC for testing
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    
    // Deploy USDC
    console.log("📦 Deploying Mock USDC...");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6, ethers.parseUnits("1000000", 6));
    await usdc.waitForDeployment();
    const usdcAddress = await usdc.getAddress();
    console.log(`✅ Mock USDC deployed to: ${usdcAddress}`);
    
    // Deploy USDT
    console.log("📦 Deploying Mock USDT...");
    const usdt = await MockERC20.deploy("Tether USD", "USDT", 6, ethers.parseUnits("1000000", 6));
    await usdt.waitForDeployment();
    const usdtAddress = await usdt.getAddress();
    console.log(`✅ Mock USDT deployed to: ${usdtAddress}`);
    
    return {
      usdc: usdcAddress,
      usdt: usdtAddress
    };
    
  } catch (error) {
    console.error("❌ Test token deployment failed:", error.message);
    return null;
  }
}

async function main() {
  console.log("🌐 AirChainPay Token Contract Deployment");
  console.log("========================================");
  
  // Get network from command line args or use current network
  const networkName = network.name;
  
  if (!TOKEN_CONFIGS[networkName]) {
    console.log(`⚠️  No token configuration found for ${networkName}`);
    console.log("Available networks:", Object.keys(TOKEN_CONFIGS));
  }
  
  try {
    // Deploy test tokens first (for testnets)
    let testTokens = null;
    if (networkName.includes("testnet") || networkName.includes("sepolia")) {
      testTokens = await deployTestTokens(networkName);
    }
    
    // Deploy main contract
    const deployment = await deployTokenContract(networkName);
    
    // If we deployed test tokens, configure them
    if (testTokens && deployment) {
      console.log("\n🔧 Configuring test tokens...");
      
      const contract = await ethers.getContractAt("AirChainPayToken", deployment.contractAddress);
      
      // Add test USDC
      if (testTokens.usdc) {
        try {
          const tx1 = await contract.addToken(
            testTokens.usdc,
            "USDC",
            true, // isStablecoin
            6,    // decimals
            ethers.parseUnits("1", 6),      // 1 USDC min
            ethers.parseUnits("100000", 6)  // 100,000 USDC max
          );
          await tx1.wait();
          console.log("✅ Test USDC configured");
        } catch (error) {
          console.log("⚠️  Failed to configure test USDC:", error.message);
        }
      }
      
      // Add test USDT
      if (testTokens.usdt) {
        try {
          const tx2 = await contract.addToken(
            testTokens.usdt,
            "USDT",
            true, // isStablecoin
            6,    // decimals
            ethers.parseUnits("1", 6),      // 1 USDT min
            ethers.parseUnits("100000", 6)  // 100,000 USDT max
          );
          await tx2.wait();
          console.log("✅ Test USDT configured");
        } catch (error) {
          console.log("⚠️  Failed to configure test USDT:", error.message);
        }
      }
      
      // Update deployment info with test tokens
      deployment.testTokens = testTokens;
      const deploymentFile = path.join(__dirname, "../deployments", `${networkName}-token.json`);
      fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
    }
    
    // Summary
    console.log("\n📊 DEPLOYMENT SUMMARY");
    console.log("======================");
    console.log(`✅ AirChainPayToken deployed: ${deployment.contractAddress}`);
    console.log(`🎯 Supported tokens: ${deployment.supportedTokens.length}`);
    
    if (testTokens) {
      console.log("🪙 Test tokens deployed:");
      console.log(`   • USDC: ${testTokens.usdc}`);
      console.log(`   • USDT: ${testTokens.usdt}`);
    }
    
    console.log(`\n🔗 Block Explorer: ${getBlockExplorerUrl(networkName, deployment.contractAddress)}`);
    
  } catch (error) {
    console.error("💥 Deployment failed:", error);
    process.exit(1);
  }
}

function getBlockExplorerUrl(networkName, address) {
  const explorers = {
    base_sepolia: `https://sepolia.basescan.org/address/${address}`,
    core_testnet: `https://scan.test2.btcs.network/address/${address}`,
  };
  
  return explorers[networkName] || `Explorer URL not configured for ${networkName}`;
}

// Handle errors
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Deployment script failed:", error);
    process.exit(1);
  }); 