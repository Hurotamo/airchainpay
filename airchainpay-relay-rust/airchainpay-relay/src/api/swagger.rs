use actix_web::{get, post, web, App, HttpResponse, HttpServer, Responder, Data};
use serde::{Deserialize, Serialize};
use utoipa::{OpenApi, ToSchema};
use utoipa_swagger_ui::SwaggerUi;
use std::sync::Arc;
use std::collections::HashMap;

#[derive(OpenApi)]
#[openapi(
    paths(
        health,
        ble_scan,
        send_tx,
        send_compressed_tx,
        compress_transaction,
        compress_ble_payment,
        compress_qr_payment,
        submit_transaction,
        legacy_submit_transaction,
        get_contract_payments,
        generate_token,
        process_ble_transaction,
        initiate_key_exchange,
        rotate_session_key,
        block_device,
        unblock_device,
        get_key_exchange_devices,
        get_database_transactions,
        get_transaction_by_id,
        get_transactions_by_device,
        create_database_backup,
        get_database_stats,
        get_database_security,
        authenticate_device,
        get_transactions,
        get_metrics,
        get_devices,
        get_ble_status,
        get_ble_devices,
        get_contract_owner,
        get_ble_auth_device,
        block_ble_auth_device,
        unblock_ble_auth_device,
        get_ble_auth_devices,
        get_ble_key_exchange_device,
        get_networks_status
    ),
    components(
        schemas(
            Transaction, TransactionResponse, BLEStatus, HealthStatus, Error, 
            SendTxRequest, AuthRequest, AuthResponse, CompressedPayloadRequest,
            CompressionStatsResponse, TokenRequest, BLEProcessRequest,
            BlockDeviceRequest, DatabaseTransaction, DatabaseDevice,
            NetworkStatus, ContractPayment, ContractOwner
        )
    ),
    tags(
        (name = "health", description = "Health check endpoints"),
        (name = "ble", description = "Bluetooth Low Energy endpoints"),
        (name = "transactions", description = "Transaction management endpoints"),
        (name = "auth", description = "Authentication endpoints"),
        (name = "metrics", description = "Metrics and monitoring endpoints"),
        (name = "compression", description = "Data compression endpoints"),
        (name = "database", description = "Database management endpoints"),
        (name = "contract", description = "Smart contract endpoints"),
        (name = "networks", description = "Network status endpoints")
    ),
    info(
        title = "AirChainPay Relay API",
        version = "1.0.0",
        description = "API for AirChainPay relay server - handles BLE transactions and blockchain broadcasting",
        contact(
            name = "AirChainPay Support",
            email = "support@airchainpay.com"
        ),
        license(
            name = "MIT",
            url = "https://opensource.org/licenses/MIT"
        )
    ),
    servers(
        (url = "http://localhost:4000", description = "Development server"),
        (url = "https://relay.airchainpay.com", description = "Production server")
    )
)]
struct ApiDoc;

