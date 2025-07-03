const { ethers, network } = require("hardhat");

async function main() {
  console.log(`🔍 Verifying AirChainPay on ${network.name}`);
  console.log("=======================================");
  
  // Contract addresses per network
  const contractAddresses = {
    base_sepolia: "0x7B79117445C57eea1CEAb4733020A55e1D503934",
    core_testnet: "0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB"
  };
  
  const contractAddress = contractAddresses[network.name];
  if (!contractAddress) {
    throw new Error(`No contract address configured for network: ${network.name}`);
  }
  
  console.log(`📍 Contract address: ${contractAddress}`);
  
  try {
    // Get contract instance
    const contractFactory = await ethers.getContractFactory("AirChainPay");
    const contract = contractFactory.attach(contractAddress);
    
    // Get deployer account
    const [deployer] = await ethers.getSigners();
    console.log(`📝 Using account: ${deployer.address}`);
    
    // Check if contract exists
    const code = await deployer.provider.getCode(contractAddress);
    if (code === "0x") {
      throw new Error("No contract code found at address");
    }
    console.log(`✅ Contract code found at: ${contractAddress}`);
    
    // Verify contract owner
    const owner = await contract.owner();
    console.log(`👤 Contract owner: ${owner}`);
    
    // Get account balance
    const balance = await deployer.provider.getBalance(deployer.address);
    const balanceFormatted = ethers.formatEther(balance);
    console.log(`💳 Account balance: ${balanceFormatted} ${getNetworkCurrency(network.name)}`);
    
    // Get contract balance
    const contractBalance = await deployer.provider.getBalance(contractAddress);
    const contractBalanceFormatted = ethers.formatEther(contractBalance);
    console.log(`🏦 Contract balance: ${contractBalanceFormatted} ${getNetworkCurrency(network.name)}`);
    
    // Get network info
    const chainId = await deployer.provider.getNetwork().then(n => n.chainId);
    console.log(`🌐 Chain ID: ${chainId}`);
    
    // Get block number
    const blockNumber = await deployer.provider.getBlockNumber();
    console.log(`📦 Current block: ${blockNumber}`);
    
    console.log(`✅ ${network.name} verification completed successfully!`);
    console.log(`🔗 Explorer: ${getExplorerUrl(network.name)}/address/${contractAddress}`);
    
    // Test payment functionality if we have balance
    if (balance >= ethers.parseEther("0.001")) {
      console.log(`\n💸 Testing payment functionality...`);
      
      const testAmount = ethers.parseEther("0.0001");
      const paymentRef = `test_${Date.now()}`;
      
      console.log(`📤 Sending test payment: ${ethers.formatEther(testAmount)} ${getNetworkCurrency(network.name)}`);
      console.log(`📝 Payment reference: ${paymentRef}`);
      
      // Estimate gas
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
      console.log(`🔗 Transaction: ${getExplorerUrl(network.name)}/tx/${tx.hash}`);
      
      // Check updated balances
      const newBalance = await deployer.provider.getBalance(deployer.address);
      const newContractBalance = await deployer.provider.getBalance(contractAddress);
      console.log(`💳 New account balance: ${ethers.formatEther(newBalance)} ${getNetworkCurrency(network.name)}`);
      console.log(`🏦 New contract balance: ${ethers.formatEther(newContractBalance)} ${getNetworkCurrency(network.name)}`);
      
    } else {
      console.log(`⏭️  Skipping payment test - insufficient balance (need at least 0.001 ${getNetworkCurrency(network.name)})`);
    }
    
  } catch (error) {
    console.error(`❌ Verification failed:`, error.message);
    process.exit(1);
  }
}

function getNetworkCurrency(networkName) {
  const currencies = {
    base_sepolia: "ETH",
    core_testnet: "tCORE2",
    localhost: "ETH"
  };
  return currencies[networkName] || "ETH";
}

function getExplorerUrl(networkName) {
  const explorers = {
    base_sepolia: "https://sepolia.basescan.org",
    core_testnet: "https://scan.test2.btcs.network",
    localhost: "N/A"
  };
  return explorers[networkName] || "N/A";
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Script error:", error);
    process.exit(1);
  }); 