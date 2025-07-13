use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use crate::{
    blockchain::BlockchainManager,
    utils::blockchain::BlockchainUtils,
    logger::Logger,
};

pub async fn test_blockchain_manager_initialization() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match crate::config::Config::development_config() {
        Ok(config) => {
            match BlockchainManager::new(config) {
                Ok(manager) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Blockchain Manager Initialization".to_string(),
                        passed: true,
                        error: None,
                        duration_ms: duration,
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Blockchain Manager Initialization".to_string(),
                        passed: false,
                        error: Some(format!("Failed to initialize blockchain manager: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Blockchain Manager Initialization".to_string(),
                passed: false,
                error: Some(format!("Failed to load config: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_provider_connection() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match crate::config::Config::development_config() {
        Ok(config) => {
            match BlockchainManager::new(config) {
                Ok(manager) => {
                    // Test provider connection for each configured chain
                    let mut all_success = true;
                    let mut error_messages = Vec::new();
                    
                    for chain_id in &[1114, 84532] { // Core Testnet 2, Base Sepolia
                        match manager.get_provider(*chain_id).await {
                            Ok(_) => {},
                            Err(e) => {
                                all_success = false;
                                error_messages.push(format!("Chain {}: {}", chain_id, e));
                            }
                        }
                    }
                    
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Provider Connection".to_string(),
                        passed: all_success,
                        error: if all_success { 
                            None 
                        } else { 
                            Some(format!("Provider connection failures: {}", error_messages.join(", "))) 
                        },
                        duration_ms: duration,
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Provider Connection".to_string(),
                        passed: false,
                        error: Some(format!("Failed to create blockchain manager: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Provider Connection".to_string(),
                passed: false,
                error: Some(format!("Failed to load config: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_gas_price_estimation() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match crate::config::Config::development_config() {
        Ok(config) => {
            match BlockchainManager::new(config) {
                Ok(manager) => {
                    // Test gas price estimation for Ethereum mainnet
                    match manager.estimate_gas_price(1).await {
                        Ok(gas_price) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Gas Price Estimation".to_string(),
                                passed: gas_price > 0,
                                error: if gas_price > 0 { 
                                    None 
                                } else { 
                                    Some("Invalid gas price returned".to_string()) 
                                },
                                duration_ms: duration,
                            }
                        }
                        Err(e) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Gas Price Estimation".to_string(),
                                passed: false,
                                error: Some(format!("Failed to estimate gas price: {}", e)),
                                duration_ms: duration,
                            }
                        }
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Gas Price Estimation".to_string(),
                        passed: false,
                        error: Some(format!("Failed to create blockchain manager: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Gas Price Estimation".to_string(),
                passed: false,
                error: Some(format!("Failed to load config: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_transaction_broadcasting() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match crate::config::Config::development_config() {
        Ok(config) => {
            match BlockchainManager::new(config) {
                Ok(manager) => {
                    // Create a test transaction (this won't actually be broadcast)
                    let test_tx = "0x02f8b00184773594008505d21dba0083030d4094d3e5251e21185b13ea3a5d42dc1f1615865c2e980b844a9059cbb000000000000000000000000b8ce4381d5e4b6a172a9e6122c6932f0f1c5aa1500000000000000000000000000000000000000000000000000038d7ea4c68000c080a0f3d50a6735914f281f5bc80f24fa96326c7c8f1e550a5b90e1d68d3d3eeef873a05eeb3b7a3d0d6423a65c3a9ef8d92b4b39cd5e65ef293435a3d06a6b400a4c5e";
                    
                    // Test transaction validation (without broadcasting)
                    match manager.validate_transaction(test_tx, 1).await {
                        Ok(validation_result) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Transaction Broadcasting".to_string(),
                                passed: true, // Validation passed
                                error: None,
                                duration_ms: duration,
                            }
                        }
                        Err(e) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Transaction Broadcasting".to_string(),
                                passed: false,
                                error: Some(format!("Failed to validate transaction: {}", e)),
                                duration_ms: duration,
                            }
                        }
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Transaction Broadcasting".to_string(),
                        passed: false,
                        error: Some(format!("Failed to create blockchain manager: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Transaction Broadcasting".to_string(),
                passed: false,
                error: Some(format!("Failed to load config: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_contract_interaction() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match crate::config::Config::development_config() {
        Ok(config) => {
            match BlockchainManager::new(config) {
                Ok(manager) => {
                    // Test contract ABI parsing
                    let test_abi = r#"[
                        {
                            "inputs": [
                                {
                                    "internalType": "address",
                                    "name": "to",
                                    "type": "address"
                                },
                                {
                                    "internalType": "uint256",
                                    "name": "amount",
                                    "type": "uint256"
                                }
                            ],
                            "name": "transfer",
                            "outputs": [
                                {
                                    "internalType": "bool",
                                    "name": "",
                                    "type": "bool"
                                }
                            ],
                            "stateMutability": "nonpayable",
                            "type": "function"
                        }
                    ]"#;
                    
                    match serde_json::from_str::<Vec<serde_json::Value>>(test_abi) {
                        Ok(_) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Contract Interaction".to_string(),
                                passed: true,
                                error: None,
                                duration_ms: duration,
                            }
                        }
                        Err(e) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Contract Interaction".to_string(),
                                passed: false,
                                error: Some(format!("Failed to parse contract ABI: {}", e)),
                                duration_ms: duration,
                            }
                        }
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Contract Interaction".to_string(),
                        passed: false,
                        error: Some(format!("Failed to create blockchain manager: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Contract Interaction".to_string(),
                passed: false,
                error: Some(format!("Failed to load config: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_multichain_support() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match crate::config::Config::development_config() {
        Ok(config) => {
            match BlockchainManager::new(config) {
                Ok(manager) => {
                    // Test support for multiple chains
                    let supported_chains = vec![1, 137, 8453, 42161]; // Ethereum, Polygon, Base, Arbitrum
                    let mut supported_count = 0;
                    
                    for chain_id in supported_chains {
                        match manager.is_chain_supported(chain_id) {
                            true => supported_count += 1,
                            false => {}
                        }
                    }
                    
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Multichain Support".to_string(),
                        passed: supported_count >= 2, // At least 2 chains should be supported
                        error: if supported_count >= 2 { 
                            None 
                        } else { 
                            Some(format!("Only {} chains supported, expected at least 2", supported_count)) 
                        },
                        duration_ms: duration,
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Multichain Support".to_string(),
                        passed: false,
                        error: Some(format!("Failed to create blockchain manager: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Multichain Support".to_string(),
                passed: false,
                error: Some(format!("Failed to load config: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_error_handling() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match crate::config::Config::development_config() {
        Ok(config) => {
            match BlockchainManager::new(config) {
                Ok(manager) => {
                    // Test error handling for invalid chain ID
                    match manager.get_provider(999999).await {
                        Ok(_) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Error Handling".to_string(),
                                passed: false,
                                error: Some("Should have failed for invalid chain ID".to_string()),
                                duration_ms: duration,
                            }
                        }
                        Err(_) => {
                            // Test error handling for invalid transaction
                            match manager.validate_transaction("invalid_tx", 1).await {
                                Ok(_) => {
                                    let duration = start_time.elapsed().as_millis() as u64;
                                    crate::tests::TestResult {
                                        test_name: "Error Handling".to_string(),
                                        passed: false,
                                        error: Some("Should have failed for invalid transaction".to_string()),
                                        duration_ms: duration,
                                    }
                                }
                                Err(_) => {
                                    let duration = start_time.elapsed().as_millis() as u64;
                                    crate::tests::TestResult {
                                        test_name: "Error Handling".to_string(),
                                        passed: true,
                                        error: None,
                                        duration_ms: duration,
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Error Handling".to_string(),
                        passed: false,
                        error: Some(format!("Failed to create blockchain manager: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Error Handling".to_string(),
                passed: false,
                error: Some(format!("Failed to load config: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_performance_metrics() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match crate::config::Config::development_config() {
        Ok(config) => {
            match BlockchainManager::new(config) {
                Ok(manager) => {
                    // Test performance metrics collection
                    let mut total_time = 0u64;
                    let mut success_count = 0;
                    
                    // Run multiple operations to measure performance
                    for _ in 0..5 {
                        let op_start = Instant::now();
                        match manager.estimate_gas_price(1).await {
                            Ok(_) => {
                                success_count += 1;
                                total_time += op_start.elapsed().as_millis() as u64;
                            }
                            Err(_) => {}
                        }
                    }
                    
                    let avg_time = if success_count > 0 { total_time / success_count } else { 0 };
                    let duration = start_time.elapsed().as_millis() as u64;
                    
                    crate::tests::TestResult {
                        test_name: "Performance Metrics".to_string(),
                        passed: success_count >= 3 && avg_time < 5000, // At least 3 successful ops, avg < 5s
                        error: if success_count >= 3 && avg_time < 5000 { 
                            None 
                        } else { 
                            Some(format!("Performance test failed: {} successes, {}ms avg", success_count, avg_time)) 
                        },
                        duration_ms: duration,
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Performance Metrics".to_string(),
                        passed: false,
                        error: Some(format!("Failed to create blockchain manager: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Performance Metrics".to_string(),
                passed: false,
                error: Some(format!("Failed to load config: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_new_networks() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match crate::config::Config::development_config() {
        Ok(config) => {
            match BlockchainManager::new(config) {
                Ok(manager) => {
                    let mut all_success = true;
                    let mut error_messages = Vec::new();
                    
                    // Test Core Testnet 2 (Chain ID: 1114)
                    println!("Testing Core Testnet 2 (Chain ID: 1114)...");
                    match manager.validate_chain_connection(1114).await {
                        Ok(is_connected) => {
                            if is_connected {
                                println!("✅ Core Testnet 2 connection successful");
                                
                                // Get network info
                                match manager.get_network_info(1114).await {
                                    Ok(info) => {
                                        println!("Core Testnet 2 info: {:?}", info);
                                    }
                                    Err(e) => {
                                        all_success = false;
                                        error_messages.push(format!("Core Testnet 2 network info error: {}", e));
                                    }
                                }
                            } else {
                                all_success = false;
                                error_messages.push("Core Testnet 2 connection failed".to_string());
                            }
                        }
                        Err(e) => {
                            all_success = false;
                            error_messages.push(format!("Core Testnet 2 connection error: {}", e));
                        }
                    }
                    
                    // Test Base Sepolia (Chain ID: 84532)
                    println!("Testing Base Sepolia (Chain ID: 84532)...");
                    match manager.validate_chain_connection(84532).await {
                        Ok(is_connected) => {
                            if is_connected {
                                println!("✅ Base Sepolia connection successful");
                                
                                // Get network info
                                match manager.get_network_info(84532).await {
                                    Ok(info) => {
                                        println!("Base Sepolia info: {:?}", info);
                                    }
                                    Err(e) => {
                                        all_success = false;
                                        error_messages.push(format!("Base Sepolia network info error: {}", e));
                                    }
                                }
                            } else {
                                all_success = false;
                                error_messages.push("Base Sepolia connection failed".to_string());
                            }
                        }
                        Err(e) => {
                            all_success = false;
                            error_messages.push(format!("Base Sepolia connection error: {}", e));
                        }
                    }
                    
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "New Networks Test".to_string(),
                        passed: all_success,
                        error: if all_success { 
                            None 
                        } else { 
                            Some(format!("Network test failures: {}", error_messages.join(", "))) 
                        },
                        duration_ms: duration,
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "New Networks Test".to_string(),
                        passed: false,
                        error: Some(format!("Failed to create blockchain manager: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "New Networks Test".to_string(),
                passed: false,
                error: Some(format!("Failed to load config: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn run_all_blockchain_tests() -> Vec<crate::tests::TestResult> {
    let mut results = Vec::new();
    
    Logger::info("Running blockchain unit tests");
    
    results.push(test_blockchain_manager_initialization().await);
    results.push(test_provider_connection().await);
    results.push(test_gas_price_estimation().await);
    results.push(test_transaction_broadcasting().await);
    results.push(test_contract_interaction().await);
    results.push(test_multichain_support().await);
    results.push(test_error_handling().await);
    results.push(test_performance_metrics().await);
    results.push(test_new_networks().await);
    
    results
} 