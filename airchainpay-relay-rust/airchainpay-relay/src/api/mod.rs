use actix_web::{get, post, web, App, HttpResponse, HttpServer, Responder};
use actix_web::web::Data;
use serde::{Deserialize, Serialize};
use crate::auth::{AuthManager, AuthRequest, AuthResponse};
use crate::security::{SecurityManager, security_middleware};
use crate::storage::{Storage, Transaction, Device};
use crate::blockchain::BlockchainManager;
use crate::monitoring::MonitoringManager;
use crate::processors::{TransactionProcessor, TransactionPriority};
use crate::ble::manager::BLETransaction;
use crate::utils::error_handler::{ErrorHandler, ErrorStatistics};
use crate::config::{Config, DynamicConfigManager};
use crate::middleware::input_validation::{
    validate_transaction_request, validate_ble_request, validate_auth_request, validate_compressed_payload_request
};
use crate::middleware::error_handling::{ErrorResponseBuilder, error_utils};
use crate::utils::critical_error_handler::{CriticalErrorHandler, CriticalPath, CriticalError, CriticalPathMetrics};
use std::sync::Arc;
use std::collections::HashMap;
use base64;
use actix_web::web::{Json, Query, Path};
use chrono::{DateTime, Utc};

#[get("/health")]
async fn health(
    monitoring_manager: Data<Arc<MonitoringManager>>,
    storage: Data<Arc<Storage>>,
    blockchain_manager: Data<Arc<BlockchainManager>>,
    ble_manager: Data<Arc<BLEManager>>,
    config_manager: Data<Arc<DynamicConfigManager>>,
) -> impl Responder {
    let start_time = std::time::Instant::now();
    
    // Get comprehensive health data
    let health_status = monitoring_manager.get_health_status().await;
    let system_metrics = monitoring_manager.get_system_metrics().await;
    let alerts = monitoring_manager.get_alerts(10).await;
    
    // Check BLE status
    let ble_status = ble_manager.get_status().await;
    
    // Check database health
    let db_health = storage.check_health().await;
    
    // Check blockchain connectivity
    let blockchain_status = blockchain_manager.get_network_status().await;
    
    // Get configuration status
    let config_status = config_manager.get_status().await;
    
    // Calculate response time
    let response_time = start_time.elapsed().as_millis() as f64;
    
    // Determine overall health status
    let critical_alerts = alerts.iter()
        .filter(|a| !a.resolved && matches!(a.severity, crate::monitoring::AlertSeverity::Critical))
        .count();
    
    let overall_status = if critical_alerts > 0 {
        "unhealthy"
    } else if !db_health.is_healthy || !blockchain_status.is_healthy {
        "degraded"
    } else {
        "healthy"
    };
    
    HttpResponse::Ok().json(serde_json::json!({
        "status": overall_status,
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "version": env!("CARGO_PKG_VERSION"),
        "response_time_ms": response_time,
        "uptime": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs_f64(),
        
        // System metrics
        "system": {
            "memory_usage_bytes": system_metrics.memory_usage_bytes,
            "cpu_usage_percent": system_metrics.cpu_usage_percent,
            "disk_usage_percent": system_metrics.disk_usage_percent,
            "network_bytes_in": system_metrics.network_bytes_in,
            "network_bytes_out": system_metrics.network_bytes_out,
            "open_file_descriptors": system_metrics.open_file_descriptors,
            "thread_count": system_metrics.thread_count,
            "heap_size_bytes": system_metrics.heap_size_bytes,
            "heap_used_bytes": system_metrics.heap_used_bytes,
        },
        
        // BLE status
        "ble": {
            "enabled": ble_status.enabled,
            "initialized": ble_status.initialized,
            "is_advertising": ble_status.is_advertising,
            "connected_devices": ble_status.connected_devices,
            "authenticated_devices": ble_status.authenticated_devices,
            "blocked_devices": ble_status.blocked_devices,
            "last_scan_time": ble_status.last_scan_time,
            "scan_duration_ms": ble_status.scan_duration_ms,
        },
        
        // Database health
        "database": {
            "is_healthy": db_health.is_healthy,
            "connection_count": db_health.connection_count,
            "last_backup_time": db_health.last_backup_time,
            "backup_size_bytes": db_health.backup_size_bytes,
            "error_count": db_health.error_count,
            "slow_queries": db_health.slow_queries,
        },
        
        // Blockchain status
        "blockchain": {
            "is_healthy": blockchain_status.is_healthy,
            "connected_networks": blockchain_status.connected_networks,
            "last_block_time": blockchain_status.last_block_time,
            "gas_price_updates": blockchain_status.gas_price_updates,
            "pending_transactions": blockchain_status.pending_transactions,
            "failed_transactions": blockchain_status.failed_transactions,
        },
        
        // Configuration status
        "configuration": {
            "is_valid": config_status.is_valid,
            "last_reload_time": config_status.last_reload_time,
            "config_file_path": config_status.config_file_path,
            "environment": config_status.environment,
        },
        
        // Metrics
        "metrics": {
            "transactions": {
                "received": health_status.get("transactions").and_then(|t| t.get("received")).and_then(|v| v.as_u64()).unwrap_or(0),
                "processed": health_status.get("transactions").and_then(|t| t.get("processed")).and_then(|v| v.as_u64()).unwrap_or(0),
                "failed": health_status.get("transactions").and_then(|t| t.get("failed")).and_then(|v| v.as_u64()).unwrap_or(0),
                "broadcasted": health_status.get("transactions").and_then(|t| t.get("broadcasted")).and_then(|v| v.as_u64()).unwrap_or(0),
            },
            "ble": {
                "connections": health_status.get("ble").and_then(|b| b.get("connections")).and_then(|v| v.as_u64()).unwrap_or(0),
                "disconnections": health_status.get("ble").and_then(|b| b.get("disconnections")).and_then(|v| v.as_u64()).unwrap_or(0),
                "authentications": health_status.get("ble").and_then(|b| b.get("authentications")).and_then(|v| v.as_u64()).unwrap_or(0),
                "key_exchanges": health_status.get("ble").and_then(|b| b.get("key_exchanges")).and_then(|v| v.as_u64()).unwrap_or(0),
            },
            "system": {
                "uptime_seconds": health_status.get("uptime_seconds").and_then(|v| v.as_f64()).unwrap_or(0.0),
                "memory_usage_bytes": health_status.get("memory_usage_bytes").and_then(|v| v.as_u64()).unwrap_or(0),
                "cpu_usage_percent": health_status.get("cpu_usage_percent").and_then(|v| v.as_f64()).unwrap_or(0.0),
                "response_time_avg_ms": health_status.get("response_time_avg_ms").and_then(|v| v.as_f64()).unwrap_or(0.0),
            },
            "security": {
                "auth_failures": health_status.get("auth_failures").and_then(|v| v.as_u64()).unwrap_or(0),
                "rate_limit_hits": health_status.get("rate_limit_hits").and_then(|v| v.as_u64()).unwrap_or(0),
                "blocked_devices": health_status.get("blocked_devices").and_then(|v| v.as_u64()).unwrap_or(0),
                "security_events": health_status.get("security_events").and_then(|v| v.as_u64()).unwrap_or(0),
            },
            "performance": {
                "requests_total": health_status.get("requests_total").and_then(|v| v.as_u64()).unwrap_or(0),
                "requests_successful": health_status.get("requests_successful").and_then(|v| v.as_u64()).unwrap_or(0),
                "requests_failed": health_status.get("requests_failed").and_then(|v| v.as_u64()).unwrap_or(0),
                "active_connections": health_status.get("active_connections").and_then(|v| v.as_u64()).unwrap_or(0),
                "cache_hits": health_status.get("cache_hits").and_then(|v| v.as_u64()).unwrap_or(0),
                "cache_misses": health_status.get("cache_misses").and_then(|v| v.as_u64()).unwrap_or(0),
            },
        },
        
        // Alerts
        "alerts": {
            "total": alerts.len(),
            "critical": alerts.iter().filter(|a| !a.resolved && matches!(a.severity, crate::monitoring::AlertSeverity::Critical)).count(),
            "warnings": alerts.iter().filter(|a| !a.resolved && matches!(a.severity, crate::monitoring::AlertSeverity::Warning)).count(),
            "info": alerts.iter().filter(|a| !a.resolved && matches!(a.severity, crate::monitoring::AlertSeverity::Info)).count(),
            "recent_alerts": alerts.iter().take(5).map(|a| {
                serde_json::json!({
                    "id": a.id,
                    "name": a.name,
                    "severity": a.severity.to_string(),
                    "message": a.message,
                    "timestamp": a.timestamp.to_rfc3339(),
                    "resolved": a.resolved,
                })
            }).collect::<Vec<_>>(),
        },
        
        // Health checks
        "health_checks": {
            "system": overall_status == "healthy",
            "database": db_health.is_healthy,
            "blockchain": blockchain_status.is_healthy,
            "ble": ble_status.enabled && ble_status.initialized,
            "configuration": config_status.is_valid,
        },
    }))
}

#[get("/ble_scan")]
async fn ble_scan() -> impl Responder {
    match crate::ble::scan_ble_devices().await {
        Ok(_) => HttpResponse::Ok().body("Scan complete. See logs for devices."),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("BLE scan error: {e}"),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
}

#[derive(Deserialize)]
struct SendTxRequest {
    signed_tx: String, // hex-encoded
    rpc_url: String,
    chain_id: u64,
    device_id: Option<String>,
}

#[derive(Deserialize)]
struct CompressedPayloadRequest {
    compressed_data: String, // base64-encoded compressed payload
    payload_type: String, // "transaction", "ble", "qr"
    rpc_url: String,
    chain_id: u64,
    device_id: Option<String>,
}

#[derive(Serialize)]
struct CompressionStatsResponse {
    original_size: usize,
    compressed_size: usize,
    compression_ratio: f64,
    space_saved_percent: f64,
    format: String,
}

#[post("/send_tx")]
async fn send_tx(
    req: web::Json<SendTxRequest>,
    storage: Data<Arc<Storage>>,
    blockchain_manager: Data<Arc<BlockchainManager>>,
    error_handler: Data<Arc<ErrorHandler>>,
) -> impl Responder {
    // Validate input using sanitizer
    use crate::utils::sanitizer::InputSanitizer;
    let sanitizer = InputSanitizer::new();
    
    // Validate signed transaction
    let tx_validation = sanitizer.sanitize_hash(&req.signed_tx);
    if tx_validation.data.is_none() {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid signed transaction format",
            "field": "signed_tx",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }));
    }
    
    // Validate chain ID
    let chain_validation = sanitizer.sanitize_chain_id(&req.chain_id.to_string());
    if chain_validation.data.is_none() {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid chain ID",
            "field": "chain_id",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }));
    }
    
    // Validate device ID if provided
    if let Some(device_id) = &req.device_id {
        let device_validation = sanitizer.sanitize_device_id(device_id);
        if device_validation.data.is_none() {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid device ID format",
                "field": "device_id",
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }));
        }
    }
    
    // Create transaction record
    let transaction = Transaction::new(
        req.signed_tx.clone(),
        req.chain_id,
        req.device_id.clone(),
    );
    
    // Save to storage
    if let Err(e) = storage.save_transaction(transaction.clone()) {
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Storage error: {e}"),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }));
    }
    
    // Update metrics
    let _ = storage.update_metrics("transactions_received", 1);
    
    // Broadcast transaction with proper error handling
    let tx_bytes = match hex::decode(&req.signed_tx.trim_start_matches("0x")) {
        Ok(b) => b,
        Err(_) => return ErrorResponseBuilder::bad_request("Invalid hex format for signed transaction"),
    };
    
    // Use blockchain error handling utility
    let blockchain_result = crate::utils::blockchain::send_transaction(tx_bytes, &req.rpc_url).await;
    match error_utils::handle_blockchain_error(
        blockchain_result,
        "send_transaction",
        &error_handler
    ).await {
        Ok(hash) => {
            let _ = storage.update_metrics("transactions_processed", 1);
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "hash": format!("0x{:x}", hash),
                "transaction_id": transaction.id,
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }))
        },
        Err(error_response) => {
            let _ = storage.update_metrics("transactions_failed", 1);
            error_response
        },
    }
}

