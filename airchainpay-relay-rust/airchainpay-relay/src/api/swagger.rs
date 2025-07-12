use actix_web::{get, post, web, App, HttpResponse, HttpServer, Responder, Data};
use serde::{Deserialize, Serialize};
use utoipa::{OpenApi, ToSchema};
use utoipa_swagger_ui::SwaggerUi;

#[derive(OpenApi)]
#[openapi(
    paths(
        health,
        ble_scan,
        send_tx,
        authenticate_device,
        get_transactions,
        get_metrics,
        get_devices
    ),
    components(
        schemas(Transaction, TransactionResponse, BLEStatus, HealthStatus, Error, SendTxRequest, AuthRequest, AuthResponse)
    ),
    tags(
        (name = "health", description = "Health check endpoints"),
        (name = "ble", description = "Bluetooth Low Energy endpoints"),
        (name = "transactions", description = "Transaction management endpoints"),
        (name = "auth", description = "Authentication endpoints"),
        (name = "metrics", description = "Metrics and monitoring endpoints")
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
            .service(health)
            .service(ble_scan)
            .service(send_tx)
            .service(authenticate_device)
            .service(get_transactions)
            .service(get_metrics)
            .service(get_devices)
    })
    .bind(("0.0.0.0", 4000))?
    .run()
    .await
} 