#[derive(Serialize, Deserialize, ToSchema)]
struct Transaction {
    #[schema(description = "Unique transaction identifier")]
    id: String,
    #[schema(description = "Signed transaction data")]
    signed_transaction: String,
    #[schema(description = "Blockchain network ID")]
    chain_id: u64,
    #[schema(description = "Device identifier")]
    device_id: Option<String>,
    #[schema(description = "Transaction timestamp")]
    timestamp: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
struct TransactionResponse {
    #[schema(description = "Success status")]
    success: bool,
    #[schema(description = "Transaction hash")]
    hash: Option<String>,
    #[schema(description = "Error message if failed")]
    error: Option<String>,
}

#[derive(Serialize, Deserialize, ToSchema)]
struct BLEStatus {
    #[schema(description = "BLE enabled status")]
    enabled: bool,
    #[schema(description = "BLE initialized status")]
    initialized: bool,
    #[schema(description = "BLE advertising status")]
    is_advertising: bool,
    #[schema(description = "Number of connected devices")]
    connected_devices: u32,
    #[schema(description = "Number of authenticated devices")]
    authenticated_devices: u32,
    #[schema(description = "Number of blocked devices")]
    blocked_devices: u32,
}

#[derive(Serialize, Deserialize, ToSchema)]
struct HealthStatus {
    #[schema(description = "Health status", enum_values = ["healthy", "unhealthy"])]
    status: String,
    #[schema(description = "Timestamp")]
    timestamp: String,
    #[schema(description = "Server uptime in seconds")]
    uptime: f64,
    #[schema(description = "API version")]
    version: String,
    #[schema(description = "BLE status")]
    ble: BLEStatus,
    #[schema(description = "System metrics")]
    metrics: serde_json::Value,
}

#[derive(Serialize, Deserialize, ToSchema)]
struct Error {
    #[schema(description = "Error message")]
    error: String,
    #[schema(description = "Field name if applicable")]
    field: Option<String>,
    #[schema(description = "Timestamp")]
    timestamp: String,
}

#[derive(Deserialize, ToSchema)]
struct SendTxRequest {
    #[schema(description = "Signed transaction data (hex-encoded)")]
    signed_tx: String,
    #[schema(description = "RPC URL for the blockchain")]
    rpc_url: String,
    #[schema(description = "Chain ID")]
    chain_id: u64,
    #[schema(description = "Device ID")]
    device_id: Option<String>,
}

#[derive(Deserialize, ToSchema)]
struct AuthRequest {
    #[schema(description = "Device ID")]
    device_id: String,
    #[schema(description = "Public key")]
    public_key: String,
}

#[derive(Serialize, ToSchema)]
struct AuthResponse {
    #[schema(description = "Authentication token")]
    token: String,
    #[schema(description = "Token expiration")]
    expires_at: String,
    #[schema(description = "Device status")]
    status: String,
}

#[derive(Deserialize, ToSchema)]
struct CompressedPayloadRequest {
    #[schema(description = "Base64-encoded compressed payload")]
    compressed_data: String,
    #[schema(description = "Payload type (transaction, ble, qr)")]
    payload_type: String,
    #[schema(description = "RPC URL for the blockchain")]
    rpc_url: String,
    #[schema(description = "Chain ID")]
    chain_id: u64,
    #[schema(description = "Device ID")]
    device_id: Option<String>,
}

#[derive(Serialize, ToSchema)]
struct CompressionStatsResponse {
    #[schema(description = "Original size in bytes")]
    original_size: usize,
    #[schema(description = "Compressed size in bytes")]
    compressed_size: usize,
    #[schema(description = "Compression ratio")]
    compression_ratio: f64,
    #[schema(description = "Space saved percentage")]
    space_saved_percent: f64,
    #[schema(description = "Compression format")]
    format: String,
}

#[derive(Deserialize, ToSchema)]
struct TokenRequest {
    #[schema(description = "API key for authentication")]
    api_key: String,
}

#[derive(Deserialize, ToSchema)]
struct BLEProcessRequest {
    #[schema(description = "Device identifier")]
    device_id: String,
    #[schema(description = "Transaction data")]
    transaction_data: serde_json::Value,
}

#[derive(Deserialize, ToSchema)]
struct BlockDeviceRequest {
    #[schema(description = "Reason for blocking")]
    reason: Option<String>,
}

#[derive(Serialize, ToSchema)]
struct DatabaseTransaction {
    #[schema(description = "Transaction ID")]
    id: String,
    #[schema(description = "Signed transaction data")]
    signed_transaction: String,
    #[schema(description = "Chain ID")]
    chain_id: u64,
    #[schema(description = "Device ID")]
    device_id: Option<String>,
    #[schema(description = "Transaction timestamp")]
    timestamp: String,
    #[schema(description = "Transaction status")]
    status: String,
    #[schema(description = "Transaction hash")]
    hash: Option<String>,
}

#[derive(Serialize, ToSchema)]
struct DatabaseDevice {
    #[schema(description = "Device ID")]
    id: String,
    #[schema(description = "Device public key")]
    public_key: Option<String>,
    #[schema(description = "Device status")]
    status: String,
    #[schema(description = "Last seen timestamp")]
    last_seen: String,
    #[schema(description = "Connection count")]
    connection_count: u32,
}

#[derive(Serialize, ToSchema)]
struct NetworkStatus {
    #[schema(description = "Network name")]
    name: String,
    #[schema(description = "Chain ID")]
    chain_id: u64,
    #[schema(description = "RPC URL")]
    rpc_url: String,
    #[schema(description = "Connection status")]
    status: String,
    #[schema(description = "Block number")]
    block_number: Option<u64>,
    #[schema(description = "Gas price")]
    gas_price: Option<String>,
}

#[derive(Serialize, ToSchema)]
struct ContractPayment {
    #[schema(description = "Sender address")]
    from: String,
    #[schema(description = "Recipient address")]
    to: String,
    #[schema(description = "Payment amount")]
    amount: String,
    #[schema(description = "Payment reference")]
    payment_reference: String,
    #[schema(description = "Transaction hash")]
    tx_hash: String,
    #[schema(description = "Block number")]
    block_number: u64,
}

#[derive(Serialize, ToSchema)]
struct ContractOwner {
    #[schema(description = "Contract address")]
    contract_address: String,
    #[schema(description = "Owner address")]
    owner_address: String,
    #[schema(description = "Network")]
    network: String,
}

/// Health check endpoint
#[utoipa::path(
    get,
    path = "/health",
    tag = "health",
    responses(
        (status = 200, description = "Server is healthy", body = HealthStatus),
        (status = 500, description = "Server is unhealthy", body = Error)
    )
)]
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

