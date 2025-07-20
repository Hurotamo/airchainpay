use actix_web::{get, post, delete, web, HttpResponse, Responder};
use actix_web::web::Data;
use serde::{Deserialize, Serialize};
use crate::infrastructure::storage::file_storage::{Storage, Transaction};
use crate::infrastructure::blockchain::manager::BlockchainManager;
use crate::infrastructure::monitoring::manager::{MonitoringManager, AlertSeverity};
use crate::utils::error_handler::EnhancedErrorHandler;
use crate::infrastructure::config::DynamicConfigManager;
use crate::middleware::error_handling::ErrorResponseBuilder;
use crate::utils::audit::{AuditLogger, AuditSeverity, AuditFilter, AuditEventType};
use crate::utils::backup::{BackupType, BackupFilter, BackupManager, RestoreOptions};
use std::sync::Arc;
use std::collections::HashMap;
use std::env;
use actix_web::web::{Json, Query, Path};
use chrono::{DateTime, Utc};
use crate::app::transaction_service::{QueuedTransaction, TransactionProcessor};
use serde_json::json;
use crate::domain::auth;
use crate::domain::error::{RelayError, BlockchainError};

#[get("/health")]
async fn health() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "version": env!("CARGO_PKG_VERSION"),
        "message": "AirChainPay Relay Server is running"
    }))
}

#[derive(Deserialize)]
pub struct SendTxRequest {
    pub signed_tx: String,
    pub rpc_url: String,
    pub chain_id: u64,
 
}

