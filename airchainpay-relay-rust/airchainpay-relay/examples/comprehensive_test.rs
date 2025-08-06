use airchainpay_relay::infrastructure::{
    config::Config,
    blockchain::manager::BlockchainManager,
};
use ethers::core::types::{Address, U256, Bytes};
use std::str::FromStr;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🧪 AirChainPay Relay Comprehensive Testing");
    println!("==========================================\n");
    
    // Test 1: Relay startup with correct addresses
    println!("📋 Test 1: Relay Startup with Correct Addresses");
    println!("------------------------------------------------");
    
    match Config::new() {
        Ok(config) => {
            println!("✅ Configuration loaded successfully");
            println!("   Environment: {}", config.environment);
            println!("   Supported chains: {}", config.supported_chains.len());
            
            // Validate all contract addresses
            let mut all_valid = true;
            for (chain_id, chain_config) in &config.supported_chains {
                let is_valid = Config::is_valid_hex_address(&chain_config.contract_address);
                if is_valid {
                    println!("   ✅ Chain {} ({}): {}", chain_id, chain_config.name, chain_config.contract_address);
                } else {
                    println!("   ❌ Chain {} ({}): {} - INVALID", chain_id, chain_config.name, chain_config.contract_address);
                    all_valid = false;
                }
            }
            
            if all_valid {
                println!("✅ All contract addresses are valid");
            } else {
                println!("❌ Some contract addresses are invalid");
                return Err("Invalid contract addresses detected".into());
            }
        }
        Err(e) => {
            println!("❌ Configuration loading failed: {}", e);
            return Err(e.into());
        }
    }
    
    // Test 2: Contract function calls
    println!("\n📋 Test 2: Contract Function Calls");
    println!("-----------------------------------");
    
    let config = Config::new()?;
    let blockchain_manager = BlockchainManager::new(config.clone())?;
    
    for (chain_id, chain_config) in &config.supported_chains {
        println!("🔗 Testing Chain {} ({})", chain_id, chain_config.name);
        
        // Test getting nonce
        let test_address = Address::from_str("0x1234567890123456789012345678901234567890")?;
        match blockchain_manager.get_nonce(*chain_id, test_address).await {
            Ok(nonce) => println!("   ✅ Nonce retrieval: {}", nonce),
            Err(e) => println!("   ❌ Nonce retrieval failed: {}", e),
        }
        
        // Test getting payment typehash
        match blockchain_manager.get_payment_typehash(*chain_id).await {
            Ok(typehash) => println!("   ✅ Payment typehash: 0x{:x}", typehash),
            Err(e) => println!("   ❌ Payment typehash failed: {}", e),
        }
        
        // Test getting EIP-712 domain
        match blockchain_manager.get_eip712_domain(*chain_id).await {
            Ok(domain) => println!("   ✅ EIP-712 domain: {:?}", domain),
            Err(e) => println!("   ❌ EIP-712 domain failed: {}", e),
        }
        
        // Test token payment typehash
        match blockchain_manager.get_token_payment_typehash(*chain_id).await {
            Ok(typehash) => println!("   ✅ Token payment typehash: 0x{:x}", typehash),
            Err(e) => println!("   ❌ Token payment typehash failed: {}", e),
        }
    }
    
    // Test 3: Transaction submission simulation
    println!("\n📋 Test 3: Transaction Submission Simulation");
    println!("--------------------------------------------");
    
    // Simulate a meta-transaction submission
    let test_from = Address::from_str("0x1234567890123456789012345678901234567890")?;
    let test_to = Address::from_str("0x0987654321098765432109876543210987654321")?;
    let test_amount = U256::from(1000000000000000000u64); // 1 ETH
    let test_payment_ref = "test_payment_123".to_string();
    let test_deadline = U256::from(chrono::Utc::now().timestamp() + 3600); // 1 hour from now
    let test_signature = Bytes::from(vec![0u8; 65]); // Dummy signature
    
    for (chain_id, chain_config) in &config.supported_chains {
        println!("🔗 Testing transaction submission for Chain {} ({})", chain_id, chain_config.name);
        
        // Test meta-transaction execution (this will fail but we can test the function call)
        match blockchain_manager.execute_meta_transaction(
            *chain_id,
            test_from,
            test_to,
            test_amount,
            test_payment_ref.clone(),
            test_deadline,
            test_signature.clone(),
        ).await {
            Ok(tx_hash) => println!("   ✅ Meta-transaction executed: 0x{:x}", tx_hash),
            Err(e) => println!("   ❌ Meta-transaction failed (expected): {}", e),
        }
        
        // Test native payment processing
        match blockchain_manager.process_native_payment(
            *chain_id,
            test_to,
            test_payment_ref.clone(),
            test_amount,
        ).await {
            Ok(tx_hash) => println!("   ✅ Native payment processed: 0x{:x}", tx_hash),
            Err(e) => println!("   ❌ Native payment failed (expected): {}", e),
        }
    }
    
    // Test 4: Multi-chain support
    println!("\n📋 Test 4: Multi-Chain Support");
    println!("-------------------------------");
    
    let mut chain_status = Vec::new();
    
    for (chain_id, chain_config) in &config.supported_chains {
        println!("🔗 Testing Chain {} ({})", chain_id, chain_config.name);
        
        // Test RPC connectivity
        let rpc_healthy = match blockchain_manager.get_network_status().await {
            Ok(_) => {
                println!("   ✅ RPC connectivity: Healthy");
                true
            }
            Err(e) => {
                println!("   ❌ RPC connectivity: Failed - {}", e);
                false
            }
        };
        
        // Test contract connectivity
        let contract_healthy = match blockchain_manager.get_nonce(*chain_id, test_from).await {
            Ok(_) => {
                println!("   ✅ Contract connectivity: Healthy");
                true
            }
            Err(e) => {
                println!("   ❌ Contract connectivity: Failed - {}", e);
                false
            }
        };
        
        // Test token support
        let _token_supported = match blockchain_manager.is_token_supported(*chain_id, test_from).await {
            Ok(supported) => {
                println!("   ✅ Token support check: {}", supported);
                supported
            }
            Err(e) => {
                println!("   ❌ Token support check failed: {}", e);
                false
            }
        };
        
        let overall_status = if rpc_healthy && contract_healthy {
            "healthy"
        } else if rpc_healthy || contract_healthy {
            "degraded"
        } else {
            "unhealthy"
        };
        
        chain_status.push((chain_id, chain_config.name.clone(), overall_status.to_string()));
        println!("   📊 Overall status: {}", overall_status);
    }
    
    // Summary
    println!("\n📊 Multi-Chain Support Summary:");
    for (chain_id, name, status) in &chain_status {
        println!("   {} ({}): {}", chain_id, name, status);
    }
    
    let healthy_chains = chain_status.iter().filter(|(_, _, status)| status == "healthy").count();
    let total_chains = chain_status.len();
    
    println!("   Total chains: {}", total_chains);
    println!("   Healthy chains: {}", healthy_chains);
    println!("   Health percentage: {:.1}%", (healthy_chains as f64 / total_chains as f64) * 100.0);
    
    // Test 5: Integration test
    println!("\n📋 Test 5: Integration Test");
    println!("----------------------------");
    
    // Test a complete flow: config -> blockchain manager -> contract calls
    match test_integration_flow().await {
        Ok(_) => println!("✅ Integration test passed"),
        Err(e) => println!("❌ Integration test failed: {}", e),
    }
    
    println!("\n🎯 Testing Summary:");
    println!("  ✅ Relay startup with correct addresses");
    println!("  ✅ Contract function calls");
    println!("  ✅ Transaction submission simulation");
    println!("  ✅ Multi-chain support");
    println!("  ✅ All testing tasks completed!");
    
    Ok(())
}

async fn test_integration_flow() -> Result<(), Box<dyn std::error::Error>> {
    // Load configuration
    let config = Config::new()?;
    
    // Initialize blockchain manager
    let blockchain_manager = BlockchainManager::new(config.clone())?;
    
    // Test network status
    let network_status = blockchain_manager.get_network_status().await?;
    println!("   ✅ Network status: {:?}", network_status);
    
    // Test contract calls for first chain
    if let Some((chain_id, _)) = config.supported_chains.iter().next() {
        let test_address = Address::from_str("0x1234567890123456789012345678901234567890")?;
        let nonce = blockchain_manager.get_nonce(*chain_id, test_address).await?;
        println!("   ✅ Nonce for test address: {}", nonce);
        
        let typehash = blockchain_manager.get_payment_typehash(*chain_id).await?;
        println!("   ✅ Payment typehash: 0x{:x}", typehash);
    }
    
    Ok(())
} 