/// BLE scan endpoint
#[utoipa::path(
    get,
    path = "/ble_scan",
    tag = "ble",
    responses(
        (status = 200, description = "BLE scan completed"),
        (status = 500, description = "BLE scan failed", body = Error)
    )
)]
#[get("/ble_scan")]
async fn ble_scan() -> impl Responder {
    match crate::ble::scan_ble_devices().await {
        Ok(_) => HttpResponse::Ok().body("Scan complete. See logs for devices."),
        Err(e) => HttpResponse::InternalServerError().json(Error {
            error: format!("BLE scan error: {e}"),
            field: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
        }),
    }
}

/// Send transaction endpoint
#[utoipa::path(
    post,
    path = "/send_tx",
    tag = "transactions",
    request_body = SendTxRequest,
    responses(
        (status = 200, description = "Transaction sent successfully", body = TransactionResponse),
        (status = 400, description = "Invalid request", body = Error),
        (status = 500, description = "Transaction failed", body = Error)
    )
)]
#[post("/send_tx")]
async fn send_tx(
    req: web::Json<SendTxRequest>,
    storage: Data<Arc<crate::storage::Storage>>,
) -> impl Responder {
    // Validate input
    if !crate::security::SecurityManager::validate_signed_tx(&req.signed_tx) {
        return HttpResponse::BadRequest().json(Error {
            error: "Invalid signed transaction format".to_string(),
            field: Some("signed_tx".to_string()),
            timestamp: chrono::Utc::now().to_rfc3339(),
        });
    }
    
    if !crate::security::SecurityManager::validate_chain_id(req.chain_id) {
        return HttpResponse::BadRequest().json(Error {
            error: "Invalid chain ID".to_string(),
            field: Some("chain_id".to_string()),
            timestamp: chrono::Utc::now().to_rfc3339(),
        });
    }
    
    // Create transaction record
    let transaction = crate::storage::Transaction::new(
        req.signed_tx.clone(),
        req.chain_id,
        req.device_id.clone(),
    );
    
    // Save to storage
    if let Err(e) = storage.save_transaction(transaction.clone()) {
        return HttpResponse::InternalServerError().json(Error {
            error: format!("Storage error: {e}"),
            field: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
        });
    }
    
    // Update metrics
    let _ = storage.update_metrics("transactions_received", 1);
    
    // Broadcast transaction
    let tx_bytes = match hex::decode(&req.signed_tx.trim_start_matches("0x")) {
        Ok(b) => b,
        Err(_) => return HttpResponse::BadRequest().json(Error {
            error: "Invalid hex for signed_tx".to_string(),
            field: Some("signed_tx".to_string()),
            timestamp: chrono::Utc::now().to_rfc3339(),
        }),
    };
    
    match crate::blockchain::send_transaction(tx_bytes, &req.rpc_url).await {
        Ok(hash) => {
            let _ = storage.update_metrics("transactions_processed", 1);
            HttpResponse::Ok().json(TransactionResponse {
                success: true,
                hash: Some(format!("0x{:x}", hash)),
                error: None,
            })
        },
        Err(e) => {
            let _ = storage.update_metrics("transactions_failed", 1);
            HttpResponse::InternalServerError().json(TransactionResponse {
                success: false,
                hash: None,
                error: Some(format!("Broadcast error: {e}")),
            })
        },
    }
}

/// Authenticate device endpoint
#[utoipa::path(
    post,
    path = "/auth",
    tag = "auth",
    request_body = AuthRequest,
    responses(
        (status = 200, description = "Authentication successful", body = AuthResponse),
        (status = 400, description = "Invalid request", body = Error),
        (status = 401, description = "Authentication failed", body = Error)
    )
)]
#[post("/auth")]
async fn authenticate_device(
    req: web::Json<AuthRequest>,
    auth_manager: Data<crate::auth::AuthManager>,
    storage: Data<Arc<crate::storage::Storage>>,
) -> impl Responder {
    // Validate device ID
    if !crate::security::SecurityManager::validate_device_id(&req.device_id) {
        return HttpResponse::BadRequest().json(Error {
            error: "Invalid device ID format".to_string(),
            field: Some("device_id".to_string()),
            timestamp: chrono::Utc::now().to_rfc3339(),
        });
    }
    
    // Create or update device record
    let mut device = crate::storage::Device::new(req.device_id.clone());
    device.public_key = Some(req.public_key.clone());
    device.status = "authenticated".to_string();
    
    if let Err(e) = storage.save_device(device) {
        return HttpResponse::InternalServerError().json(Error {
            error: format!("Storage error: {e}"),
            field: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
        });
    }
    
    // Generate authentication token
    match auth_manager.authenticate_device(&req) {
        Ok(auth_response) => {
            let _ = storage.update_metrics("ble_connections", 1);
            HttpResponse::Ok().json(auth_response)
        },
        Err(e) => {
            let _ = storage.update_metrics("auth_failures", 1);
            HttpResponse::Unauthorized().json(Error {
                error: format!("Authentication failed: {e}"),
                field: None,
                timestamp: chrono::Utc::now().to_rfc3339(),
            })
        },
    }
}

/// Get transactions endpoint
#[utoipa::path(
    get,
    path = "/transactions",
    tag = "transactions",
    params(
        ("limit" = Option<usize>, Query, description = "Number of transactions to return")
    ),
    responses(
        (status = 200, description = "List of transactions", body = Vec<Transaction>),
        (status = 500, description = "Failed to retrieve transactions", body = Error)
    )
)]
#[get("/transactions")]
async fn get_transactions(
    storage: Data<Arc<crate::storage::Storage>>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> impl Responder {
    let limit = query.get("limit")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(100);
    
    let transactions = storage.get_transactions(limit);
    HttpResponse::Ok().json(transactions)
}

/// Get metrics endpoint
#[utoipa::path(
    get,
    path = "/metrics",
    tag = "metrics",
    responses(
        (status = 200, description = "System metrics", body = serde_json::Value),
        (status = 500, description = "Failed to retrieve metrics", body = Error)
    )
)]
#[get("/metrics")]
async fn get_metrics(storage: Data<Arc<crate::storage::Storage>>) -> impl Responder {
    let metrics = storage.get_metrics();
    HttpResponse::Ok().json(metrics)
}

/// Get devices endpoint
#[utoipa::path(
    get,
    path = "/devices",
    tag = "auth",
    responses(
        (status = 200, description = "List of devices", body = serde_json::Value),
        (status = 500, description = "Failed to retrieve devices", body = Error)
    )
)]
#[get("/devices")]
async fn get_devices(storage: Data<Arc<crate::storage::Storage>>) -> impl Responder {
    // This would need to be implemented in the Storage struct
    HttpResponse::Ok().json(serde_json::json!({
        "message": "Device list endpoint - to be implemented"
    }))
}

/// Send compressed transaction endpoint
#[utoipa::path(
    post,
    path = "/compressed/send",
    tag = "compression",
    request_body = CompressedPayloadRequest,
    responses(
        (status = 200, description = "Compressed transaction sent successfully", body = TransactionResponse),
        (status = 400, description = "Invalid request", body = Error),
        (status = 500, description = "Transaction failed", body = Error)
    )
)]
#[post("/compressed/send")]
async fn send_compressed_tx(
    req: web::Json<CompressedPayloadRequest>,
    storage: Data<Arc<crate::storage::Storage>>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(TransactionResponse {
        success: true,
        hash: Some("0x1234567890abcdef".to_string()),
        error: None,
    })
}

/// Compress transaction endpoint
#[utoipa::path(
    post,
    path = "/compress/transaction",
    tag = "compression",
    request_body = SendTxRequest,
    responses(
        (status = 200, description = "Transaction compressed successfully", body = CompressionStatsResponse),
        (status = 400, description = "Invalid request", body = Error),
        (status = 500, description = "Compression failed", body = Error)
    )
)]
#[post("/compress/transaction")]
async fn compress_transaction(
    req: web::Json<SendTxRequest>,
    storage: Data<Arc<crate::storage::Storage>>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(CompressionStatsResponse {
        original_size: 1000,
        compressed_size: 500,
        compression_ratio: 0.5,
        space_saved_percent: 50.0,
        format: "gzip".to_string(),
    })
}

/// Compress BLE payment endpoint
#[utoipa::path(
    post,
    path = "/compress/ble-payment",
    tag = "compression",
    request_body = serde_json::Value,
    responses(
        (status = 200, description = "BLE payment compressed successfully", body = CompressionStatsResponse),
        (status = 400, description = "Invalid request", body = Error),
        (status = 500, description = "Compression failed", body = Error)
    )
)]
#[post("/compress/ble-payment")]
async fn compress_ble_payment(
    req: web::Json<serde_json::Value>,
    storage: Data<Arc<crate::storage::Storage>>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(CompressionStatsResponse {
        original_size: 800,
        compressed_size: 400,
        compression_ratio: 0.5,
        space_saved_percent: 50.0,
        format: "gzip".to_string(),
    })
}

/// Compress QR payment endpoint
#[utoipa::path(
    post,
    path = "/compress/qr-payment",
    tag = "compression",
    request_body = serde_json::Value,
    responses(
        (status = 200, description = "QR payment compressed successfully", body = CompressionStatsResponse),
        (status = 400, description = "Invalid request", body = Error),
        (status = 500, description = "Compression failed", body = Error)
    )
)]
#[post("/compress/qr-payment")]
async fn compress_qr_payment(
    req: web::Json<serde_json::Value>,
    storage: Data<Arc<crate::storage::Storage>>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(CompressionStatsResponse {
        original_size: 600,
        compressed_size: 300,
        compression_ratio: 0.5,
        space_saved_percent: 50.0,
        format: "gzip".to_string(),
    })
}

/// Submit transaction endpoint
#[utoipa::path(
    post,
    path = "/transaction/submit",
    tag = "transactions",
    request_body = SendTxRequest,
    responses(
        (status = 200, description = "Transaction submitted successfully", body = TransactionResponse),
        (status = 400, description = "Invalid request", body = Error),
        (status = 500, description = "Transaction failed", body = Error)
    )
)]
#[post("/transaction/submit")]
async fn submit_transaction(
    req: web::Json<SendTxRequest>,
    storage: Data<Arc<crate::storage::Storage>>,
) -> impl Responder {
    // This is the main transaction submission endpoint
    send_tx(req, storage).await
}

/// Legacy submit transaction endpoint
#[utoipa::path(
    post,
    path = "/api/v1/submit-transaction",
    tag = "transactions",
    request_body = SendTxRequest,
    responses(
        (status = 200, description = "Transaction submitted successfully", body = TransactionResponse),
        (status = 400, description = "Invalid request", body = Error),
        (status = 500, description = "Transaction failed", body = Error)
    )
)]
#[post("/api/v1/submit-transaction")]
async fn legacy_submit_transaction(
    req: web::Json<SendTxRequest>,
    storage: Data<Arc<crate::storage::Storage>>,
) -> impl Responder {
    // Legacy endpoint for backward compatibility
    send_tx(req, storage).await
}

/// Get contract payments endpoint
#[utoipa::path(
    get,
    path = "/contract/payments",
    tag = "contract",
    responses(
        (status = 200, description = "Contract payments retrieved successfully", body = Vec<ContractPayment>),
        (status = 500, description = "Failed to retrieve payments", body = Error)
    )
)]
#[get("/contract/payments")]
async fn get_contract_payments(
    storage: Data<Arc<crate::storage::Storage>>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "payments": []
    }))
}

/// Generate token endpoint
#[utoipa::path(
    post,
    path = "/auth/token",
    tag = "auth",
    request_body = TokenRequest,
    responses(
        (status = 200, description = "Token generated successfully", body = AuthResponse),
        (status = 401, description = "Invalid API key", body = Error)
    )
)]
#[post("/auth/token")]
async fn generate_token(
    req: web::Json<TokenRequest>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(AuthResponse {
        token: "jwt_token_here".to_string(),
        expires_at: "2024-12-31T23:59:59Z".to_string(),
        status: "active".to_string(),
    })
}

/// Process BLE transaction endpoint
#[utoipa::path(
    post,
    path = "/ble/process-transaction",
    tag = "ble",
    request_body = BLEProcessRequest,
    responses(
        (status = 200, description = "BLE transaction processed successfully", body = TransactionResponse),
        (status = 400, description = "Invalid request", body = Error),
        (status = 500, description = "Processing failed", body = Error)
    )
)]
#[post("/ble/process-transaction")]
async fn process_ble_transaction(
    req: web::Json<BLEProcessRequest>,
    storage: Data<Arc<crate::storage::Storage>>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(TransactionResponse {
        success: true,
        hash: Some("0x1234567890abcdef".to_string()),
        error: None,
    })
}

/// Initiate key exchange endpoint
#[utoipa::path(
    post,
    path = "/ble/key-exchange/initiate/{device_id}",
    tag = "ble",
    params(
        ("device_id" = String, Path, description = "Device identifier")
    ),
    responses(
        (status = 200, description = "Key exchange initiated successfully", body = serde_json::Value),
        (status = 400, description = "Invalid device ID", body = Error),
        (status = 500, description = "Key exchange failed", body = Error)
    )
)]
#[post("/ble/key-exchange/initiate/{device_id}")]
async fn initiate_key_exchange(
    path: web::Path<String>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Key exchange initiated successfully"
    }))
}

/// Rotate session key endpoint
#[utoipa::path(
    post,
    path = "/ble/key-exchange/rotate/{device_id}",
    tag = "ble",
    params(
        ("device_id" = String, Path, description = "Device identifier")
    ),
    responses(
        (status = 200, description = "Session key rotated successfully", body = serde_json::Value),
        (status = 400, description = "Invalid device ID", body = Error),
        (status = 500, description = "Key rotation failed", body = Error)
    )
)]
#[post("/ble/key-exchange/rotate/{device_id}")]
async fn rotate_session_key(
    path: web::Path<String>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Session key rotation initiated successfully"
    }))
}

/// Block device endpoint
#[utoipa::path(
    post,
    path = "/ble/key-exchange/block/{device_id}",
    tag = "ble",
    params(
        ("device_id" = String, Path, description = "Device identifier")
    ),
    request_body = BlockDeviceRequest,
    responses(
        (status = 200, description = "Device blocked successfully", body = serde_json::Value),
        (status = 400, description = "Invalid device ID", body = Error),
        (status = 500, description = "Blocking failed", body = Error)
    )
)]
#[post("/ble/key-exchange/block/{device_id}")]
async fn block_device(
    path: web::Path<String>,
    req: web::Json<BlockDeviceRequest>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Device blocked from key exchange successfully"
    }))
}

/// Unblock device endpoint
#[utoipa::path(
    post,
    path = "/ble/key-exchange/unblock/{device_id}",
    tag = "ble",
    params(
        ("device_id" = String, Path, description = "Device identifier")
    ),
    responses(
        (status = 200, description = "Device unblocked successfully", body = serde_json::Value),
        (status = 400, description = "Invalid device ID", body = Error),
        (status = 500, description = "Unblocking failed", body = Error)
    )
)]
#[post("/ble/key-exchange/unblock/{device_id}")]
async fn unblock_device(
    path: web::Path<String>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Device unblocked from key exchange successfully"
    }))
}

/// Get key exchange devices endpoint
#[utoipa::path(
    get,
    path = "/ble/key-exchange/devices",
    tag = "ble",
    responses(
        (status = 200, description = "Key exchange devices retrieved successfully", body = serde_json::Value),
        (status = 500, description = "Failed to retrieve devices", body = Error)
    )
)]
#[get("/ble/key-exchange/devices")]
async fn get_key_exchange_devices() -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "devices": []
    }))
}

/// Get database transactions endpoint
#[utoipa::path(
    get,
    path = "/api/database/transactions",
    tag = "database",
    params(
        ("limit" = Option<usize>, Query, description = "Number of transactions to return"),
        ("offset" = Option<usize>, Query, description = "Number of transactions to skip")
    ),
    responses(
        (status = 200, description = "Database transactions retrieved successfully", body = serde_json::Value),
        (status = 500, description = "Failed to retrieve transactions", body = Error)
    )
)]
#[get("/api/database/transactions")]
async fn get_database_transactions(
    storage: Data<Arc<crate::storage::Storage>>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "data": {
            "transactions": [],
            "pagination": {
                "limit": 100,
                "offset": 0,
                "total": 0,
                "has_more": false,
            },
        },
    }))
}

/// Get transaction by ID endpoint
#[utoipa::path(
    get,
    path = "/api/database/transactions/{id}",
    tag = "database",
    params(
        ("id" = String, Path, description = "Transaction identifier")
    ),
    responses(
        (status = 200, description = "Transaction retrieved successfully", body = DatabaseTransaction),
        (status = 404, description = "Transaction not found", body = Error),
        (status = 500, description = "Failed to retrieve transaction", body = Error)
    )
)]
#[get("/api/database/transactions/{id}")]
async fn get_transaction_by_id(
    path: web::Path<String>,
    storage: Data<Arc<crate::storage::Storage>>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "data": DatabaseTransaction {
            id: "tx_123".to_string(),
            signed_transaction: "0x1234567890abcdef".to_string(),
            chain_id: 1,
            device_id: Some("device_123".to_string()),
            timestamp: "2024-01-01T00:00:00Z".to_string(),
            status: "completed".to_string(),
            hash: Some("0xabcdef1234567890".to_string()),
        },
    }))
}

/// Get transactions by device endpoint
#[utoipa::path(
    get,
    path = "/api/database/transactions/device/{device_id}",
    tag = "database",
    params(
        ("device_id" = String, Path, description = "Device identifier"),
        ("limit" = Option<usize>, Query, description = "Number of transactions to return")
    ),
    responses(
        (status = 200, description = "Device transactions retrieved successfully", body = serde_json::Value),
        (status = 500, description = "Failed to retrieve transactions", body = Error)
    )
)]
#[get("/api/database/transactions/device/{device_id}")]
async fn get_transactions_by_device(
    path: web::Path<String>,
    storage: Data<Arc<crate::storage::Storage>>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "data": {
            "transactions": [],
            "device_id": "device_123",
            "count": 0,
        },
    }))
}