// Add this helper function before process_transaction
async fn handle_transaction_submission(
    req: web::Json<SendTxRequest>,
    storage: Data<Arc<Storage>>,
    blockchain_manager: Data<Arc<BlockchainManager>>,
    error_handler: Data<Arc<EnhancedErrorHandler>>,
    config_manager: Data<Arc<DynamicConfigManager>>,
) -> impl Responder {
    // Validate input using ethereum validation functions
    use crate::infrastructure::blockchain::ethereum;
    
    // Use blockchain manager to check network status
    let network_status = blockchain_manager.get_ref().get_network_status().await;
    let is_healthy = match network_status {
        Ok(status) => status.get("overall_status").map(|s| s == "healthy").unwrap_or(false),
        Err(_) => false,
    };
    
    if !is_healthy {
        return ErrorResponseBuilder::service_unavailable("Blockchain network is currently unavailable");
    }
    
    // Use ethereum validation for basic format check
    if !ethereum::validate_transaction_hash(&req.signed_tx) {
        return ErrorResponseBuilder::bad_request("Invalid transaction hash format");
    }
    
    // Create transaction validator
    let config = config_manager.get_ref().get_config().await;
    let validator = crate::validators::transaction_validator::TransactionValidator::new(std::sync::Arc::new(config));
    
    // Comprehensive transaction validation using TransactionValidator
    match validator.validate_transaction(&req.signed_tx).await {
        Ok(validation_result) => {
            if !validation_result.valid {
                            // Use error_utils for proper error handling and recording
            let error_context = {
                let mut context = std::collections::HashMap::new();
                context.insert("validation_errors".to_string(), validation_result.errors.join(", "));
                context.insert("transaction_hash".to_string(), req.signed_tx.clone());
                context.insert("chain_id".to_string(), req.chain_id.to_string());
                context
            };
            
            // Record validation errors using enhanced error handling
            let _ = error_handler.record_error(crate::utils::error_handler::ErrorRecord {
                    id: uuid::Uuid::new_v4().to_string(),
                    timestamp: chrono::Utc::now(),
                    path: crate::utils::error_handler::CriticalPath::TransactionProcessing,
                    error_type: crate::utils::error_handler::ErrorType::Unknown,
                    error_message: format!("Transaction validation failed: {}", validation_result.errors.join(", ")),
                    context: error_context,
                    severity: crate::utils::error_handler::ErrorSeverity::Medium,
                    retry_count: 0,
                    max_retries: 0,
                    resolved: false,
                    resolution_time: None,
                    stack_trace: None,
                    user_id: None,
                    device_id: None,
                    transaction_id: Some(req.signed_tx.clone()),
                    chain_id: Some(req.chain_id),
                    ip_address: None,
                    component: "transaction_validator".to_string(),
                }).await;
                
                return ErrorResponseBuilder::bad_request(&format!("Transaction validation failed: {}", validation_result.errors.join(", ")));
            }
            
            // Log warnings if any
            if !validation_result.warnings.is_empty() {
                println!("Transaction validation warnings: {}", validation_result.warnings.join(", "));
            }
        }
        Err(e) => {
            // Use error_utils for validation error handling
            let error_context = {
                let mut context = std::collections::HashMap::new();
                context.insert("validation_error".to_string(), e.to_string());
                context.insert("transaction_hash".to_string(), req.signed_tx.clone());
                context.insert("chain_id".to_string(), req.chain_id.to_string());
                context
            };
            
            // Record validation error using enhanced error handling
            let _ = error_handler.record_error(crate::utils::error_handler::ErrorRecord {
                id: uuid::Uuid::new_v4().to_string(),
                timestamp: chrono::Utc::now(),
                path: crate::utils::error_handler::CriticalPath::TransactionProcessing,
                error_type: crate::utils::error_handler::ErrorType::Unknown,
                error_message: format!("Transaction validation error: {}", e),
                context: error_context,
                severity: crate::utils::error_handler::ErrorSeverity::High,
                retry_count: 0,
                max_retries: 0,
                resolved: false,
                resolution_time: None,
                stack_trace: None,
                user_id: None,
                device_id: None,
                transaction_id: Some(req.signed_tx.clone()),
                chain_id: Some(req.chain_id),
                ip_address: None,
                component: "transaction_validator".to_string(),
            }).await;
            
            return ErrorResponseBuilder::internal_server_error(&format!("Transaction validation error: {}", e));
        }
    }
    
    // Create transaction record
    let transaction = Transaction::new(
        req.signed_tx.clone(),
        req.chain_id,
    );
    
    // Save to storage with proper error handling
    match storage.save_transaction(transaction.clone()) {
        Ok(_) => {
            // Update metrics
            let _ = storage.update_metrics("transactions_received", 1);
            
            // Return success response
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "message": "Transaction received and stored",
                "transaction_id": req.signed_tx,
                "chain_id": req.chain_id,
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }))
        }
        Err(e) => {
            // Use error_utils for storage error handling with enhanced context
            let storage_error_context = {
                let mut context = std::collections::HashMap::new();
                context.insert("storage_error".to_string(), e.to_string());
                context.insert("transaction_hash".to_string(), req.signed_tx.clone());
                context.insert("chain_id".to_string(), req.chain_id.to_string());
                context.insert("operation".to_string(), "save_transaction".to_string());
                context
            };
            
            // Record storage error using enhanced error handling
            let _ = error_handler.record_error(crate::utils::error_handler::ErrorRecord {
                id: uuid::Uuid::new_v4().to_string(),
                timestamp: chrono::Utc::now(),
                path: crate::utils::error_handler::CriticalPath::TransactionProcessing,
                error_type: crate::utils::error_handler::ErrorType::Unknown,
                error_message: format!("Storage error: {}", e),
                context: storage_error_context,
                severity: crate::utils::error_handler::ErrorSeverity::High,
                retry_count: 0,
                max_retries: 0,
                resolved: false,
                resolution_time: None,
                stack_trace: None,
                user_id: None,
                device_id: None,
                transaction_id: Some(req.signed_tx.clone()),
                chain_id: Some(req.chain_id),
                ip_address: None,
                component: "storage".to_string(),
            }).await;
            
            ErrorResponseBuilder::internal_server_error("Failed to save transaction")
        }
    }
}

// Update process_transaction to call the helper
#[post("/send_tx")]
async fn process_transaction(
    req: web::Json<SendTxRequest>,
    storage: Data<Arc<Storage>>,
    blockchain_manager: Data<Arc<BlockchainManager>>,
    error_handler: Data<Arc<EnhancedErrorHandler>>,
    config_manager: Data<Arc<DynamicConfigManager>>,
) -> impl Responder {
    handle_transaction_submission(req, storage, blockchain_manager, error_handler, config_manager).await
}