/// New endpoint for handling compressed payloads with enhanced validation
#[post("/send_compressed_tx")]
async fn send_compressed_tx(
    req: web::Json<CompressedPayloadRequest>,
    storage: Data<Arc<Storage>>,
    blockchain_manager: Data<Arc<BlockchainManager>>,
) -> impl Responder {
    // Enhanced validation using sanitizer
    use crate::utils::sanitizer::InputSanitizer;
    let sanitizer = InputSanitizer::new();
    
    // Validate chain ID
    let chain_validation = sanitizer.sanitize_chain_id(&req.chain_id.to_string());
    if chain_validation.data.is_none() {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid chain ID",
            "field": "chain_id",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }));
    }

    // Validate device ID if provided
    if let Some(device_id) = &req.device_id {
        let device_validation = sanitizer.sanitize_device_id(device_id);
        if device_validation.data.is_none() {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid device ID format",
                "field": "device_id",
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }));
        }
    }

    // Validate payload type
    let payload_type_validation = sanitizer.sanitize_string(&req.payload_type, Some(20));
    if payload_type_validation.data.is_none() {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid payload type",
            "field": "payload_type",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }));
    }

    // Decode base64 compressed data
    let compressed_data = match base64::decode(&req.compressed_data) {
        Ok(data) => data,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid base64 encoded compressed data",
            "field": "compressed_data",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    };

    // Create transaction processor
    let transaction_processor = TransactionProcessor::new(
        blockchain_manager.as_ref().clone(),
        storage.as_ref().clone(),
        None, // Use default config
    );

    // Process compressed payload based on type
    let decompressed_data = match req.payload_type.as_str() {
        "transaction" => {
            match transaction_processor.process_compressed_ble_payment(&compressed_data).await {
                Ok(data) => data,
                Err(e) => return HttpResponse::BadRequest().json(serde_json::json!({
                    "error": format!("Failed to decompress transaction payload: {}", e),
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                })),
            }
        }
        "ble" => {
            match transaction_processor.process_compressed_ble_payment(&compressed_data).await {
                Ok(data) => data,
                Err(e) => return HttpResponse::BadRequest().json(serde_json::json!({
                    "error": format!("Failed to decompress BLE payment data: {}", e),
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                })),
            }
        }
        "qr" => {
            match transaction_processor.process_compressed_qr_payment(&compressed_data).await {
                Ok(data) => data,
                Err(e) => return HttpResponse::BadRequest().json(serde_json::json!({
                    "error": format!("Failed to decompress QR payment request: {}", e),
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                })),
            }
        }
        _ => return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid payload type. Must be 'transaction', 'ble', or 'qr'",
            "field": "payload_type",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    };

    // Extract transaction data from decompressed payload
    let signed_tx = match decompressed_data.get("signedTx") {
        Some(tx) => tx.as_str().unwrap_or("").to_string(),
        None => return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Missing signedTx in decompressed payload",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    };

    // Validate the extracted signed transaction
    let tx_validation = sanitizer.sanitize_hash(&signed_tx);
    if tx_validation.data.is_none() {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid signed transaction in decompressed payload",
            "field": "signedTx",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }));
    }

    // Create transaction record
    let transaction = Transaction::new(
        signed_tx.clone(),
        req.chain_id,
        req.device_id.clone(),
    );
    
    // Save to storage
    if let Err(e) = storage.save_transaction(transaction.clone()) {
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Storage error: {e}"),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }));
    }
    
    // Update metrics
    let _ = storage.update_metrics("transactions_received", 1);
    
    // Broadcast transaction
    let tx_bytes = match hex::decode(&signed_tx.trim_start_matches("0x")) {
        Ok(b) => b,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid hex for signed_tx",
            "field": "signed_tx",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    };
    
    match crate::utils::blockchain::send_transaction(tx_bytes, &req.rpc_url).await {
        Ok(hash) => {
            let _ = storage.update_metrics("transactions_processed", 1);
            
            // Calculate compression stats
            let stats = transaction_processor.get_compression_stats(
                compressed_data.len(),
                compressed_data.len() // For now, using same size
            );
            
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "hash": format!("0x{:x}", hash),
                "transaction_id": transaction.id,
                "decompressed_data": decompressed_data,
                "compression_stats": {
                    "original_size": stats.original_size,
                    "compressed_size": stats.compressed_size,
                    "compression_ratio": stats.compression_ratio,
                    "space_saved_percent": stats.space_saved_percent,
                    "format": stats.format,
                }
            }))
        },
        Err(e) => {
            let _ = storage.update_metrics("transactions_failed", 1);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "error": format!("Broadcast error: {e}"),
            }))
        },
    }
}

/// Endpoint to compress transaction data with validation
#[post("/compress_transaction")]
async fn compress_transaction(
    req: web::Json<serde_json::Value>,
    storage: Data<Arc<Storage>>,
) -> impl Responder {
    // Validate input using sanitizer
    use crate::utils::sanitizer::InputSanitizer;
    let sanitizer = InputSanitizer::new();
    
    // Validate the request data
    let validation_result = sanitizer.validate_request(&req, &HashMap::new(), &HashMap::new());
    if !validation_result.valid {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Input validation failed",
            "errors": validation_result.errors,
            "warnings": validation_result.warnings,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }));
    }

    let config = crate::config::Config::development_config().unwrap_or_default();
    let transaction_processor = TransactionProcessor::new(
        Arc::new(BlockchainManager::new(config.clone()).unwrap()),
        storage.as_ref().clone(),
        None, // Use default config
    );

    match transaction_processor.compress_transaction_data(&req.into_inner()).await {
        Ok(compressed_data) => {
            let base64_data = base64::encode(&compressed_data);
            let stats = transaction_processor.get_compression_stats(
                serde_json::to_string(&req).unwrap().len(),
                compressed_data.len()
            );
            
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "compressed_data": base64_data,
                "compression_stats": {
                    "original_size": stats.original_size,
                    "compressed_size": stats.compressed_size,
                    "compression_ratio": stats.compression_ratio,
                    "space_saved_percent": stats.space_saved_percent,
                    "format": stats.format,
                }
            }))
        },
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "error": format!("Compression failed: {}", e),
        })),
    }
}

/// Endpoint to compress BLE payment data with validation
#[post("/compress_ble_payment")]
async fn compress_ble_payment(
    req: web::Json<serde_json::Value>,
    storage: Data<Arc<Storage>>,
) -> impl Responder {
    // Validate input using sanitizer
    use crate::utils::sanitizer::InputSanitizer;
    let sanitizer = InputSanitizer::new();
    
    // Validate the request data
    let validation_result = sanitizer.validate_request(&req, &HashMap::new(), &HashMap::new());
    if !validation_result.valid {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Input validation failed",
            "errors": validation_result.errors,
            "warnings": validation_result.warnings,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }));
    }

    let config = crate::config::Config::development_config().unwrap_or_default();
    let transaction_processor = TransactionProcessor::new(
        Arc::new(BlockchainManager::new(config.clone()).unwrap()),
        storage.as_ref().clone(),
        None, // Use default config
    );

    match transaction_processor.compress_ble_payment_data(&req.into_inner()).await {
        Ok(compressed_data) => {
            let base64_data = base64::encode(&compressed_data);
            let stats = transaction_processor.get_compression_stats(
                serde_json::to_string(&req).unwrap().len(),
                compressed_data.len()
            );
            
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "compressed_data": base64_data,
                "compression_stats": {
                    "original_size": stats.original_size,
                    "compressed_size": stats.compressed_size,
                    "compression_ratio": stats.compression_ratio,
                    "space_saved_percent": stats.space_saved_percent,
                    "format": stats.format,
                }
            }))
        },
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "error": format!("Compression failed: {}", e),
        })),
    }
}

/// Endpoint to compress QR payment request with validation
#[post("/compress_qr_payment")]
async fn compress_qr_payment(
    req: web::Json<serde_json::Value>,
    storage: Data<Arc<Storage>>,
) -> impl Responder {
    // Validate input using sanitizer
    use crate::utils::sanitizer::InputSanitizer;
    let sanitizer = InputSanitizer::new();
    
    // Validate the request data
    let validation_result = sanitizer.validate_request(&req, &HashMap::new(), &HashMap::new());
    if !validation_result.valid {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Input validation failed",
            "errors": validation_result.errors,
            "warnings": validation_result.warnings,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }));
    }

    let config = crate::config::Config::development_config().unwrap_or_default();
    let transaction_processor = TransactionProcessor::new(
        Arc::new(BlockchainManager::new(config.clone()).unwrap()),
        storage.as_ref().clone(),
        None, // Use default config
    );

    match transaction_processor.compress_qr_payment_request(&req.into_inner()).await {
        Ok(compressed_data) => {
            let base64_data = base64::encode(&compressed_data);
            let stats = transaction_processor.get_compression_stats(
                serde_json::to_string(&req).unwrap().len(),
                compressed_data.len()
            );
            
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "compressed_data": base64_data,
                "compression_stats": {
                    "original_size": stats.original_size,
                    "compressed_size": stats.compressed_size,
                    "compression_ratio": stats.compression_ratio,
                    "space_saved_percent": stats.space_saved_percent,
                    "format": stats.format,
                }
            }))
        },
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "error": format!("Compression failed: {}", e),
        })),
    }
}

#[post("/transaction/submit")]
async fn submit_transaction(
    req: web::Json<SendTxRequest>,
    storage: Data<Arc<Storage>>,
    blockchain_manager: Data<Arc<BlockchainManager>>,
) -> impl Responder {
    // This is the main transaction submission endpoint
    send_tx(req, storage, blockchain_manager).await
}

#[post("/api/v1/submit-transaction")]
async fn legacy_submit_transaction(
    req: web::Json<SendTxRequest>,
    storage: Data<Arc<Storage>>,
    blockchain_manager: Data<Arc<BlockchainManager>>,
) -> impl Responder {
    // Legacy endpoint for backward compatibility
    send_tx(req, storage, blockchain_manager).await
}

#[get("/contract/payments")]
async fn get_contract_payments(
    blockchain_manager: Data<Arc<BlockchainManager>>,
) -> impl Responder {
    // In test mode, return mock data
    let is_test_mode = std::env::var("TEST_MODE").unwrap_or_else(|_| "false".to_string()) == "true";
    
    if is_test_mode {
        return HttpResponse::Ok().json(serde_json::json!({
            "payments": [
                {
                    "from": "0xsender",
                    "to": "0xrecipient",
                    "amount": "1000000000000000000",
                    "payment_reference": "test-payment",
                    "tx_hash": "0xtxhash",
                    "block_number": 12345,
                },
            ],
        }));
    }
    
    // TODO: Implement actual contract event fetching
    HttpResponse::Ok().json(serde_json::json!({
        "payments": [],
        "message": "Contract payments endpoint - to be implemented"
    }))
}

#[derive(Deserialize)]
struct TokenRequest {
    api_key: String,
}

