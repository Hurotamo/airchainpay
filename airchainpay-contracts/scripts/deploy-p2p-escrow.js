const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying P2P Escrow contract...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const P2PEscrow = await ethers.getContractFactory("P2PEscrow");
  const p2pEscrow = await P2PEscrow.deploy();

  await p2pEscrow.waitForDeployment();

  console.log("P2P Escrow deployed to:", await p2pEscrow.getAddress());

  // Initialize master
  console.log("Initializing master...");
  const initTx = await p2pEscrow.initMaster();
  await initTx.wait();
  console.log("Master initialized successfully");

  return {
    p2pEscrow: p2pEscrow.address,
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });