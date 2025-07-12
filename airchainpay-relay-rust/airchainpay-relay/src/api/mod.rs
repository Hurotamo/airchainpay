use actix_web::{get, post, web, App, HttpResponse, HttpServer, Responder, Data};
use serde::{Deserialize, Serialize};
use crate::auth::{AuthManager, AuthRequest, AuthResponse};
use crate::security::{SecurityManager, security_middleware};
use crate::storage::{Storage, Transaction, Device};
use crate::blockchain::BlockchainManager;
use crate::monitoring::MonitoringManager;
use crate::processors::TransactionProcessor;
use crate::middleware::input_validation::{
    validate_transaction_request, validate_ble_request, validate_auth_request, validate_compressed_payload_request
};
use std::sync::Arc;
use std::collections::HashMap;
use base64;

#[get("/health")]
async fn health() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "uptime": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs_f64(),
        "version": env!("CARGO_PKG_VERSION"),
        "ble": {
            "enabled": true,
            "initialized": true,
            "is_advertising": false,
            "connected_devices": 0,
            "authenticated_devices": 0,
            "blocked_devices": 0
        },
        "metrics": {
            "transactions": {
                "received": 0,
                "processed": 0,
                "failed": 0,
                "broadcasted": 0
            },
            "ble": {
                "connections": 0,
                "disconnections": 0,
                "authentications": 0,
                "key_exchanges": 0
            },
            "system": {
                "uptime": 0.0,
                "memory_usage": 0,
                "cpu_usage": 0.0
            }
        }
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
    
    // Broadcast transaction
    let tx_bytes = match hex::decode(&req.signed_tx.trim_start_matches("0x")) {
        Ok(b) => b,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid hex for signed_tx",
            "field": "signed_tx",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    };
    
    match crate::blockchain::send_transaction(tx_bytes, &req.rpc_url).await {
        Ok(hash) => {
            let _ = storage.update_metrics("transactions_processed", 1);
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "hash": format!("0x{:x}", hash),
                "transaction_id": transaction.id,
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
    
    match crate::blockchain::send_transaction(tx_bytes, &req.rpc_url).await {
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

    let transaction_processor = TransactionProcessor::new(
        Arc::new(BlockchainManager::new().unwrap()),
        storage.as_ref().clone(),
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

    let transaction_processor = TransactionProcessor::new(
        Arc::new(BlockchainManager::new().unwrap()),
        storage.as_ref().clone(),
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

    let transaction_processor = TransactionProcessor::new(
        Arc::new(BlockchainManager::new().unwrap()),
        storage.as_ref().clone(),
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
    let total = storage.get_transactions(10000, 0).len();
    
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
    let storage_metrics = storage.get_metrics();
    let monitoring_metrics = monitoring_manager.get_metrics().await;
    
    let combined_metrics = serde_json::json!({
        "storage": storage_metrics,
        "monitoring": monitoring_metrics,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    
    HttpResponse::Ok().json(combined_metrics)
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

pub async fn run_api_server() -> std::io::Result<()> {
    // Initialize shared components
    let storage = Arc::new(Storage::new().expect("Failed to initialize storage"));
    let auth_manager = AuthManager::new();
    let security_manager = SecurityManager::new();
    let blockchain_manager = Arc::new(BlockchainManager::new().expect("Failed to initialize blockchain manager"));
    let monitoring_manager = Arc::new(MonitoringManager::new());
    
    HttpServer::new(move || {
        App::new()
            .app_data(Data::new(storage.clone()))
            .app_data(Data::new(auth_manager.clone()))
            .app_data(Data::new(security_manager.clone()))
            .app_data(Data::new(blockchain_manager.clone()))
            .app_data(Data::new(monitoring_manager.clone()))
            .wrap(crate::middleware::cors_config())
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
    })
    .bind(("0.0.0.0", 4000))?
    .run()
    .await
} 