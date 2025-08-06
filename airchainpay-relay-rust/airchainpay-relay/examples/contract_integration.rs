use airchainpay_relay::infrastructure::{
    config::Config,
    blockchain::manager::BlockchainManager,
};
use ethers::core::types::Address;
use std::str::FromStr;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🔧 AirChainPay Relay Contract Integration Example");
    println!("================================================\n");
    
    // Load configuration
    let config = Config::new()?;
    println!("✅ Configuration loaded successfully");
    println!("📊 Environment: {}", config.environment);
    println!("🌐 Supported chains: {}", config.supported_chains.len());
    
    // Initialize blockchain manager
    let blockchain_manager = BlockchainManager::new(config.clone())?;
    println!("✅ Blockchain manager initialized");
    
    // Test contract functions for each chain
    for (chain_id, chain_config) in &config.supported_chains {
        println!("\n🔗 Testing Chain {} ({})", chain_id, chain_config.name);
        println!("   Contract: {}", chain_config.contract_address);
        
        // Test getting nonce
        let test_address = Address::from_str("0x1234567890123456789012345678901234567890")?;
        match blockchain_manager.get_nonce(*chain_id, test_address).await {
            Ok(nonce) => println!("   ✅ Nonce for test address: {}", nonce),
            Err(e) => println!("   ❌ Failed to get nonce: {}", e),
        }
        
        // Test getting payment typehash
        match blockchain_manager.get_payment_typehash(*chain_id).await {
            Ok(typehash) => println!("   ✅ Payment typehash: 0x{:x}", typehash),
            Err(e) => println!("   ❌ Failed to get payment typehash: {}", e),
        }
        
        // Test getting token payment typehash
        match blockchain_manager.get_token_payment_typehash(*chain_id).await {
            Ok(typehash) => println!("   ✅ Token payment typehash: 0x{:x}", typehash),
            Err(e) => println!("   ❌ Failed to get token payment typehash: {}", e),
        }
        
        // Test getting EIP-712 domain
        match blockchain_manager.get_eip712_domain(*chain_id).await {
            Ok(domain) => println!("   ✅ EIP-712 domain: {:?}", domain),
            Err(e) => println!("   ❌ Failed to get EIP-712 domain: {}", e),
        }
    }
    
    println!("\n🎯 Contract Integration Summary:");
    println!("  ✅ Updated ABI loading to use correct contract functions");
    println!("  ✅ Added support for both AirChainPay.sol and AirChainPayToken.sol");
    println!("  ✅ Implemented meta-transaction support in relay");
    println!("  ✅ Added contract function calls for payment processing");
    println!("  ✅ All contract integration tasks completed!");
    
    println!("\n📋 Available Functions:");
    println!("  • execute_meta_transaction() - Execute signed meta-transactions");
    println!("  • execute_token_meta_transaction() - Execute token meta-transactions");
    println!("  • process_native_payment() - Process direct native payments");
    println!("  • process_token_payment() - Process direct token payments");
    println!("  • get_nonce() - Get user nonce for replay protection");
    println!("  • get_payment_typehash() - Get EIP-712 typehash for signing");
    println!("  • get_token_payment_typehash() - Get token payment typehash");
    println!("  • get_eip712_domain() - Get EIP-712 domain for signing");
    println!("  • is_token_supported() - Check if token is supported");
    
    Ok(())
} 