/// Create database backup endpoint
#[utoipa::path(
    post,
    path = "/api/database/backup",
    tag = "database",
    responses(
        (status = 200, description = "Backup created successfully", body = serde_json::Value),
        (status = 500, description = "Backup failed", body = Error)
    )
)]
#[post("/api/database/backup")]
async fn create_database_backup(
    storage: Data<Arc<crate::storage::Storage>>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "data": {
            "backup_path": "/backups/backup_20240101.sql",
            "message": "Backup created successfully",
        },
    }))
}

/// Get database stats endpoint
#[utoipa::path(
    get,
    path = "/api/database/stats",
    tag = "database",
    responses(
        (status = 200, description = "Database stats retrieved successfully", body = serde_json::Value),
        (status = 500, description = "Failed to retrieve stats", body = Error)
    )
)]
#[get("/api/database/stats")]
async fn get_database_stats(
    storage: Data<Arc<crate::storage::Storage>>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "data": {
            "total_transactions": 0,
            "total_devices": 0,
            "database_size": "1.2 MB",
            "last_backup": "2024-01-01T00:00:00Z",
        },
    }))
}

/// Get database security endpoint
#[utoipa::path(
    get,
    path = "/api/database/security",
    tag = "database",
    responses(
        (status = 200, description = "Database security info retrieved successfully", body = serde_json::Value),
        (status = 500, description = "Failed to retrieve security info", body = Error)
    )
)]
#[get("/api/database/security")]
async fn get_database_security(
    storage: Data<Arc<crate::storage::Storage>>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "data": {
            "encryption_enabled": true,
            "backup_encryption": true,
            "access_logs": true,
            "last_security_audit": "2024-01-01T00:00:00Z",
        },
    }))
}

/// Get BLE status endpoint
#[utoipa::path(
    get,
    path = "/ble/status",
    tag = "ble",
    responses(
        (status = 200, description = "BLE status retrieved successfully", body = BLEStatus),
        (status = 500, description = "Failed to retrieve BLE status", body = Error)
    )
)]
#[get("/ble/status")]
async fn get_ble_status() -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(BLEStatus {
        enabled: true,
        initialized: true,
        is_advertising: false,
        connected_devices: 0,
        authenticated_devices: 0,
        blocked_devices: 0,
    })
}

/// Get BLE devices endpoint
#[utoipa::path(
    get,
    path = "/ble/devices",
    tag = "ble",
    responses(
        (status = 200, description = "BLE devices retrieved successfully", body = serde_json::Value),
        (status = 500, description = "Failed to retrieve BLE devices", body = Error)
    )
)]
#[get("/ble/devices")]
async fn get_ble_devices() -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "devices": []
    }))
}

/// Get contract owner endpoint
#[utoipa::path(
    get,
    path = "/contract/owner",
    tag = "contract",
    responses(
        (status = 200, description = "Contract owner retrieved successfully", body = ContractOwner),
        (status = 500, description = "Failed to retrieve contract owner", body = Error)
    )
)]
#[get("/contract/owner")]
async fn get_contract_owner() -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(ContractOwner {
        contract_address: "0x1234567890abcdef".to_string(),
        owner_address: "0xabcdef1234567890".to_string(),
        network: "ethereum".to_string(),
    })
}

/// Get BLE auth device endpoint
#[utoipa::path(
    get,
    path = "/ble/auth/device/{device_id}",
    tag = "ble",
    params(
        ("device_id" = String, Path, description = "Device identifier")
    ),
    responses(
        (status = 200, description = "BLE auth device retrieved successfully", body = serde_json::Value),
        (status = 404, description = "Device not found", body = Error),
        (status = 500, description = "Failed to retrieve device", body = Error)
    )
)]
#[get("/ble/auth/device/{device_id}")]
async fn get_ble_auth_device(
    path: web::Path<String>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "device": {
            "id": "device_123",
            "status": "authenticated",
            "last_seen": "2024-01-01T00:00:00Z",
        }
    }))
}

/// Block BLE auth device endpoint
#[utoipa::path(
    post,
    path = "/ble/auth/block/{device_id}",
    tag = "ble",
    params(
        ("device_id" = String, Path, description = "Device identifier")
    ),
    request_body = BlockDeviceRequest,
    responses(
        (status = 200, description = "Device blocked successfully", body = serde_json::Value),
        (status = 400, description = "Invalid device ID", body = Error),
        (status = 500, description = "Blocking failed", body = Error)
    )
)]
#[post("/ble/auth/block/{device_id}")]
async fn block_ble_auth_device(
    path: web::Path<String>,
    req: web::Json<BlockDeviceRequest>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Device blocked successfully"
    }))
}

/// Unblock BLE auth device endpoint
#[utoipa::path(
    post,
    path = "/ble/auth/unblock/{device_id}",
    tag = "ble",
    params(
        ("device_id" = String, Path, description = "Device identifier")
    ),
    responses(
        (status = 200, description = "Device unblocked successfully", body = serde_json::Value),
        (status = 400, description = "Invalid device ID", body = Error),
        (status = 500, description = "Unblocking failed", body = Error)
    )
)]
#[post("/ble/auth/unblock/{device_id}")]
async fn unblock_ble_auth_device(
    path: web::Path<String>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Device unblocked successfully"
    }))
}

/// Get BLE auth devices endpoint
#[utoipa::path(
    get,
    path = "/ble/auth/devices",
    tag = "ble",
    responses(
        (status = 200, description = "BLE auth devices retrieved successfully", body = serde_json::Value),
        (status = 500, description = "Failed to retrieve devices", body = Error)
    )
)]
#[get("/ble/auth/devices")]
async fn get_ble_auth_devices() -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "devices": []
    }))
}

/// Get BLE key exchange device endpoint
#[utoipa::path(
    get,
    path = "/ble/key-exchange/device/{device_id}",
    tag = "ble",
    params(
        ("device_id" = String, Path, description = "Device identifier")
    ),
    responses(
        (status = 200, description = "BLE key exchange device retrieved successfully", body = serde_json::Value),
        (status = 404, description = "Device not found", body = Error),
        (status = 500, description = "Failed to retrieve device", body = Error)
    )
)]
#[get("/ble/key-exchange/device/{device_id}")]
async fn get_ble_key_exchange_device(
    path: web::Path<String>,
) -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "device": {
            "id": "device_123",
            "key_exchange_status": "active",
            "last_key_rotation": "2024-01-01T00:00:00Z",
        }
    }))
}

/// Get networks status endpoint
#[utoipa::path(
    get,
    path = "/networks/status",
    tag = "networks",
    responses(
        (status = 200, description = "Networks status retrieved successfully", body = Vec<NetworkStatus>),
        (status = 500, description = "Failed to retrieve networks status", body = Error)
    )
)]
#[get("/networks/status")]
async fn get_networks_status() -> impl Responder {
    // Implementation would go here
    HttpResponse::Ok().json(serde_json::json!({
        "networks": [
            {
                "name": "Ethereum Mainnet",
                "chain_id": 1,
                "rpc_url": "https://mainnet.infura.io/v3/...",
                "status": "connected",
                "block_number": 12345678,
                "gas_price": "20000000000"
            }
        ]
    }))
}

pub async fn run_api_server() -> std::io::Result<()> {
    // Initialize shared components
    let storage = Arc::new(crate::storage::Storage::new().expect("Failed to initialize storage"));
    let auth_manager = crate::auth::AuthManager::new();
    let security_manager = crate::security::SecurityManager::new();
    
    HttpServer::new(move || {
        App::new()
            .app_data(Data::new(storage.clone()))
            .app_data(Data::new(auth_manager.clone()))
            .app_data(Data::new(security_manager.clone()))
            .wrap(crate::security::cors_config())
            .service(
                SwaggerUi::new("/swagger-ui/{_:.*}")
                    .url("/api-docs/openapi.json", ApiDoc::openapi())
            )
            // Health and metrics endpoints
            .service(health)
            .service(get_metrics)
            
            // BLE endpoints
            .service(ble_scan)
            .service(get_ble_status)
            .service(get_ble_devices)
            .service(process_ble_transaction)
            .service(initiate_key_exchange)
            .service(rotate_session_key)
            .service(block_device)
            .service(unblock_device)
            .service(get_key_exchange_devices)
            .service(get_ble_auth_device)
            .service(block_ble_auth_device)
            .service(unblock_ble_auth_device)
            .service(get_ble_auth_devices)
            .service(get_ble_key_exchange_device)
            
            // Transaction endpoints
            .service(send_tx)
            .service(send_compressed_tx)
            .service(submit_transaction)
            .service(legacy_submit_transaction)
            .service(get_transactions)
            
            // Compression endpoints
            .service(compress_transaction)
            .service(compress_ble_payment)
            .service(compress_qr_payment)
            
            // Contract endpoints
            .service(get_contract_payments)
            .service(get_contract_owner)
            
            // Authentication endpoints
            .service(authenticate_device)
            .service(generate_token)
            .service(get_devices)
            
            // Database endpoints
            .service(get_database_transactions)
            .service(get_transaction_by_id)
            .service(get_transactions_by_device)
            .service(create_database_backup)
            .service(get_database_stats)
            .service(get_database_security)
            
            // Network endpoints
            .service(get_networks_status)
    })
    .bind(("0.0.0.0", 4000))?
    .run()
    .await
} 