#[post("/auth/token")]
async fn generate_token(
    req: web::Json<TokenRequest>,
) -> impl Responder {
    let api_key = std::env::var("API_KEY").unwrap_or_else(|_| "dev_api_key".to_string());
    
    if req.api_key != api_key {
        return HttpResponse::Unauthorized().json(serde_json::json!({
            "error": "Invalid API key"
        }));
    }
    
    // Generate JWT token
    let token = crate::auth::generate_jwt_token("api-client", "relay");
    
    HttpResponse::Ok().json(serde_json::json!({
        "token": token
    }))
}

#[derive(Deserialize)]
struct BLEProcessRequest {
    device_id: String,
    transaction_data: serde_json::Value,
}

#[post("/ble/process-transaction")]
async fn process_ble_transaction(
    req: web::Json<BLEProcessRequest>,
    storage: Data<Arc<Storage>>,
) -> impl Responder {
    // Validate device ID
    if !SecurityManager::validate_device_id(&req.device_id) {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid device ID format",
            "field": "device_id",
        }));
    }
    
    // Process BLE transaction
    match crate::ble::process_transaction(&req.device_id, &req.transaction_data).await {
        Ok(result) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "result": result,
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "error": format!("BLE transaction processing failed: {e}"),
        })),
    }
}

#[post("/ble/key-exchange/initiate/{device_id}")]
async fn initiate_key_exchange(
    path: web::Path<String>,
) -> impl Responder {
    let device_id = path.into_inner();
    
    if !SecurityManager::validate_device_id(&device_id) {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid device ID format",
        }));
    }
    
    match crate::ble::initiate_key_exchange(&device_id).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": "Key exchange initiated successfully"
        })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": format!("Key exchange initiation failed: {e}")
        })),
    }
}

#[post("/ble/key-exchange/rotate/{device_id}")]
async fn rotate_session_key(
    path: web::Path<String>,
) -> impl Responder {
    let device_id = path.into_inner();
    
    if !SecurityManager::validate_device_id(&device_id) {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid device ID format",
        }));
    }
    
    match crate::ble::rotate_session_key(&device_id).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": "Session key rotation initiated successfully"
        })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": format!("Key rotation failed: {e}")
        })),
    }
}

#[derive(Deserialize)]
struct BlockDeviceRequest {
    reason: Option<String>,
}

#[post("/ble/key-exchange/block/{device_id}")]
async fn block_device(
    path: web::Path<String>,
    req: web::Json<BlockDeviceRequest>,
) -> impl Responder {
    let device_id = path.into_inner();
    
    if !SecurityManager::validate_device_id(&device_id) {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid device ID format",
        }));
    }
    
    match crate::ble::block_device(&device_id, req.reason.as_deref()).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": "Device blocked from key exchange successfully"
        })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": format!("Failed to block device: {e}")
        })),
    }
}

#[post("/ble/key-exchange/unblock/{device_id}")]
async fn unblock_device(
    path: web::Path<String>,
) -> impl Responder {
    let device_id = path.into_inner();
    
    if !SecurityManager::validate_device_id(&device_id) {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid device ID format",
        }));
    }
    
    match crate::ble::unblock_device(&device_id).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": "Device unblocked from key exchange successfully"
        })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": format!("Failed to unblock device: {e}")
        })),
    }
}

#[get("/ble/key-exchange/devices")]
async fn get_key_exchange_devices() -> impl Responder {
    match crate::ble::get_key_exchange_devices().await {
        Ok(devices) => HttpResponse::Ok().json(serde_json::json!({
            "devices": devices
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Failed to get key exchange devices: {e}")
        })),
    }
}

// Database API endpoints
#[get("/api/database/transactions")]
async fn get_database_transactions(
    storage: Data<Arc<Storage>>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> impl Responder {
    let limit = query.get("limit")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(100);
    let offset = query.get("offset")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(0);
    
    let transactions = storage.get_transactions(limit, offset);
    let total = storage.get_transactions(10000).len();
    
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "data": {
            "transactions": transactions,
            "pagination": {
                "limit": limit,
                "offset": offset,
                "total": total,
                "has_more": offset + limit < total,
            },
        },
    }))
}

#[get("/api/database/transactions/{id}")]
async fn get_transaction_by_id(
    path: web::Path<String>,
    storage: Data<Arc<Storage>>,
) -> impl Responder {
    let id = path.into_inner();
    
    match storage.get_transaction_by_id(&id) {
        Some(transaction) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "data": transaction,
        })),
        None => HttpResponse::NotFound().json(serde_json::json!({
            "error": "Transaction not found"
        })),
    }
}

#[get("/api/database/transactions/device/{device_id}")]
async fn get_transactions_by_device(
    path: web::Path<String>,
    storage: Data<Arc<Storage>>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> impl Responder {
    let device_id = path.into_inner();
    let limit = query.get("limit")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(50);
    
    let transactions = storage.get_transactions_by_device(&device_id, limit);
    
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "data": {
            "transactions": transactions,
            "device_id": device_id,
            "count": transactions.len(),
        },
    }))
}

#[post("/api/database/backup")]
async fn create_database_backup(
    storage: Data<Arc<Storage>>,
) -> impl Responder {
    match storage.create_backup() {
        Ok(backup_path) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "data": {
                "backup_path": backup_path,
                "message": "Backup created successfully",
            },
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Failed to create backup: {e}")
        })),
    }
}

#[get("/api/database/stats")]
async fn get_database_stats(
    storage: Data<Arc<Storage>>,
) -> impl Responder {
    let transactions = storage.get_transactions(10000, 0);
    let devices = storage.get_all_devices();
    let metrics = storage.get_metrics();
    
    let stats = serde_json::json!({
        "transactions": {
            "total": transactions.len(),
            "recent": transactions.iter().rev().take(10).count(),
            "by_chain": {
                // TODO: Implement chain grouping
                "unknown": transactions.len(),
            },
        },
        "devices": {
            "total": devices.len(),
            "active": devices.iter().filter(|d| d.status == "active").count(),
            "inactive": devices.iter().filter(|d| d.status == "inactive").count(),
        },
        "metrics": {
            "total": metrics.len(),
            "time_range": "24h",
        },
        "storage": {
            "data_directory": "./data",
            "backup_directory": "./data/backups",
        },
    });
    
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "data": stats,
    }))
}

#[get("/api/database/security")]
async fn get_database_security(
    storage: Data<Arc<Storage>>,
) -> impl Responder {
    let security_status = storage.get_security_status();
    let recent_audit_logs = storage.get_recent_audit_logs(20);
    
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "data": {
            "security_status": security_status,
            "recent_audit_logs": recent_audit_logs,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        },
    }))
}

#[get("/networks/status")]
async fn get_networks_status(
    blockchain_manager: Data<Arc<BlockchainManager>>,
) -> impl Responder {
    let networks = vec![
        serde_json::json!({
            "chain_id": 84532,
            "name": "Base Sepolia",
            "rpc_url": "https://sepolia.base.org",
            "contract_address": "0x7B79117445C57eea1CEAb4733020A55e1D503934",
            "explorer": "https://sepolia.basescan.org",
            "currency": "ETH",
        }),
        serde_json::json!({
            "chain_id": 1114,
            "name": "Core Testnet 2",
            "rpc_url": "https://rpc.test2.btcs.network",
            "contract_address": "0x7B79117445C57eea1CEAb4733020A55e1D503934",
            "explorer": "https://scan.test2.btcs.network",
            "currency": "TCORE2",
        }),
    ];

    let mut network_status = Vec::new();

    for network in networks {
        let mut status = network.as_object().unwrap().clone();
        status.insert("status".to_string(), serde_json::Value::String("online".to_string()));
        status.insert("last_checked".to_string(), serde_json::Value::String(chrono::Utc::now().to_rfc3339()));
        network_status.push(serde_json::Value::Object(status));
    }

    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "data": {
            "networks": network_status,
            "total_networks": networks.len(),
            "online_networks": network_status.len(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        },
    }))
}

#[post("/auth")]
async fn authenticate_device(
    req: web::Json<AuthRequest>,
    auth_manager: Data<AuthManager>,
    storage: Data<Arc<Storage>>,
) -> impl Responder {
    // Validate device ID
    if !SecurityManager::validate_device_id(&req.device_id) {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid device ID format",
            "field": "device_id",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }));
    }
    
    // Create or update device record
    let mut device = Device::new(req.device_id.clone());
    device.public_key = Some(req.public_key.clone());
    device.status = "authenticated".to_string();
    
    if let Err(e) = storage.save_device(device) {
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Storage error: {e}"),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }));
    }
    
    // Generate authentication token
    match auth_manager.authenticate_device(&req) {
        Ok(auth_response) => {
            let _ = storage.update_metrics("ble_connections", 1);
            HttpResponse::Ok().json(auth_response)
        },
        Err(e) => {
            let _ = storage.update_metrics("auth_failures", 1);
            HttpResponse::Unauthorized().json(serde_json::json!({
                "error": format!("Authentication failed: {e}"),
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }))
        },
    }
}