#[post("/api/v1/submit-transaction")]
async fn legacy_submit_transaction(
    req: web::Json<SendTxRequest>,
    storage: Data<Arc<Storage>>,
    blockchain_manager: Data<Arc<BlockchainManager>>,
    error_handler: Data<Arc<EnhancedErrorHandler>>,
    config_manager: Data<Arc<DynamicConfigManager>>,
) -> impl Responder {
    handle_transaction_submission(req, storage, blockchain_manager, error_handler, config_manager).await
}

#[get("/contract/payments")]
async fn get_contract_payments(
    _blockchain_manager: Data<Arc<BlockchainManager>>,
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

#[derive(Deserialize)]
struct ValidationRequest {
    address: Option<String>,
    transaction_hash: Option<String>,
    amount: Option<String>,
    chain_id: Option<u64>,
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
    let token = auth::generate_jwt_token("api-client", "relay");
    
    HttpResponse::Ok().json(serde_json::json!({
        "token": token
    }))
}

#[post("/validate")]
async fn validate_inputs(
    req: web::Json<ValidationRequest>,
) -> impl Responder {
    use crate::infrastructure::blockchain::ethereum;
    
    let mut results = serde_json::Map::new();
    
    // Validate address if provided
    if let Some(address) = &req.address {
        let is_valid = ethereum::validate_ethereum_address(address);
        results.insert("address".to_string(), serde_json::json!({
            "valid": is_valid,
            "value": address
        }));
    }
    
    // Validate transaction hash if provided
    if let Some(hash) = &req.transaction_hash {
        let is_valid = ethereum::validate_transaction_hash(hash);
        results.insert("transaction_hash".to_string(), serde_json::json!({
            "valid": is_valid,
            "value": hash
        }));
    }
    
    // Validate amount if provided
    if let Some(amount) = &req.amount {
        let ether_result = ethereum::parse_ether(amount);
        let wei_result = ethereum::parse_wei(amount);
        
        let is_valid = ether_result.is_ok() || wei_result.is_ok();
        let parsed_value = if ether_result.is_ok() {
            format!("{} ETH", ethereum::format_ether(ether_result.unwrap()))
        } else if wei_result.is_ok() {
            format!("{} Wei", ethereum::format_wei(wei_result.unwrap()))
        } else {
            "Invalid".to_string()
        };
        
        results.insert("amount".to_string(), serde_json::json!({
            "valid": is_valid,
            "value": amount,
            "parsed": parsed_value
        }));
    }
    
    // Validate chain ID if provided
    if let Some(chain_id) = req.chain_id {
        let is_valid = chain_id > 0 && chain_id <= 999999;
        results.insert("chain_id".to_string(), serde_json::json!({
            "valid": is_valid,
            "value": chain_id
        }));
    }
    
    HttpResponse::Ok().json(serde_json::json!({
        "validation_results": results,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct BlockDeviceRequest {
    reason: Option<String>,
}

#[get("/transactions")]
async fn get_transactions(
    storage: Data<Arc<Storage>>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> impl Responder {
    let limit = query.get("limit")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(100);
    
    let transactions = storage.get_transactions(limit);
    HttpResponse::Ok().json(transactions)
}

#[get("/metrics")]
async fn get_metrics(
    _storage: Data<Arc<Storage>>,
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
    let wallets = storage.get_registered_wallets();
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "data": {
            "registered_wallets": wallets,
            "total_count": wallets.len(),
            "message": "Mobile wallet instances registered with the relay"
        }
    }))
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
    _storage: Data<Arc<Storage>>,
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
                message: format!("Backup creation failed: {e}"),
            })
        }
    }
}

#[post("/backup/restore")]
async fn restore_backup(
    _storage: Data<Arc<Storage>>,
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
                message: format!("Backup restoration failed: {e}"),
            })
        }
    }
}

#[get("/backup/list")]
async fn list_backups(
    _storage: Data<Arc<Storage>>,
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
    _storage: Data<Arc<Storage>>,
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
        Err(_e) => {
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
    _storage: Data<Arc<Storage>>,
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
        Err(_e) => {
            HttpResponse::InternalServerError().json(DeleteBackupResponse {
                success: false,
                backup_id,
                message: format!("Backup deletion failed: {_e}"),
            })
        }
    }
}

