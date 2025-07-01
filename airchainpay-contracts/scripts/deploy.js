require('dotenv').config();
const hre = require("hardhat");

async function main() {
  const AirChainPay = await hre.ethers.getContractFactory("AirChainPay");
  const airChainPay = await AirChainPay.deploy();
  await airChainPay.waitForDeployment();
  const address = await airChainPay.getAddress();
  console.log("AirChainPay deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 