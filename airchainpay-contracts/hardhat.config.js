require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.21",
  networks: {
    // Base Sepolia Testnet
    base_sepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
      gasPrice: 1000000000, // 1 gwei
    },
    // Core Testnet
    core_testnet: {
      url: process.env.CORE_TESTNET_RPC_URL || "https://rpc.test2.btcs.network",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 1114,
      gasPrice: 10000000000, // 10 gwei
    },
    // Core Mainnet (for future use)
    core_mainnet: {
      url: process.env.CORE_MAINNET_RPC_URL || "https://rpc.coredao.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 1116,
      gasPrice: 10000000000, // 10 gwei
    },
    // Localhost for testing
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
  },
  etherscan: {
    apiKey: {
      base_sepolia: process.env.BASESCAN_API_KEY || process.env.ETHERSCAN_API_KEY,
      core_testnet: process.env.CORE_SCAN_API_KEY,
      core_mainnet: process.env.CORE_SCAN_API_KEY,
    },
    customChains: [
      {
        network: "core_testnet",
        chainId: 1114,
        urls: {
          apiURL: "https://api.test2.btcs.network/api",
          browserURL: "https://scan.test2.btcs.network/",
        },
      },
      {
        network: "core_mainnet", 
        chainId: 1116,
        urls: {
          apiURL: "https://openapi.coredao.org/api",
          browserURL: "https://scan.coredao.org/",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    scripts: "./scripts",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 60000
  }
}; 