#[post("/backup/verify/{backup_id}")]
async fn verify_backup(
    _storage: Data<Arc<Storage>>,
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
        Err(_e) => {
            HttpResponse::InternalServerError().json(VerifyBackupResponse {
                success: false,
                backup_id,
                is_valid: false,
                message: format!("Backup verification failed: {_e}"),
            })
        }
    }
}

#[get("/backup/stats")]
async fn get_backup_stats(
    _storage: Data<Arc<Storage>>,
    backup_manager: Data<Arc<BackupManager>>,
) -> impl Responder {
    let stats = backup_manager.get_backup_stats().await;
    
    HttpResponse::Ok().json(BackupStatsResponse {
        success: true,
        stats: BackupStatsInfo {
            total_backups: stats.total_backups,
            total_size: stats.total_size,
            type_counts: stats.type_counts.into_iter().map(|(k, v)| (format!("{k:?}"), v)).collect(),
            oldest_backup: stats.oldest_backup,
            newest_backup: stats.newest_backup,
        },
    })
}

#[post("/backup/cleanup")]
async fn cleanup_backups(
    _storage: Data<Arc<Storage>>,
    backup_manager: Data<Arc<BackupManager>>,
) -> impl Responder {
    match backup_manager.cleanup_old_backups().await {
        Ok(deleted_count) => {
            HttpResponse::Ok().json(CleanupBackupsResponse {
                success: true,
                deleted_count,
                message: format!("Cleaned up {deleted_count} old backups"),
            })
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(CleanupBackupsResponse {
                success: false,
                deleted_count: 0,
                message: format!("Backup cleanup failed: {e}"),
            })
        }
    }
}

#[get("/audit/events")]
async fn get_audit_events(
    _storage: Data<Arc<Storage>>,
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
    _storage: Data<Arc<Storage>>,
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
    _storage: Data<Arc<Storage>>,
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
    _storage: Data<Arc<Storage>>,
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
    _storage: Data<Arc<Storage>>,
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
    _storage: Data<Arc<Storage>>,
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
    _storage: Data<Arc<Storage>>,
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
    _storage: Data<Arc<Storage>>,
    audit_logger: Data<Arc<AuditLogger>>,
    _req: Json<ExportAuditEventsRequest>,
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
                message: format!("Export failed: {e}"),
            })
        }
    }
}

#[delete("/audit/events")]
async fn clear_audit_events(
    _storage: Data<Arc<Storage>>,
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
    error_handler: Data<Arc<EnhancedErrorHandler>>,
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
            "last_error_time": stats.last_error_time.map(|t| chrono::Utc::now().signed_duration_since(t).num_seconds()),
        },
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