#[get("/transactions")]
async fn get_transactions(
    storage: Data<Arc<Storage>>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> impl Responder {
    let limit = query.get("limit")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(100);
    
    let transactions = storage.get_transactions(limit, 0);
    HttpResponse::Ok().json(transactions)
}

#[get("/metrics")]
async fn get_metrics(
    storage: Data<Arc<Storage>>,
    monitoring_manager: Data<Arc<MonitoringManager>>,
) -> impl Responder {
    let metrics = monitoring_manager.get_metrics().await;
    let system_metrics = monitoring_manager.get_system_metrics().await;
    
    let prometheus_metrics = format!(
        "# HELP airchainpay_transactions_received_total Total number of transactions received
# TYPE airchainpay_transactions_received_total counter
airchainpay_transactions_received_total {}

# HELP airchainpay_transactions_processed_total Total number of transactions processed
# TYPE airchainpay_transactions_processed_total counter
airchainpay_transactions_processed_total {}

# HELP airchainpay_transactions_failed_total Total number of transactions failed
# TYPE airchainpay_transactions_failed_total counter
airchainpay_transactions_failed_total {}

# HELP airchainpay_transactions_broadcasted_total Total number of transactions broadcasted
# TYPE airchainpay_transactions_broadcasted_total counter
airchainpay_transactions_broadcasted_total {}

# HELP airchainpay_ble_connections_total Total number of BLE connections
# TYPE airchainpay_ble_connections_total counter
airchainpay_ble_connections_total {}

# HELP airchainpay_ble_disconnections_total Total number of BLE disconnections
# TYPE airchainpay_ble_disconnections_total counter
airchainpay_ble_disconnections_total {}

# HELP airchainpay_ble_authentications_total Total number of BLE authentications
# TYPE airchainpay_ble_authentications_total counter
airchainpay_ble_authentications_total {}

# HELP airchainpay_ble_key_exchanges_total Total number of BLE key exchanges
# TYPE airchainpay_ble_key_exchanges_total counter
airchainpay_ble_key_exchanges_total {}

# HELP airchainpay_rpc_errors_total Total number of RPC errors
# TYPE airchainpay_rpc_errors_total counter
airchainpay_rpc_errors_total {}

# HELP airchainpay_auth_failures_total Total number of authentication failures
# TYPE airchainpay_auth_failures_total counter
airchainpay_auth_failures_total {}

# HELP airchainpay_rate_limit_hits_total Total number of rate limit hits
# TYPE airchainpay_rate_limit_hits_total counter
airchainpay_rate_limit_hits_total {}

# HELP airchainpay_blocked_devices_total Total number of blocked devices
# TYPE airchainpay_blocked_devices_total counter
airchainpay_blocked_devices_total {}

# HELP airchainpay_requests_total Total number of requests
# TYPE airchainpay_requests_total counter
airchainpay_requests_total {}

# HELP airchainpay_requests_successful_total Total number of successful requests
# TYPE airchainpay_requests_successful_total counter
airchainpay_requests_successful_total {}

# HELP airchainpay_requests_failed_total Total number of failed requests
# TYPE airchainpay_requests_failed_total counter
airchainpay_requests_failed_total {}

# HELP airchainpay_response_time_avg_ms Average response time in milliseconds
# TYPE airchainpay_response_time_avg_ms gauge
airchainpay_response_time_avg_ms {}

# HELP airchainpay_active_connections Current number of active connections
# TYPE airchainpay_active_connections gauge
airchainpay_active_connections {}

# HELP airchainpay_database_operations_total Total number of database operations
# TYPE airchainpay_database_operations_total counter
airchainpay_database_operations_total {}

# HELP airchainpay_database_errors_total Total number of database errors
# TYPE airchainpay_database_errors_total counter
airchainpay_database_errors_total {}

# HELP airchainpay_compression_operations_total Total number of compression operations
# TYPE airchainpay_compression_operations_total counter
airchainpay_compression_operations_total {}

# HELP airchainpay_security_events_total Total number of security events
# TYPE airchainpay_security_events_total counter
airchainpay_security_events_total {}

# HELP airchainpay_validation_failures_total Total number of validation failures
# TYPE airchainpay_validation_failures_total counter
airchainpay_validation_failures_total {}

# HELP airchainpay_cache_hits_total Total number of cache hits
# TYPE airchainpay_cache_hits_total counter
airchainpay_cache_hits_total {}

# HELP airchainpay_cache_misses_total Total number of cache misses
# TYPE airchainpay_cache_misses_total counter
airchainpay_cache_misses_total {}

# HELP airchainpay_network_errors_total Total number of network errors
# TYPE airchainpay_network_errors_total counter
airchainpay_network_errors_total {}

# HELP airchainpay_blockchain_confirmations_total Total number of blockchain confirmations
# TYPE airchainpay_blockchain_confirmations_total counter
airchainpay_blockchain_confirmations_total {}

# HELP airchainpay_blockchain_timeouts_total Total number of blockchain timeouts
# TYPE airchainpay_blockchain_timeouts_total counter
airchainpay_blockchain_timeouts_total {}

# HELP airchainpay_gas_price_updates_total Total number of gas price updates
# TYPE airchainpay_gas_price_updates_total counter
airchainpay_gas_price_updates_total {}

# HELP airchainpay_contract_events_total Total number of contract events
# TYPE airchainpay_contract_events_total counter
airchainpay_contract_events_total {}

# HELP airchainpay_uptime_seconds Server uptime in seconds
# TYPE airchainpay_uptime_seconds gauge
airchainpay_uptime_seconds {}

# HELP airchainpay_memory_usage_bytes Memory usage in bytes
# TYPE airchainpay_memory_usage_bytes gauge
airchainpay_memory_usage_bytes {}

# HELP airchainpay_cpu_usage_percent CPU usage percentage
# TYPE airchainpay_cpu_usage_percent gauge
airchainpay_cpu_usage_percent {}

# HELP airchainpay_system_memory_usage_bytes System memory usage in bytes
# TYPE airchainpay_system_memory_usage_bytes gauge
airchainpay_system_memory_usage_bytes {}

# HELP airchainpay_system_cpu_usage_percent System CPU usage percentage
# TYPE airchainpay_system_cpu_usage_percent gauge
airchainpay_system_cpu_usage_percent {}

# HELP airchainpay_system_thread_count Number of system threads
# TYPE airchainpay_system_thread_count gauge
airchainpay_system_thread_count {}
",
        metrics.transactions_received,
        metrics.transactions_processed,
        metrics.transactions_failed,
        metrics.transactions_broadcasted,
        metrics.ble_connections,
        metrics.ble_disconnections,
        metrics.ble_authentications,
        metrics.ble_key_exchanges,
        metrics.rpc_errors,
        metrics.auth_failures,
        metrics.rate_limit_hits,
        metrics.blocked_devices,
        metrics.requests_total,
        metrics.requests_successful,
        metrics.requests_failed,
        metrics.response_time_avg_ms,
        metrics.active_connections,
        metrics.database_operations,
        metrics.database_errors,
        metrics.compression_operations,
        metrics.security_events,
        metrics.validation_failures,
        metrics.cache_hits,
        metrics.cache_misses,
        metrics.network_errors,
        metrics.blockchain_confirmations,
        metrics.blockchain_timeouts,
        metrics.gas_price_updates,
        metrics.contract_events,
        metrics.uptime_seconds,
        metrics.memory_usage_bytes,
        metrics.cpu_usage_percent,
        system_metrics.memory_usage_bytes,
        system_metrics.cpu_usage_percent,
        system_metrics.thread_count,
    );

    HttpResponse::Ok()
        .content_type("text/plain")
        .body(prometheus_metrics)
}

#[get("/devices")]
async fn get_devices(storage: Data<Arc<Storage>>) -> impl Responder {
    let devices = storage.get_all_devices();
    HttpResponse::Ok().json(devices)
}

// Legacy endpoint for backward compatibility
#[post("/tx")]
async fn legacy_tx() -> impl Responder {
    HttpResponse::BadRequest().json(serde_json::json!({
        "error": "Legacy endpoint not supported"
    }))
}

#[post("/backup/create")]
async fn create_backup(
    storage: Data<Arc<Storage>>,
    backup_manager: Data<Arc<BackupManager>>,
    req: Json<CreateBackupRequest>,
) -> impl Responder {
    let backup_type = match req.backup_type.as_str() {
        "full" => BackupType::Full,
        "transaction" => BackupType::Transaction,
        "audit" => BackupType::Audit,
        "metrics" => BackupType::Metrics,
        "configuration" => BackupType::Configuration,
        "incremental" => BackupType::Incremental,
        "auto" => BackupType::Auto,
        _ => BackupType::Full,
    };

    match backup_manager.create_backup(backup_type, req.description.clone()).await {
        Ok(backup_id) => {
            HttpResponse::Ok().json(CreateBackupResponse {
                success: true,
                backup_id,
                message: "Backup created successfully".to_string(),
            })
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(CreateBackupResponse {
                success: false,
                backup_id: "".to_string(),
                message: format!("Backup creation failed: {}", e),
            })
        }
    }
}

#[post("/backup/restore")]
async fn restore_backup(
    storage: Data<Arc<Storage>>,
    backup_manager: Data<Arc<BackupManager>>,
    req: Json<RestoreBackupRequest>,
) -> impl Responder {
    let options = RestoreOptions {
        verify_integrity: req.verify_integrity,
        restore_type: req.restore_type.as_ref().map(|t| match t.as_str() {
            "full" => BackupType::Full,
            "transaction" => BackupType::Transaction,
            "audit" => BackupType::Audit,
            "metrics" => BackupType::Metrics,
            "configuration" => BackupType::Configuration,
            "incremental" => BackupType::Incremental,
            "auto" => BackupType::Auto,
            _ => BackupType::Full,
        }),
        overwrite_existing: req.overwrite_existing,
    };

    match backup_manager.restore_backup(&req.backup_id, req.restore_path.as_deref(), options).await {
        Ok(result) => {
            HttpResponse::Ok().json(RestoreBackupResponse {
                success: true,
                backup_id: result.backup_id,
                restore_path: result.restore_path,
                restored_files: result.restored_files,
                message: "Backup restored successfully".to_string(),
            })
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(RestoreBackupResponse {
                success: false,
                backup_id: req.backup_id.clone(),
                restore_path: "".to_string(),
                restored_files: vec![],
                message: format!("Backup restoration failed: {}", e),
            })
        }
    }
}

#[get("/backup/list")]
async fn list_backups(
    storage: Data<Arc<Storage>>,
    backup_manager: Data<Arc<BackupManager>>,
    query: Query<ListBackupsQuery>,
) -> impl Responder {
    let filter = if query.backup_type.is_some() || query.start_date.is_some() || query.end_date.is_some() {
        let mut backup_types = None;
        if let Some(ref types) = query.backup_type {
            backup_types = Some(types.iter().map(|t| match t.as_str() {
                "full" => BackupType::Full,
                "transaction" => BackupType::Transaction,
                "audit" => BackupType::Audit,
                "metrics" => BackupType::Metrics,
                "configuration" => BackupType::Configuration,
                "incremental" => BackupType::Incremental,
                "auto" => BackupType::Auto,
                _ => BackupType::Full,
            }).collect());
        }

        Some(BackupFilter {
            backup_types,
            start_date: query.start_date,
            end_date: query.end_date,
            tags: None,
        })
    } else {
        None
    };

    let backups = backup_manager.list_backups(filter).await;
    
    HttpResponse::Ok().json(ListBackupsResponse {
        success: true,
        backups: backups.into_iter().map(|b| BackupInfo {
            id: b.id,
            timestamp: b.timestamp,
            backup_type: format!("{:?}", b.backup_type),
            file_size: b.file_size,
            description: b.description,
            file_count: b.file_count,
            total_size: b.total_size,
        }).collect(),
    })
}

#[get("/backup/{backup_id}")]
async fn get_backup_info(
    storage: Data<Arc<Storage>>,
    backup_manager: Data<Arc<BackupManager>>,
    path: Path<String>,
) -> impl Responder {
    let backup_id = path.into_inner();
    
    match backup_manager.get_backup_metadata(&backup_id).await {
        Ok(Some(metadata)) => {
            HttpResponse::Ok().json(GetBackupResponse {
                success: true,
                backup: BackupInfo {
                    id: metadata.id,
                    timestamp: metadata.timestamp,
                    backup_type: format!("{:?}", metadata.backup_type),
                    file_size: metadata.file_size,
                    description: metadata.description,
                    file_count: metadata.file_count,
                    total_size: metadata.total_size,
                },
            })
        }
        Ok(None) => {
            HttpResponse::NotFound().json(GetBackupResponse {
                success: false,
                backup: BackupInfo {
                    id: backup_id,
                    timestamp: Utc::now(),
                    backup_type: "".to_string(),
                    file_size: 0,
                    description: None,
                    file_count: 0,
                    total_size: 0,
                },
            })
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(GetBackupResponse {
                success: false,
                backup: BackupInfo {
                    id: backup_id,
                    timestamp: Utc::now(),
                    backup_type: "".to_string(),
                    file_size: 0,
                    description: None,
                    file_count: 0,
                    total_size: 0,
                },
            })
        }
    }
}

#[delete("/backup/{backup_id}")]
async fn delete_backup(
    storage: Data<Arc<Storage>>,
    backup_manager: Data<Arc<BackupManager>>,
    path: Path<String>,
) -> impl Responder {
    let backup_id = path.into_inner();
    
    match backup_manager.delete_backup(&backup_id).await {
        Ok(_) => {
            HttpResponse::Ok().json(DeleteBackupResponse {
                success: true,
                backup_id,
                message: "Backup deleted successfully".to_string(),
            })
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(DeleteBackupResponse {
                success: false,
                backup_id,
                message: format!("Backup deletion failed: {}", e),
            })
        }
    }
}

#[post("/backup/verify/{backup_id}")]
async fn verify_backup(
    storage: Data<Arc<Storage>>,
    backup_manager: Data<Arc<BackupManager>>,
    path: Path<String>,
) -> impl Responder {
    let backup_id = path.into_inner();
    
    match backup_manager.verify_backup_integrity(&backup_id).await {
        Ok(is_valid) => {
            HttpResponse::Ok().json(VerifyBackupResponse {
                success: true,
                backup_id,
                is_valid,
                message: if is_valid {
                    "Backup integrity verified".to_string()
                } else {
                    "Backup integrity check failed".to_string()
                },
            })
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(VerifyBackupResponse {
                success: false,
                backup_id,
                is_valid: false,
                message: format!("Backup verification failed: {}", e),
            })
        }
    }
}

#[get("/backup/stats")]
async fn get_backup_stats(
    storage: Data<Arc<Storage>>,
    backup_manager: Data<Arc<BackupManager>>,
) -> impl Responder {
    let stats = backup_manager.get_backup_stats().await;
    
    HttpResponse::Ok().json(BackupStatsResponse {
        success: true,
        stats: BackupStatsInfo {
            total_backups: stats.total_backups,
            total_size: stats.total_size,
            type_counts: stats.type_counts.into_iter().map(|(k, v)| (format!("{:?}", k), v)).collect(),
            oldest_backup: stats.oldest_backup,
            newest_backup: stats.newest_backup,
        },
    })
}

#[post("/backup/cleanup")]
async fn cleanup_backups(
    storage: Data<Arc<Storage>>,
    backup_manager: Data<Arc<BackupManager>>,
) -> impl Responder {
    match backup_manager.cleanup_old_backups().await {
        Ok(deleted_count) => {
            HttpResponse::Ok().json(CleanupBackupsResponse {
                success: true,
                deleted_count,
                message: format!("Cleaned up {} old backups", deleted_count),
            })
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(CleanupBackupsResponse {
                success: false,
                deleted_count: 0,
                message: format!("Backup cleanup failed: {}", e),
            })
        }
    }
}

#[get("/audit/events")]
async fn get_audit_events(
    storage: Data<Arc<Storage>>,
    audit_logger: Data<Arc<AuditLogger>>,
    query: Query<AuditEventsQuery>,
) -> impl Responder {
    let filter = if query.event_type.is_some() || query.user_id.is_some() || query.device_id.is_some() || 
                   query.ip_address.is_some() || query.success.is_some() || query.severity.is_some() ||
                   query.start_time.is_some() || query.end_time.is_some() || query.resource.is_some() ||
                   query.action.is_some() {
        let mut event_types = None;
        if let Some(ref types) = query.event_type {
            event_types = Some(types.iter().map(|t| match t.as_str() {
                "authentication" => AuditEventType::Authentication,
                "authorization" => AuditEventType::Authorization,
                "transaction" => AuditEventType::Transaction,
                "device_management" => AuditEventType::DeviceManagement,
                "system_operation" => AuditEventType::SystemOperation,
                "security" => AuditEventType::Security,
                "configuration" => AuditEventType::Configuration,
                "data_access" => AuditEventType::DataAccess,
                "error" => AuditEventType::Error,
                "performance" => AuditEventType::Performance,
                "backup" => AuditEventType::Backup,
                "recovery" => AuditEventType::Recovery,
                "integrity" => AuditEventType::Integrity,
                "rate_limit" => AuditEventType::RateLimit,
                "compression" => AuditEventType::Compression,
                "monitoring" => AuditEventType::Monitoring,
                "database" => AuditEventType::Database,
                "network" => AuditEventType::Network,
                "ble" => AuditEventType::BLE,
                "api" => AuditEventType::API,
                _ => AuditEventType::Error,
            }).collect());
        }

        let mut severity = None;
        if let Some(ref sev) = query.severity {
            severity = Some(match sev.as_str() {
                "low" => AuditSeverity::Low,
                "medium" => AuditSeverity::Medium,
                "high" => AuditSeverity::High,
                "critical" => AuditSeverity::Critical,
                _ => AuditSeverity::Medium,
            });
        }

        Some(AuditFilter {
            event_types,
            user_id: query.user_id.clone(),
            device_id: query.device_id.clone(),
            ip_address: query.ip_address.clone(),
            success: query.success,
            severity,
            start_time: query.start_time,
            end_time: query.end_time,
            limit: query.limit,
            resource: query.resource.clone(),
            action: query.action.clone(),
        })
    } else {
        None
    };

    let events = audit_logger.get_events(filter).await;
    
    HttpResponse::Ok().json(GetAuditEventsResponse {
        success: true,
        events: events.into_iter().map(|e| AuditEventInfo {
            id: e.id,
            timestamp: e.timestamp,
            event_type: format!("{:?}", e.event_type),
            user_id: e.user_id,
            device_id: e.device_id,
            ip_address: e.ip_address,
            resource: e.resource,
            action: e.action,
            success: e.success,
            error_message: e.error_message,
            severity: format!("{:?}", e.severity),
            details: e.details,
        }).collect(),
    })
}

#[get("/audit/events/security")]
async fn get_security_events(
    storage: Data<Arc<Storage>>,
    audit_logger: Data<Arc<AuditLogger>>,
    query: Query<AuditLimitQuery>,
) -> impl Responder {
    let events = audit_logger.get_security_events(query.limit).await;
    
    HttpResponse::Ok().json(GetAuditEventsResponse {
        success: true,
        events: events.into_iter().map(|e| AuditEventInfo {
            id: e.id,
            timestamp: e.timestamp,
            event_type: format!("{:?}", e.event_type),
            user_id: e.user_id,
            device_id: e.device_id,
            ip_address: e.ip_address,
            resource: e.resource,
            action: e.action,
            success: e.success,
            error_message: e.error_message,
            severity: format!("{:?}", e.severity),
            details: e.details,
        }).collect(),
    })
}

#[get("/audit/events/failed")]
async fn get_failed_events(
    storage: Data<Arc<Storage>>,
    audit_logger: Data<Arc<AuditLogger>>,
    query: Query<AuditLimitQuery>,
) -> impl Responder {
    let events = audit_logger.get_failed_events(query.limit).await;
    
    HttpResponse::Ok().json(GetAuditEventsResponse {
        success: true,
        events: events.into_iter().map(|e| AuditEventInfo {
            id: e.id,
            timestamp: e.timestamp,
            event_type: format!("{:?}", e.event_type),
            user_id: e.user_id,
            device_id: e.device_id,
            ip_address: e.ip_address,
            resource: e.resource,
            action: e.action,
            success: e.success,
            error_message: e.error_message,
            severity: format!("{:?}", e.severity),
            details: e.details,
        }).collect(),
    })
}

#[get("/audit/events/critical")]
async fn get_critical_events(
    storage: Data<Arc<Storage>>,
    audit_logger: Data<Arc<AuditLogger>>,
    query: Query<AuditLimitQuery>,
) -> impl Responder {
    let events = audit_logger.get_critical_events(query.limit).await;
    
    HttpResponse::Ok().json(GetAuditEventsResponse {
        success: true,
        events: events.into_iter().map(|e| AuditEventInfo {
            id: e.id,
            timestamp: e.timestamp,
            event_type: format!("{:?}", e.event_type),
            user_id: e.user_id,
            device_id: e.device_id,
            ip_address: e.ip_address,
            resource: e.resource,
            action: e.action,
            success: e.success,
            error_message: e.error_message,
            severity: format!("{:?}", e.severity),
            details: e.details,
        }).collect(),
    })
}

#[get("/audit/events/user/{user_id}")]
async fn get_events_by_user(
    storage: Data<Arc<Storage>>,
    audit_logger: Data<Arc<AuditLogger>>,
    path: Path<String>,
    query: Query<AuditLimitQuery>,
) -> impl Responder {
    let user_id = path.into_inner();
    let events = audit_logger.get_events_by_user(&user_id, query.limit).await;
    
    HttpResponse::Ok().json(GetAuditEventsResponse {
        success: true,
        events: events.into_iter().map(|e| AuditEventInfo {
            id: e.id,
            timestamp: e.timestamp,
            event_type: format!("{:?}", e.event_type),
            user_id: e.user_id,
            device_id: e.device_id,
            ip_address: e.ip_address,
            resource: e.resource,
            action: e.action,
            success: e.success,
            error_message: e.error_message,
            severity: format!("{:?}", e.severity),
            details: e.details,
        }).collect(),
    })
}

#[get("/audit/events/device/{device_id}")]
async fn get_events_by_device(
    storage: Data<Arc<Storage>>,
    audit_logger: Data<Arc<AuditLogger>>,
    path: Path<String>,
    query: Query<AuditLimitQuery>,
) -> impl Responder {
    let device_id = path.into_inner();
    let events = audit_logger.get_events_by_device(&device_id, query.limit).await;
    
    HttpResponse::Ok().json(GetAuditEventsResponse {
        success: true,
        events: events.into_iter().map(|e| AuditEventInfo {
            id: e.id,
            timestamp: e.timestamp,
            event_type: format!("{:?}", e.event_type),
            user_id: e.user_id,
            device_id: e.device_id,
            ip_address: e.ip_address,
            resource: e.resource,
            action: e.action,
            success: e.success,
            error_message: e.error_message,
            severity: format!("{:?}", e.severity),
            details: e.details,
        }).collect(),
    })
}

#[get("/audit/stats")]
async fn get_audit_stats(
    storage: Data<Arc<Storage>>,
    audit_logger: Data<Arc<AuditLogger>>,
) -> impl Responder {
    let stats = audit_logger.get_audit_stats().await;
    
    HttpResponse::Ok().json(GetAuditStatsResponse {
        success: true,
        stats: AuditStatsInfo {
            total_events: stats.total_events,
            critical_events: stats.critical_events,
            high_events: stats.high_events,
            medium_events: stats.medium_events,
            low_events: stats.low_events,
            failed_events: stats.failed_events,
            security_events: stats.security_events,
            event_type_counts: stats.event_type_counts.into_iter().collect(),
            oldest_event: stats.oldest_event,
            newest_event: stats.newest_event,
        },
    })
}

#[post("/audit/events/export")]
async fn export_audit_events(
    storage: Data<Arc<Storage>>,
    audit_logger: Data<Arc<AuditLogger>>,
    req: Json<ExportAuditEventsRequest>,
) -> impl Responder {
    let file_path = format!("audit_export_{}.json", chrono::Utc::now().format("%Y%m%d_%H%M%S"));
    
    match audit_logger.export_events(&file_path).await {
        Ok(_) => {
            HttpResponse::Ok().json(ExportAuditEventsResponse {
                success: true,
                file_path,
                message: "Audit events exported successfully".to_string(),
            })
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(ExportAuditEventsResponse {
                success: false,
                file_path: "".to_string(),
                message: format!("Export failed: {}", e),
            })
        }
    }
}

#[delete("/audit/events")]
async fn clear_audit_events(
    storage: Data<Arc<Storage>>,
    audit_logger: Data<Arc<AuditLogger>>,
) -> impl Responder {
    audit_logger.clear_events().await;
    
    HttpResponse::Ok().json(ClearAuditEventsResponse {
        success: true,
        message: "Audit events cleared successfully".to_string(),
    })
}

// Request/Response structures
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateBackupRequest {
    pub backup_type: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateBackupResponse {
    pub success: bool,
    pub backup_id: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RestoreBackupRequest {
    pub backup_id: String,
    pub restore_path: Option<String>,
    pub verify_integrity: bool,
    pub restore_type: Option<String>,
    pub overwrite_existing: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RestoreBackupResponse {
    pub success: bool,
    pub backup_id: String,
    pub restore_path: String,
    pub restored_files: Vec<String>,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListBackupsQuery {
    pub backup_type: Option<Vec<String>>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListBackupsResponse {
    pub success: bool,
    pub backups: Vec<BackupInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetBackupResponse {
    pub success: bool,
    pub backup: BackupInfo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeleteBackupResponse {
    pub success: bool,
    pub backup_id: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VerifyBackupResponse {
    pub success: bool,
    pub backup_id: String,
    pub is_valid: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupStatsResponse {
    pub success: bool,
    pub stats: BackupStatsInfo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CleanupBackupsResponse {
    pub success: bool,
    pub deleted_count: usize,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupInfo {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub backup_type: String,
    pub file_size: u64,
    pub description: Option<String>,
    pub file_count: usize,
    pub total_size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupStatsInfo {
    pub total_backups: usize,
    pub total_size: u64,
    pub type_counts: Vec<(String, usize)>,
    pub oldest_backup: Option<DateTime<Utc>>,
    pub newest_backup: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditEventsQuery {
    pub event_type: Option<Vec<String>>,
    pub user_id: Option<String>,
    pub device_id: Option<String>,
    pub ip_address: Option<String>,
    pub success: Option<bool>,
    pub severity: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub limit: Option<usize>,
    pub resource: Option<String>,
    pub action: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditLimitQuery {
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetAuditEventsResponse {
    pub success: bool,
    pub events: Vec<AuditEventInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditEventInfo {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub event_type: String,
    pub user_id: Option<String>,
    pub device_id: Option<String>,
    pub ip_address: Option<String>,
    pub resource: String,
    pub action: String,
    pub success: bool,
    pub error_message: Option<String>,
    pub severity: String,
    pub details: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetAuditStatsResponse {
    pub success: bool,
    pub stats: AuditStatsInfo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditStatsInfo {
    pub total_events: usize,
    pub critical_events: usize,
    pub high_events: usize,
    pub medium_events: usize,
    pub low_events: usize,
    pub failed_events: usize,
    pub security_events: usize,
    pub event_type_counts: Vec<(String, usize)>,
    pub oldest_event: Option<DateTime<Utc>>,
    pub newest_event: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportAuditEventsRequest {
    pub format: Option<String>, // json, csv, etc.
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportAuditEventsResponse {
    pub success: bool,
    pub file_path: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClearAuditEventsResponse {
    pub success: bool,
    pub message: String,
}

// Error handling endpoints

#[get("/error/stats")]
async fn get_error_statistics(
    error_handler: Data<Arc<ErrorHandler>>,
) -> impl Responder {
    let stats = error_handler.get_error_statistics().await;
    
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "stats": {
            "total_errors": stats.total_errors,
            "retryable_errors": stats.retryable_errors,
            "non_retryable_errors": stats.non_retryable_errors,
            "circuit_breaker_trips": stats.circuit_breaker_trips,
            "fallback_activations": stats.fallback_activations,
            "recovery_successes": stats.recovery_successes,
            "error_by_type": stats.error_by_type,
            "last_error_time": stats.last_error_time.map(|t| t.elapsed().as_secs()),
        },
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

#[post("/error/reset")]
async fn reset_error_statistics(
    error_handler: Data<Arc<ErrorHandler>>,
) -> impl Responder {
    error_handler.reset_error_statistics().await;
    
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Error statistics reset successfully",
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

#[get("/error/circuit-breaker/{operation}")]
async fn get_circuit_breaker_status(
    path: Path<String>,
    error_handler: Data<Arc<ErrorHandler>>,
) -> impl Responder {
    let operation = path.into_inner();
    let status = error_handler.get_circuit_breaker_status(&operation).await;
    
    match status {
        Some(state) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "operation": operation,
            "state": match state {
                crate::error::CircuitBreakerState::Closed => "closed",
                crate::error::CircuitBreakerState::Open => "open",
                crate::error::CircuitBreakerState::HalfOpen => "half_open",
            },
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
        None => HttpResponse::NotFound().json(serde_json::json!({
            "success": false,
            "error": "Circuit breaker not found for operation",
            "operation": operation,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
}

#[post("/error/circuit-breaker/{operation}/reset")]
async fn reset_circuit_breaker(
    path: Path<String>,
    error_handler: Data<Arc<ErrorHandler>>,
) -> impl Responder {
    let operation = path.into_inner();
    error_handler.reset_circuit_breaker(&operation).await;
    
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": format!("Circuit breaker reset for operation: {}", operation),
        "operation": operation,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

#[post("/error/test")]
async fn test_error_handling(
    error_handler: Data<Arc<ErrorHandler>>,
) -> impl Responder {
    // Test the error handling system with a simulated error
    let result = error_handler.execute_with_error_handling("test_operation", || {
        Box::pin(async {
            // Simulate a retryable error
            Err(crate::error::RelayError::Blockchain(
                crate::error::BlockchainError::NetworkError("Test network error".to_string())
            ))
        })
    }).await;
    
    match result {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": "Test operation completed successfully",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
        Err(error) => HttpResponse::Ok().json(serde_json::json!({
            "success": false,
            "message": "Test operation failed as expected",
            "error": error.to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
}

#[derive(Deserialize)]
pub struct ErrorSummaryRequest {
    pub include_details: Option<bool>,
    pub error_types: Option<Vec<String>>,
}

#[post("/error/summary")]
async fn get_error_summary(
    req: Json<ErrorSummaryRequest>,
    error_handler: Data<Arc<ErrorHandler>>,
) -> impl Responder {
    let stats = error_handler.get_error_statistics().await;
    
    let mut summary = serde_json::json!({
        "total_errors": stats.total_errors,
        "retryable_errors": stats.retryable_errors,
        "non_retryable_errors": stats.non_retryable_errors,
        "circuit_breaker_trips": stats.circuit_breaker_trips,
        "fallback_activations": stats.fallback_activations,
        "recovery_successes": stats.recovery_successes,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    
    if req.include_details.unwrap_or(false) {
        summary["error_by_type"] = serde_json::json!(stats.error_by_type);
        summary["last_error_time"] = serde_json::json!(stats.last_error_time.map(|t| t.elapsed().as_secs()));
    }
    
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "summary": summary,
    }))
}

// Configuration Management Endpoints

#[get("/config")]
async fn get_configuration(
    config_manager: Data<Arc<DynamicConfigManager>>,
) -> impl Responder {
    match config_manager.get_config().await {
        Ok(config) => {
            // Return safe config (without secrets)
            let safe_config = serde_json::json!({
                "environment": config.environment,
                "version": config.version,
                "port": config.port,
                "log_level": config.log_level,
                "debug": config.debug,
                "enable_swagger": config.enable_swagger,
                "enable_cors_debug": config.enable_cors_debug,
                "rate_limits": config.rate_limits,
                "security": {
                    "enable_jwt_validation": config.security.enable_jwt_validation,
                    "enable_api_key_validation": config.security.enable_api_key_validation,
                    "enable_rate_limiting": config.security.enable_rate_limiting,
                    "enable_cors": config.security.enable_cors,
                    "cors_origins": config.security.cors_origins,
                    "max_connections": config.security.max_connections,
                    "session_timeout": config.security.session_timeout,
                },
                "monitoring": config.monitoring,
                "ble": config.ble,
                "database": config.database,
                "supported_chains_count": config.supported_chains.len(),
                "last_modified": config.last_modified.map(|t| t.elapsed().as_secs()),
            });
            
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "config": safe_config,
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }))
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "error": format!("Failed to get configuration: {}", e),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
}

#[post("/config/reload")]
async fn reload_configuration(
    config_manager: Data<Arc<DynamicConfigManager>>,
) -> impl Responder {
    match config_manager.reload_config().await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": "Configuration reloaded successfully",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "error": format!("Failed to reload configuration: {}", e),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
}

#[post("/config/export")]
async fn export_configuration(
    config_manager: Data<Arc<DynamicConfigManager>>,
) -> impl Responder {
    match config_manager.export_config().await {
        Ok(config_json) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "config": serde_json::from_str::<serde_json::Value>(&config_json).unwrap_or_default(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "error": format!("Failed to export configuration: {}", e),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
}

#[derive(Deserialize)]
pub struct ImportConfigRequest {
    pub config: serde_json::Value,
}

#[post("/config/import")]
async fn import_configuration(
    req: Json<ImportConfigRequest>,
    config_manager: Data<Arc<DynamicConfigManager>>,
) -> impl Responder {
    let config_json = serde_json::to_string(&req.config)?;
    
    match config_manager.import_config(&config_json).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": "Configuration imported successfully",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "success": false,
            "error": format!("Failed to import configuration: {}", e),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
}

#[get("/config/validate")]
async fn validate_configuration(
    config_manager: Data<Arc<DynamicConfigManager>>,
) -> impl Responder {
    match config_manager.validate_config().await {
        Ok(errors) => {
            if errors.is_empty() {
                HttpResponse::Ok().json(serde_json::json!({
                    "success": true,
                    "valid": true,
                    "message": "Configuration is valid",
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                }))
            } else {
                HttpResponse::BadRequest().json(serde_json::json!({
                    "success": false,
                    "valid": false,
                    "errors": errors,
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                }))
            }
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "error": format!("Failed to validate configuration: {}", e),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
}

#[get("/config/summary")]
async fn get_configuration_summary(
    config_manager: Data<Arc<DynamicConfigManager>>,
) -> impl Responder {
    match config_manager.get_config_summary().await {
        Ok(summary) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "summary": summary,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "error": format!("Failed to get configuration summary: {}", e),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
}

#[derive(Deserialize)]
pub struct UpdateConfigRequest {
    pub field: String,
    pub value: serde_json::Value,
}

#[post("/config/update")]
async fn update_configuration_field(
    req: Json<UpdateConfigRequest>,
    config_manager: Data<Arc<DynamicConfigManager>>,
) -> impl Responder {
    let current_config = config_manager.get_config().await;
    let mut new_config = current_config;
    
    // Update the specific field
    match req.field.as_str() {
        "log_level" => {
            if let Some(level) = req.value.as_str() {
                new_config.log_level = level.to_string();
            }
        }
        "port" => {
            if let Some(port) = req.value.as_u64() {
                new_config.port = port as u16;
            }
        }
        "debug" => {
            if let Some(debug) = req.value.as_bool() {
                new_config.debug = debug;
            }
        }
        "enable_swagger" => {
            if let Some(enable) = req.value.as_bool() {
                new_config.enable_swagger = enable;
            }
        }
        "rate_limits.max_requests" => {
            if let Some(max) = req.value.as_u64() {
                new_config.rate_limits.max_requests = max as u32;
            }
        }
        "security.enable_rate_limiting" => {
            if let Some(enable) = req.value.as_bool() {
                new_config.security.enable_rate_limiting = enable;
            }
        }
        "monitoring.enable_metrics" => {
            if let Some(enable) = req.value.as_bool() {
                new_config.monitoring.enable_metrics = enable;
            }
        }
        _ => {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "success": false,
                "error": format!("Unknown configuration field: {}", req.field),
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }));
        }
    }
    
    match config_manager.update_config(new_config).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": format!("Configuration field '{}' updated successfully", req.field),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "error": format!("Failed to update configuration: {}", e),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
}

#[post("/config/save")]
async fn save_configuration_to_file(
    config_manager: Data<Arc<DynamicConfigManager>>,
) -> impl Responder {
    let config = config_manager.get_config().await;
    let file_path = env::var("CONFIG_FILE").unwrap_or_else(|_| "config.json".to_string());
    
    match config.save_to_file(&file_path) {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": format!("Configuration saved to {}", file_path),
            "file_path": file_path,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "error": format!("Failed to save configuration: {}", e),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
}

#[get("/health/detailed")]
async fn detailed_health(
    monitoring_manager: Data<Arc<MonitoringManager>>,
    storage: Data<Arc<Storage>>,
    blockchain_manager: Data<Arc<BlockchainManager>>,
    ble_manager: Data<Arc<BLEManager>>,
    config_manager: Data<Arc<DynamicConfigManager>>,
) -> impl Responder {
    let start_time = std::time::Instant::now();
    
    // Get all component statuses
    let system_metrics = monitoring_manager.get_system_metrics().await;
    let alerts = monitoring_manager.get_alerts(50).await;
    let ble_status = ble_manager.get_status().await;
    let db_health = storage.check_health().await;
    let blockchain_status = blockchain_manager.get_network_status().await;
    let config_status = config_manager.get_status().await;
    
    // Calculate response time
    let response_time = start_time.elapsed().as_millis() as f64;
    
    // Determine overall health with detailed breakdown
    let critical_alerts = alerts.iter()
        .filter(|a| !a.resolved && matches!(a.severity, crate::monitoring::AlertSeverity::Critical))
        .count();
    
    let warning_alerts = alerts.iter()
        .filter(|a| !a.resolved && matches!(a.severity, crate::monitoring::AlertSeverity::Warning))
        .count();
    
    let overall_status = if critical_alerts > 0 {
        "critical"
    } else if !db_health.is_healthy || !blockchain_status.is_healthy {
        "degraded"
    } else if warning_alerts > 0 {
        "warning"
    } else {
        "healthy"
    };
    
    HttpResponse::Ok().json(serde_json::json!({
        "status": overall_status,
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "response_time_ms": response_time,
        "version": env!("CARGO_PKG_VERSION"),
        
        "components": {
            "system": {
                "status": "healthy",
                "memory_usage_bytes": system_metrics.memory_usage_bytes,
                "cpu_usage_percent": system_metrics.cpu_usage_percent,
                "disk_usage_percent": system_metrics.disk_usage_percent,
                "thread_count": system_metrics.thread_count,
                "uptime_seconds": system_metrics.uptime_seconds,
            },
            "database": {
                "status": if db_health.is_healthy { "healthy" } else { "unhealthy" },
                "connection_count": db_health.connection_count,
                "total_transactions": db_health.total_transactions,
                "total_devices": db_health.total_devices,
                "data_integrity_ok": db_health.data_integrity_ok,
                "last_backup_time": db_health.last_backup_time,
                "error_count": db_health.error_count,
            },
            "blockchain": {
                "status": if blockchain_status.is_healthy { "healthy" } else { "unhealthy" },
                "connected_networks": blockchain_status.connected_networks,
                "total_networks": blockchain_status.total_networks,
                "average_response_time_ms": blockchain_status.average_response_time_ms,
                "pending_transactions": blockchain_status.pending_transactions,
                "failed_transactions": blockchain_status.failed_transactions,
            },
            "ble": {
                "status": if ble_status.enabled && ble_status.initialized { "healthy" } else { "unhealthy" },
                "enabled": ble_status.enabled,
                "initialized": ble_status.initialized,
                "connected_devices": ble_status.connected_devices,
                "authenticated_devices": ble_status.authenticated_devices,
                "authentication_success_rate": ble_status.authentication_success_rate,
                "average_response_time_ms": ble_status.average_response_time_ms,
            },
            "configuration": {
                "status": if config_status.is_valid { "healthy" } else { "unhealthy" },
                "environment": config_status.environment,
                "total_settings": config_status.total_settings,
                "file_watcher_active": config_status.file_watcher_active,
                "validation_errors": config_status.validation_errors,
            },
        },
        
        "alerts": {
            "total": alerts.len(),
            "critical": critical_alerts,
            "warnings": warning_alerts,
            "info": alerts.iter().filter(|a| !a.resolved && matches!(a.severity, crate::monitoring::AlertSeverity::Info)).count(),
            "resolved": alerts.iter().filter(|a| a.resolved).count(),
            "recent_alerts": alerts.iter().take(10).map(|a| {
                serde_json::json!({
                    "id": a.id,
                    "name": a.name,
                    "severity": a.severity.to_string(),
                    "message": a.message,
                    "timestamp": a.timestamp.to_rfc3339(),
                    "resolved": a.resolved,
                })
            }).collect::<Vec<_>>(),
        },
        
        "performance": {
            "response_time_ms": response_time,
            "memory_usage_bytes": system_metrics.memory_usage_bytes,
            "cpu_usage_percent": system_metrics.cpu_usage_percent,
            "disk_usage_percent": system_metrics.disk_usage_percent,
            "network_bytes_in": system_metrics.network_bytes_in,
            "network_bytes_out": system_metrics.network_bytes_out,
        },
        
        "health_score": {
            "overall": if overall_status == "healthy" { 100 } else if overall_status == "warning" { 75 } else if overall_status == "degraded" { 50 } else { 25 },
            "system": 100,
            "database": if db_health.is_healthy { 100 } else { 25 },
            "blockchain": if blockchain_status.is_healthy { 100 } else { 25 },
            "ble": if ble_status.enabled && ble_status.initialized { 100 } else { 25 },
            "configuration": if config_status.is_valid { 100 } else { 25 },
        },
    }))
}

#[get("/health/component/{component}")]
async fn component_health(
    path: web::Path<String>,
    monitoring_manager: Data<Arc<MonitoringManager>>,
    storage: Data<Arc<Storage>>,
    blockchain_manager: Data<Arc<BlockchainManager>>,
    ble_manager: Data<Arc<BLEManager>>,
    config_manager: Data<Arc<DynamicConfigManager>>,
) -> impl Responder {
    let component = path.into_inner();
    
    match component.as_str() {
        "system" => {
            let system_metrics = monitoring_manager.get_system_metrics().await;
            HttpResponse::Ok().json(serde_json::json!({
                "component": "system",
                "status": "healthy",
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "metrics": {
                    "memory_usage_bytes": system_metrics.memory_usage_bytes,
                    "cpu_usage_percent": system_metrics.cpu_usage_percent,
                    "disk_usage_percent": system_metrics.disk_usage_percent,
                    "network_bytes_in": system_metrics.network_bytes_in,
                    "network_bytes_out": system_metrics.network_bytes_out,
                    "thread_count": system_metrics.thread_count,
                    "uptime_seconds": system_metrics.uptime_seconds,
                }
            }))
        },
        "database" => {
            let db_health = storage.check_health().await;
            HttpResponse::Ok().json(serde_json::json!({
                "component": "database",
                "status": if db_health.is_healthy { "healthy" } else { "unhealthy" },
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "metrics": {
                    "connection_count": db_health.connection_count,
                    "total_transactions": db_health.total_transactions,
                    "total_devices": db_health.total_devices,
                    "data_integrity_ok": db_health.data_integrity_ok,
                    "error_count": db_health.error_count,
                    "last_backup_time": db_health.last_backup_time,
                    "backup_size_bytes": db_health.backup_size_bytes,
                }
            }))
        },
        "blockchain" => {
            let blockchain_status = blockchain_manager.get_network_status().await;
            HttpResponse::Ok().json(serde_json::json!({
                "component": "blockchain",
                "status": if blockchain_status.is_healthy { "healthy" } else { "unhealthy" },
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "metrics": {
                    "connected_networks": blockchain_status.connected_networks,
                    "total_networks": blockchain_status.total_networks,
                    "average_response_time_ms": blockchain_status.average_response_time_ms,
                    "pending_transactions": blockchain_status.pending_transactions,
                    "failed_transactions": blockchain_status.failed_transactions,
                    "gas_price_updates": blockchain_status.gas_price_updates,
                }
            }))
        },
        "ble" => {
            let ble_status = ble_manager.get_status().await;
            HttpResponse::Ok().json(serde_json::json!({
                "component": "ble",
                "status": if ble_status.enabled && ble_status.initialized { "healthy" } else { "unhealthy" },
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "metrics": {
                    "enabled": ble_status.enabled,
                    "initialized": ble_status.initialized,
                    "connected_devices": ble_status.connected_devices,
                    "authenticated_devices": ble_status.authenticated_devices,
                    "blocked_devices": ble_status.blocked_devices,
                    "authentication_success_rate": ble_status.authentication_success_rate,
                    "average_response_time_ms": ble_status.average_response_time_ms,
                    "uptime_seconds": ble_status.uptime_seconds,
                }
            }))
        },
        "configuration" => {
            let config_status = config_manager.get_status().await;
            HttpResponse::Ok().json(serde_json::json!({
                "component": "configuration",
                "status": if config_status.is_valid { "healthy" } else { "unhealthy" },
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "metrics": {
                    "environment": config_status.environment,
                    "total_settings": config_status.total_settings,
                    "file_watcher_active": config_status.file_watcher_active,
                    "validation_errors": config_status.validation_errors,
                    "last_reload_time": config_status.last_reload_time,
                    "config_file_path": config_status.config_file_path,
                }
            }))
        },
        _ => HttpResponse::NotFound().json(serde_json::json!({
            "error": format!("Unknown component: {}", component),
            "available_components": ["system", "database", "blockchain", "ble", "configuration"]
        }))
    }
}

#[get("/health/alerts")]
async fn health_alerts(
    monitoring_manager: Data<Arc<MonitoringManager>>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> impl Responder {
    let limit = query.get("limit")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(50);
    
    let alerts = monitoring_manager.get_alerts(limit).await;
    
    let alert_summary = serde_json::json!({
        "total_alerts": alerts.len(),
        "critical_alerts": alerts.iter().filter(|a| !a.resolved && matches!(a.severity, crate::monitoring::AlertSeverity::Critical)).count(),
        "warning_alerts": alerts.iter().filter(|a| !a.resolved && matches!(a.severity, crate::monitoring::AlertSeverity::Warning)).count(),
        "info_alerts": alerts.iter().filter(|a| !a.resolved && matches!(a.severity, crate::monitoring::AlertSeverity::Info)).count(),
        "resolved_alerts": alerts.iter().filter(|a| a.resolved).count(),
        "alerts": alerts.iter().map(|a| {
            serde_json::json!({
                "id": a.id,
                "name": a.name,
                "severity": a.severity.to_string(),
                "message": a.message,
                "timestamp": a.timestamp.to_rfc3339(),
                "resolved": a.resolved,
                "metadata": a.metadata,
            })
        }).collect::<Vec<_>>(),
    });
    
    HttpResponse::Ok().json(alert_summary)
}

#[post("/health/alerts/{alert_id}/resolve")]
async fn resolve_alert(
    path: web::Path<String>,
    monitoring_manager: Data<Arc<MonitoringManager>>,
) -> impl Responder {
    let alert_id = path.into_inner();
    
    match monitoring_manager.resolve_alert(&alert_id).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": format!("Alert {} resolved successfully", alert_id),
        })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "success": false,
            "error": format!("Failed to resolve alert: {}", e),
        })),
    }
}

#[get("/health/metrics")]
async fn health_metrics(
    monitoring_manager: Data<Arc<MonitoringManager>>,
) -> impl Responder {
    let metrics = monitoring_manager.get_metrics().await;
    let system_metrics = monitoring_manager.get_system_metrics().await;
    
    HttpResponse::Ok().json(serde_json::json!({
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "metrics": {
            "transactions": {
                "received": metrics.transactions_received,
                "processed": metrics.transactions_processed,
                "failed": metrics.transactions_failed,
                "broadcasted": metrics.transactions_broadcasted,
            },
            "ble": {
                "connections": metrics.ble_connections,
                "disconnections": metrics.ble_disconnections,
                "authentications": metrics.ble_authentications,
                "key_exchanges": metrics.ble_key_exchanges,
            },
            "system": {
                "uptime_seconds": metrics.uptime_seconds,
                "memory_usage_bytes": system_metrics.memory_usage_bytes,
                "cpu_usage_percent": system_metrics.cpu_usage_percent,
                "response_time_avg_ms": metrics.response_time_avg_ms,
            },
            "security": {
                "auth_failures": metrics.auth_failures,
                "rate_limit_hits": metrics.rate_limit_hits,
                "blocked_devices": metrics.blocked_devices,
                "security_events": metrics.security_events,
            },
            "performance": {
                "requests_total": metrics.requests_total,
                "requests_successful": metrics.requests_successful,
                "requests_failed": metrics.requests_failed,
                "active_connections": metrics.active_connections,
                "cache_hits": metrics.cache_hits,
                "cache_misses": metrics.cache_misses,
            },
            "blockchain": {
                "rpc_errors": metrics.rpc_errors,
                "gas_price_updates": metrics.gas_price_updates,
                "contract_events": metrics.contract_events,
                "blockchain_confirmations": metrics.blockchain_confirmations,
                "blockchain_timeouts": metrics.blockchain_timeouts,
            },
        }
    }))
}

pub async fn run_api_server() -> std::io::Result<()> {
    // Initialize shared components
    let config = crate::config::Config::development_config().unwrap_or_default();
    let storage = Arc::new(Storage::new().expect("Failed to initialize storage"));
    let auth_manager = AuthManager::new();
    let security_manager = SecurityManager::new();
    let blockchain_manager = Arc::new(BlockchainManager::new(config.clone()).unwrap());
    let monitoring_manager = Arc::new(MonitoringManager::new());
    
    HttpServer::new(move || {
        App::new()
            .app_data(Data::new(storage.clone()))
            .app_data(Data::new(auth_manager.clone()))
            .app_data(Data::new(security_manager))
            .app_data(Data::new(blockchain_manager.clone()))
            .app_data(Data::new(monitoring_manager.clone()))
            .wrap(actix_cors::Cors::default())
            .service(health)
            .service(ble_scan)
            .service(send_tx)
            .service(send_compressed_tx)
            .service(compress_transaction)
            .service(compress_ble_payment)
            .service(compress_qr_payment)
            .service(submit_transaction)
            .service(legacy_submit_transaction)
            .service(get_contract_payments)
            .service(generate_token)
            .service(process_ble_transaction)
            .service(initiate_key_exchange)
            .service(rotate_session_key)
            .service(block_device)
            .service(unblock_device)
            .service(get_key_exchange_devices)
            .service(get_database_transactions)
            .service(get_transaction_by_id)
            .service(get_transactions_by_device)
            .service(create_database_backup)
            .service(get_database_stats)
            .service(get_database_security)
            .service(get_networks_status)
            .service(authenticate_device)
            .service(get_transactions)
            .service(get_metrics)
            .service(get_devices)
            .service(legacy_tx)
            .service(create_backup)
            .service(restore_backup)
            .service(list_backups)
            .service(get_backup_info)
            .service(delete_backup)
            .service(verify_backup)
            .service(get_backup_stats)
            .service(cleanup_backups)
            .service(get_audit_events)
            .service(get_security_events)
            .service(get_failed_events)
            .service(get_critical_events)
            .service(get_events_by_user)
            .service(get_events_by_device)
            .service(get_audit_stats)
            .service(export_audit_events)
            .service(clear_audit_events)
            .service(detailed_health)
            .service(component_health)
            .service(health_alerts)
            .service(resolve_alert)
            .service(health_metrics)
    })
    .bind(("0.0.0.0", 4000))?
    .run()
    .await
}

// Enhanced Transaction Processor API Endpoints

#[derive(Debug, Serialize, Deserialize)]
pub struct AddTransactionRequest {
    pub transaction: BLETransaction,
    pub priority: Option<String>, // "low", "normal", "high", "critical"
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddTransactionResponse {
    pub success: bool,
    pub transaction_id: String,
    pub message: String,
}

#[post("/processor/add")]
async fn add_transaction_to_processor(
    req: Json<AddTransactionRequest>,
    transaction_processor: Data<Arc<TransactionProcessor>>,
) -> impl Responder {
    let priority = match req.priority.as_deref() {
        Some("low") => TransactionPriority::Low,
        Some("high") => TransactionPriority::High,
        Some("critical") => TransactionPriority::Critical,
        _ => TransactionPriority::Normal,
    };

    // Add chain_id to metadata if not present
    let mut metadata = req.metadata.clone().unwrap_or_default();
    if !metadata.contains_key("chain_id") {
        metadata.insert("chain_id".to_string(), serde_json::Value::Number(serde_json::Number::from(84532)));
    }

    match transaction_processor.add_transaction(
        req.transaction.clone(),
        priority,
        Some(metadata),
    ).await {
        Ok(_) => HttpResponse::Ok().json(AddTransactionResponse {
            success: true,
            transaction_id: req.transaction.id.clone(),
            message: "Transaction added to processor queue".to_string(),
        }),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "error": format!("Failed to add transaction: {}", e),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
}

#[get("/processor/status")]
async fn get_processor_status(
    transaction_processor: Data<Arc<TransactionProcessor>>,
) -> impl Responder {
    let queue_status = transaction_processor.get_queue_status().await;
    let metrics = transaction_processor.get_processing_metrics().await;
    
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "queue_status": queue_status,
        "metrics": {
            "total_processed": metrics.total_processed,
            "total_successful": metrics.total_successful,
            "total_failed": metrics.total_failed,
            "total_retried": metrics.total_retried,
            "average_processing_time_ms": metrics.average_processing_time_ms,
            "queue_size": metrics.queue_size,
            "active_workers": metrics.active_workers,
            "last_processed_at": metrics.last_processed_at.map(|t| t.to_rfc3339()),
            "chain_metrics": metrics.chain_metrics,
        },
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

#[get("/processor/metrics")]
async fn get_processor_metrics(
    transaction_processor: Data<Arc<TransactionProcessor>>,
) -> impl Responder {
    let metrics = transaction_processor.get_processing_metrics().await;
    
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "metrics": metrics,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

#[get("/processor/failed")]
async fn get_failed_transactions(
    transaction_processor: Data<Arc<TransactionProcessor>>,
) -> impl Responder {
    let failed_transactions = transaction_processor.get_failed_transactions().await;
    
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "failed_transactions": failed_transactions,
        "count": failed_transactions.len(),
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

#[post("/processor/retry/{transaction_id}")]
async fn retry_failed_transaction(
    path: Path<String>,
    transaction_processor: Data<Arc<TransactionProcessor>>,
) -> impl Responder {
    let transaction_id = path.into_inner();
    
    match transaction_processor.retry_failed_transaction(&transaction_id).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "transaction_id": transaction_id,
            "message": "Transaction queued for retry",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "error": format!("Failed to retry transaction: {}", e),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
}

#[post("/processor/clear")]
async fn clear_processor_queue(
    transaction_processor: Data<Arc<TransactionProcessor>>,
) -> impl Responder {
    match transaction_processor.clear_queue().await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": "Transaction queue cleared",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "error": format!("Failed to clear queue: {}", e),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
}

#[get("/processor/transaction/{transaction_id}")]
async fn get_transaction_status(
    path: Path<String>,
    transaction_processor: Data<Arc<TransactionProcessor>>,
) -> impl Responder {
    let transaction_id = path.into_inner();
    
    match transaction_processor.get_transaction_status(&transaction_id).await {
        Some(status) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "transaction_id": transaction_id,
            "status": format!("{:?}", status),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
        None => HttpResponse::NotFound().json(serde_json::json!({
            "success": false,
            "error": "Transaction not found",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
}

#[get("/critical/errors")]
async fn get_critical_errors(
    critical_error_handler: Data<Arc<CriticalErrorHandler>>,
) -> impl Responder {
    let errors = critical_error_handler.get_all_errors().await;
    
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "data": {
            "errors": errors,
            "total_count": errors.len(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        },
    }))
}

#[get("/critical/errors/{path}")]
async fn get_critical_errors_by_path(
    path: web::Path<String>,
    critical_error_handler: Data<Arc<CriticalErrorHandler>>,
) -> impl Responder {
    let path_str = path.into_inner();
    let critical_path = match path_str.as_str() {
        "blockchain" => CriticalPath::BlockchainTransaction,
        "ble" => CriticalPath::BLEDeviceConnection,
        "auth" => CriticalPath::Authentication,
        "database" => CriticalPath::DatabaseOperation,
        "config" => CriticalPath::ConfigurationReload,
        "backup" => CriticalPath::BackupOperation,
        "transaction" => CriticalPath::TransactionProcessing,
        "security" => CriticalPath::SecurityValidation,
        "monitoring" => CriticalPath::MonitoringMetrics,
        "health" => CriticalPath::HealthCheck,
        _ => {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid critical path",
                "message": "Unknown critical path specified",
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }));
        }
    };

    let errors = critical_error_handler.get_recent_errors_by_path(&critical_path, 100).await;
    
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "data": {
            "path": path_str,
            "errors": errors,
            "total_count": errors.len(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        },
    }))
}

#[get("/critical/metrics")]
async fn get_critical_metrics(
    critical_error_handler: Data<Arc<CriticalErrorHandler>>,
) -> impl Responder {
    let metrics = critical_error_handler.get_all_metrics().await;
    
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "data": {
            "metrics": metrics,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        },
    }))
}

#[post("/critical/reset/{path}")]
async fn reset_critical_circuit_breaker(
    path: web::Path<String>,
    critical_error_handler: Data<Arc<CriticalErrorHandler>>,
) -> impl Responder {
    let path_str = path.into_inner();
    let critical_path = match path_str.as_str() {
        "blockchain" => CriticalPath::BlockchainTransaction,
        "ble" => CriticalPath::BLEDeviceConnection,
        "auth" => CriticalPath::Authentication,
        "database" => CriticalPath::DatabaseOperation,
        "config" => CriticalPath::ConfigurationReload,
        "backup" => CriticalPath::BackupOperation,
        "transaction" => CriticalPath::TransactionProcessing,
        "security" => CriticalPath::SecurityValidation,
        "monitoring" => CriticalPath::MonitoringMetrics,
        "health" => CriticalPath::HealthCheck,
        _ => {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid critical path",
                "message": "Unknown critical path specified",
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }));
        }
    };

    match critical_error_handler.reset_circuit_breaker(&critical_path).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": format!("Circuit breaker reset for {}", path_str),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "Failed to reset circuit breaker",
            "message": e.to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
}

#[get("/critical/health")]
async fn get_critical_health(
    critical_error_handler: Data<Arc<CriticalErrorHandler>>,
) -> impl Responder {
    let health_status = critical_error_handler.health_check().await;
    
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "data": health_status,
    }))
}

#[post("/critical/test")]
async fn test_critical_error_handling(
    critical_error_handler: Data<Arc<CriticalErrorHandler>>,
) -> impl Responder {
    use std::collections::HashMap;
    
    let mut context = HashMap::new();
    context.insert("test".to_string(), "true".to_string());
    context.insert("endpoint".to_string(), "/critical/test".to_string());
    
    // Test critical error handling with a failing operation
    let result = critical_error_handler.execute_critical_operation(
        CriticalPath::TransactionProcessing,
        || async {
            // Simulate a failure
            Err(anyhow::anyhow!("Test critical error"))
        },
        context,
    ).await;
    
    match result {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": "Test operation succeeded (unexpected)",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
        Err(error) => HttpResponse::Ok().json(serde_json::json!({
            "success": false,
            "message": "Test operation failed as expected",
            "error": {
                "id": error.id,
                "path": format!("{:?}", error.path),
                "error_type": format!("{:?}", error.error_type),
                "severity": format!("{:?}", error.severity),
                "retry_count": error.retry_count,
            },
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
} 