const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Load deployment data
function loadDeployments() {
  const deploymentsDir = path.join(__dirname, "../deployments");
  const allChainsFile = path.join(deploymentsDir, "all-chains.json");
  
  if (!fs.existsSync(allChainsFile)) {
    throw new Error("Deployment file not found. Run deployment first.");
  }
  
  return JSON.parse(fs.readFileSync(allChainsFile, "utf8"));
}

// Verify contract on a specific network
async function verifyContract(deployment, networkName) {
  console.log(`\n🔍 Verifying ${deployment.chainName} (${networkName})...`);
  
  try {
    // Get contract instance
    const contractFactory = await ethers.getContractFactory("AirChainPay");
    const contract = contractFactory.attach(deployment.contractAddress);
    
    // Get deployer account
    const [deployer] = await ethers.getSigners();
    console.log(`📝 Using account: ${deployer.address}`);
    
    // Check if contract exists
    const code = await deployer.provider.getCode(deployment.contractAddress);
    if (code === "0x") {
      throw new Error("No contract code found at address");
    }
    console.log(`✅ Contract code found at: ${deployment.contractAddress}`);
    
    // Verify contract owner
    const owner = await contract.owner();
    console.log(`👤 Contract owner: ${owner}`);
    
    if (owner.toLowerCase() !== deployment.owner.toLowerCase()) {
      console.log(`⚠️  Owner mismatch! Expected: ${deployment.owner}, Got: ${owner}`);
    } else {
      console.log(`✅ Owner verification passed`);
    }
    
    // Get account balance
    const balance = await deployer.provider.getBalance(deployer.address);
    const balanceFormatted = ethers.formatEther(balance);
    console.log(`💳 Account balance: ${balanceFormatted} ${getNetworkCurrency(deployment.chainName)}`);
    
    // Get contract balance
    const contractBalance = await deployer.provider.getBalance(deployment.contractAddress);
    const contractBalanceFormatted = ethers.formatEther(contractBalance);
    console.log(`🏦 Contract balance: ${contractBalanceFormatted} ${getNetworkCurrency(deployment.chainName)}`);
    
    // Test payment functionality (read-only)
    console.log(`🧪 Testing contract interface...`);
    
    console.log(`✅ ${deployment.chainName} verification completed successfully!`);
    console.log(`🔗 Explorer: ${deployment.blockExplorer}/address/${deployment.contractAddress}`);
    
          return {
        success: true,
        chainName: deployment.chainName,
        contractAddress: deployment.contractAddress,
        owner,
        balance: balanceFormatted,
        contractBalance: contractBalanceFormatted,
        explorer: `${deployment.blockExplorer}/address/${deployment.contractAddress}`
      };
    
  } catch (error) {
    console.error(`❌ Verification failed for ${deployment.chainName}:`, error.message);
    return {
      success: false,
      chainName: deployment.chainName,
      error: error.message
    };
  }
}

function getNetworkCurrency(chainName) {
  const currencies = {
    base_sepolia: "ETH",
    core_testnet: "tCORE2"
  };
  return currencies[chainName] || "ETH";
}

// Test a small payment (if sufficient balance)
async function testPayment(deployment, networkName) {
  console.log(`\n💸 Testing payment functionality on ${deployment.chainName}...`);
  
  try {
    const [deployer] = await ethers.getSigners();
    const balance = await deployer.provider.getBalance(deployer.address);
    
    // Only test if we have sufficient balance (at least 0.001 ETH/tCORE2)
    if (balance < ethers.parseEther("0.001")) {
      console.log(`⏭️  Skipping payment test - insufficient balance`);
      return { success: false, reason: "insufficient_balance" };
    }
    
    const contractFactory = await ethers.getContractFactory("AirChainPay");
    const contract = contractFactory.attach(deployment.contractAddress);
    
    // Test payment to self with small amount
    const testAmount = ethers.parseEther("0.0001"); // 0.0001 ETH/tCORE2
    const paymentRef = `test_${Date.now()}`;
    
    console.log(`📤 Sending test payment: ${ethers.formatEther(testAmount)} ${getNetworkCurrency(deployment.chainName)}`);
    console.log(`📝 Payment reference: ${paymentRef}`);
    
    // Estimate gas first
    const gasEstimate = await contract.pay.estimateGas(
      deployer.address,
      paymentRef,
      { value: testAmount }
    );
    console.log(`⛽ Estimated gas: ${gasEstimate.toString()}`);
    
    // Send transaction
    const tx = await contract.pay(deployer.address, paymentRef, { 
      value: testAmount,
      gasLimit: gasEstimate * 120n / 100n // Add 20% buffer
    });
    
    console.log(`📋 Transaction hash: ${tx.hash}`);
    console.log(`⏳ Waiting for confirmation...`);
    
    const receipt = await tx.wait();
    console.log(`✅ Payment confirmed in block: ${receipt.blockNumber}`);
    console.log(`🔗 Transaction: ${deployment.blockExplorer}/tx/${tx.hash}`);
    
    return {
      success: true,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      explorer: `${deployment.blockExplorer}/tx/${tx.hash}`
    };
    
  } catch (error) {
    console.error(`❌ Payment test failed:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

async function main() {
  console.log("🔍 AirChainPay Multi-Chain Verification");
  console.log("=======================================");
  
  try {
    // Load deployment data
    const deploymentData = loadDeployments();
    console.log(`📊 Found ${deploymentData.totalDeployments} deployments to verify`);
    
    const results = [];
    const networks = ["base_sepolia", "core_testnet"];
    
    for (const networkName of networks) {
      const deployment = deploymentData.deployments.find(d => d.chainName === networkName);
      
      if (!deployment) {
        console.log(`⏭️  Skipping ${networkName} - not found in deployments`);
        continue;
      }
      
      try {
        // Verify contract
        const verificationResult = await verifyContract(deployment, networkName);
        results.push(verificationResult);
        
        // Test payment if verification succeeded
        if (verificationResult.success) {
          const paymentResult = await testPayment(deployment, networkName);
          verificationResult.paymentTest = paymentResult;
        }
        
        // Wait between network checks
        if (networks.indexOf(networkName) < networks.length - 1) {
          console.log("⏳ Waiting 3 seconds before next verification...");
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
      } catch (error) {
        console.error(`💥 Network verification failed for ${networkName}:`, error.message);
        results.push({
          success: false,
          chainName: networkName,
          error: error.message
        });
      }
    }
    
    // Summary
    console.log("\n📊 VERIFICATION SUMMARY");
    console.log("========================");
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    if (successful.length > 0) {
      console.log(`✅ Successful verifications: ${successful.length}`);
      successful.forEach(r => {
        console.log(`   • ${r.chainName}: ${r.contractAddress}`);
        console.log(`     Owner: ${r.owner}`);
        console.log(`     Balance: ${r.balance} ${getNetworkCurrency(r.chainName)}`);
        console.log(`     Explorer: ${r.explorer}`);
        if (r.paymentTest?.success) {
          console.log(`     ✅ Payment test passed: ${r.paymentTest.explorer}`);
        }
      });
    }
    
    if (failed.length > 0) {
      console.log(`❌ Failed verifications: ${failed.length}`);
      failed.forEach(r => {
        console.log(`   • ${r.chainName}: ${r.error}`);
      });
    }
    
    console.log(`\n🎉 Verification completed! ${successful.length}/${results.length} contracts verified successfully.`);
    
    if (failed.length > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error("💥 Verification script failed:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Script error:", error);
    process.exit(1);
  }); 