#[post("/error/reset")]
async fn reset_error_statistics(
    error_handler: Data<Arc<EnhancedErrorHandler>>,
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
    error_handler: Data<Arc<EnhancedErrorHandler>>,
) -> impl Responder {
    let operation = path.into_inner();
    let status = error_handler.get_circuit_breaker_status(&operation).await;
    
    match status {
        true => HttpResponse::Ok().json(serde_json::json!({
            "operation": operation,
            "status": "open",
            "message": "Circuit breaker is open for this operation",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
        false => HttpResponse::Ok().json(serde_json::json!({
            "operation": operation,
            "status": "closed",
            "message": "Circuit breaker is closed for this operation",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    }
}

#[post("/error/circuit-breaker/{operation}/reset")]
async fn reset_circuit_breaker(
    path: Path<String>,
    error_handler: Data<Arc<EnhancedErrorHandler>>,
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
    error_handler: Data<Arc<EnhancedErrorHandler>>,
) -> impl Responder {
    // Test the error handling system with a simulated error
    let result: Result<(), RelayError> = error_handler.execute_with_error_handling("test_operation", || {
        // Simulate a retryable error
        Err(RelayError::Blockchain(
            BlockchainError::NetworkError("Test network error".to_string())
        ))
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
#[allow(dead_code)]
struct ErrorSummaryRequest {
    pub include_details: Option<bool>,
    pub error_types: Option<Vec<String>>,
}

#[post("/error/summary")]
async fn get_error_summary(
    req: Json<ErrorSummaryRequest>,
    error_handler: Data<Arc<EnhancedErrorHandler>>,
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
        summary["last_error_time"] = serde_json::json!(stats.last_error_time.map(|t| chrono::Utc::now().signed_duration_since(t).num_seconds()));
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
    let config = config_manager.get_config().await;
    {
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
                "database": config.database,
                "supported_chains_count": config.supported_chains.len(),
                "last_modified": config.last_modified,
            });
            
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "config": safe_config,
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }))
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
    let config_json = match serde_json::to_string(&req.config) {
        Ok(json) => json,
        Err(e) => {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "success": false,
                "error": format!("Failed to serialize config: {}", e),
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }));
        }
    };
    
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
    let summary = config_manager.get_config_summary().await;
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "summary": summary,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
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
    config_manager: Data<Arc<DynamicConfigManager>>,
) -> impl Responder {
    let start_time = std::time::Instant::now();
    
    // Get all component statuses
    let system_metrics = monitoring_manager.get_system_metrics().await;
    let alerts = monitoring_manager.get_alerts(50).await;
    let db_health = storage.check_health().await;
    let blockchain_status = blockchain_manager.get_network_status().await.unwrap_or_else(|_| HashMap::new());
    let blockchain_healthy = blockchain_status.get("is_healthy").and_then(|v| v.parse::<bool>().ok()).unwrap_or(false);
    let config_status = config_manager.get_status().await;
    
    // Calculate response time
    let response_time = start_time.elapsed().as_millis() as f64;
    
    // Determine overall health with detailed breakdown
    let critical_alerts = alerts.iter()
        .filter(|a| !a.resolved && matches!(a.severity, AlertSeverity::Critical))
        .count();
    
    let warning_alerts = alerts.iter()
        .filter(|a| !a.resolved && matches!(a.severity, AlertSeverity::Warning))
        .count();
    
    let overall_status = if critical_alerts > 0 {
        "critical"
    } else if !db_health.is_healthy || !blockchain_healthy {
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
                "status": if blockchain_status.get("is_healthy").and_then(|v| v.parse::<bool>().ok()).unwrap_or(false) { "healthy" } else { "unhealthy" },
                "connected_networks": blockchain_status.get("connected_networks").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0),
                "total_networks": blockchain_status.get("total_networks").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0),
                "average_response_time_ms": blockchain_status.get("average_response_time_ms").and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0),
                "pending_transactions": blockchain_status.get("pending_transactions").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0),
                "failed_transactions": blockchain_status.get("failed_transactions").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0),
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
            "info": alerts.iter().filter(|a| !a.resolved && matches!(a.severity, AlertSeverity::Info)).count(),
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
            "blockchain": if blockchain_status.get("is_healthy").and_then(|v| v.parse::<bool>().ok()).unwrap_or(false) { 100 } else { 25 },
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
            let blockchain_status = blockchain_manager.get_network_status().await.unwrap_or_else(|_| HashMap::new());
            HttpResponse::Ok().json(serde_json::json!({
                "component": "blockchain",
                "status": if blockchain_status.get("is_healthy").and_then(|v| v.parse::<bool>().ok()).unwrap_or(false) { "healthy" } else { "unhealthy" },
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "metrics": {
                    "connected_networks": blockchain_status.get("connected_networks").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0),
                    "total_networks": blockchain_status.get("total_networks").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0),
                    "average_response_time_ms": blockchain_status.get("average_response_time_ms").and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0),
                    "pending_transactions": blockchain_status.get("pending_transactions").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0),
                    "failed_transactions": blockchain_status.get("failed_transactions").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0),
                    "gas_price_updates": blockchain_status.get("gas_price_updates").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0),
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
            "available_components": ["system", "database", "blockchain", "configuration"]
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
        "critical_alerts": alerts.iter().filter(|a| !a.resolved && matches!(a.severity, AlertSeverity::Critical)).count(),
        "warning_alerts": alerts.iter().filter(|a| !a.resolved && matches!(a.severity, AlertSeverity::Warning)).count(),
        "info_alerts": alerts.iter().filter(|a| !a.resolved && matches!(a.severity, AlertSeverity::Info)).count(),
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

#[post("/submit_transaction")]
pub async fn submit_transaction(
    tx: web::Json<QueuedTransaction>,
    processor: web::Data<std::sync::Arc<TransactionProcessor>>,
) -> impl Responder {
    processor.enqueue_transaction(tx.into_inner()).await;
    HttpResponse::Ok().json(json!({ "status": "queued" }))
}

