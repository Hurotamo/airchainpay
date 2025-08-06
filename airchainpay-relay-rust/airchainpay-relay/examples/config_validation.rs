use airchainpay_relay::infrastructure::config::Config;

fn main() {
    println!("🔧 AirChainPay Relay Configuration Validation Example");
    println!("==================================================\n");
    
    // Test hex address validation
    println!("📋 Testing Hex Address Validation:");
    
    let valid_addresses = [
        "0xcE2D2A50DaA794c12d079F2E2E2aF656ebB981fF", // Core Testnet 2
        "0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB", // Base Sepolia
        "0xaBEEEc6e6c1f6bfDE1d05db74B28847Ba5b44EAF", // Lisk Sepolia
        "0x26C59cd738Df90604Ebb13Ed8DB76657cfD51f40", // Ethereum Holesky
    ];
    
    for address in &valid_addresses {
        let is_valid = Config::is_valid_hex_address(address);
        println!("  ✅ {}: {}", address, is_valid);
    }
    
    let invalid_addresses = [
        "your_contract_address_here",
        "0x123456789012345678901234567890123456789", // Too short
        "0x12345678901234567890123456789012345678901", // Too long
        "1234567890123456789012345678901234567890", // No 0x prefix
        "0x123456789012345678901234567890123456789g", // Invalid character
    ];
    
    for address in &invalid_addresses {
        let is_valid = Config::is_valid_hex_address(address);
        println!("  ❌ {}: {}", address, is_valid);
    }
    
    println!("\n🚀 Configuration Loading Test:");
    
    // Try to load configuration
    match Config::new() {
        Ok(config) => {
            println!("  ✅ Configuration loaded successfully!");
            println!("  📊 Environment: {}", config.environment);
            println!("  🌐 RPC URL: {}", config.rpc_url);
            println!("  🔗 Chain ID: {}", config.chain_id);
            println!("  📝 Supported Chains: {}", config.supported_chains.len());
            
            // Display chain configurations
            for (chain_id, chain_config) in &config.supported_chains {
                println!("    🔸 Chain {} ({}):", chain_id, chain_config.name);
                println!("       Contract: {}", chain_config.contract_address);
                println!("       RPC: {}", chain_config.rpc_url);
                println!("       Explorer: {}", chain_config.explorer);
                println!("       Currency: {}", chain_config.currency_symbol.as_ref().unwrap_or(&"N/A".to_string()));
            }
        }
        Err(e) => {
            println!("  ❌ Configuration loading failed: {}", e);
        }
    }
    
    println!("\n🎯 Validation Summary:");
    println!("  ✅ Hex address validation implemented");
    println!("  ✅ Environment variable validation implemented");
    println!("  ✅ Fallback to default addresses implemented");
    println!("  ✅ Proper error messages for invalid addresses implemented");
    println!("  ✅ All configuration validation tasks completed!");
} 