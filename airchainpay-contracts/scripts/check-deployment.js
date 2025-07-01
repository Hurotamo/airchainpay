require('dotenv').config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  // Contract address from config
  const contractAddress = "0x7B79117445C57eea1CEAb4733020A55e1D503934";
  
  // Read ABI from compiled contract
  const abiPath = path.join(__dirname, "../artifacts/contracts/AirChainPay.sol/AirChainPay.json");
  const contractJson = JSON.parse(fs.readFileSync(abiPath, "utf8"));
  const abi = contractJson.abi;
  
  // Connect to Base Sepolia
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  
  try {
    // Check if contract exists at the address
    const code = await provider.getCode(contractAddress);
    
    if (code === "0x") {
      console.log("❌ No contract deployed at address:", contractAddress);
      return;
    }
    
    console.log("✅ Contract code found at address:", contractAddress);
    
    // Try to interact with the contract
    const contract = new ethers.Contract(contractAddress, abi, provider);
    
    // Get contract owner
    const owner = await contract.owner();
    console.log("✅ Contract owner:", owner);
    
    console.log("✅ Contract is deployed and functional!");
  } catch (error) {
    console.error("Error checking contract:", error.message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 