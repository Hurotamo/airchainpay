mod api;
mod ble;
mod blockchain;
mod security;
mod storage;
mod auth;
mod config;
mod error;
mod logger;
mod processors;
mod validators;
mod utils;
mod scheduler;
mod middleware;
mod monitoring;

use actix_web::{App, HttpServer, web};

use std::sync::Arc;
use crate::config::DynamicConfigManager;
use crate::storage::Storage;
use crate::blockchain::BlockchainManager;
use crate::auth::AuthManager;
use crate::security::SecurityManager;
use crate::monitoring::MonitoringManager;
use crate::middleware::input_validation::{
    validate_transaction_request, validate_ble_request, validate_auth_request, validate_compressed_payload_request
};
use crate::middleware::rate_limiting::{
    AuthRateLimiter, TransactionRateLimiter, BLERateLimiter,
    HealthRateLimiter, MetricsRateLimiter, DatabaseRateLimiter, CompressRateLimiter
};
use crate::api::{
    health, ble_scan, send_compressed_tx, compress_transaction, 
    compress_ble_payment, compress_qr_payment, submit_transaction, legacy_submit_transaction,
    create_backup, restore_backup, list_backups, get_backup_info, delete_backup, 
    verify_backup, get_backup_stats, cleanup_backups,
    get_audit_events, get_security_events, get_failed_events, get_critical_events,
    get_events_by_user, get_events_by_device, get_audit_stats, export_audit_events, clear_audit_events,
    get_error_statistics, reset_error_statistics, get_circuit_breaker_status, 
    reset_circuit_breaker, test_error_handling, get_error_summary,
    get_configuration, reload_configuration, export_configuration, import_configuration,
    validate_configuration, get_configuration_summary, update_configuration_field, save_configuration_to_file,
    detailed_health, component_health, health_alerts, resolve_alert, health_metrics,
    add_transaction_to_processor, get_processor_status, get_processor_metrics, get_failed_transactions,
    retry_failed_transaction, clear_processor_queue, get_transaction_status,
    get_critical_errors, get_critical_errors_by_path, get_critical_metrics, 
    reset_critical_circuit_breaker, get_critical_health, test_critical_error_handling,
    process_transaction
};
use crate::utils::backup::{BackupManager, BackupConfig};
use crate::utils::audit::AuditLogger;
use crate::utils::critical_error_handler::CriticalErrorHandler;
use crate::ble::manager::BLEManager;
use crate::logger::Logger;
use std::env;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize logger
    Logger::init("info");
    
    // Initialize dynamic configuration manager
    let config_manager = Arc::new(DynamicConfigManager::new().expect("Failed to initialize configuration manager"));
    
    // Get initial configuration
    let config = config_manager.get_config().await;
    
    // Initialize storage
    let storage = Arc::new(Storage::new().expect("Failed to initialize storage"));
    
    // Initialize blockchain manager
    let blockchain_manager = Arc::new(BlockchainManager::new(config.clone())
        .expect("Failed to initialize blockchain manager"));
    
    // Initialize auth manager
    let auth_manager = Arc::new(AuthManager::new());
    
    // Initialize security manager
    let security_manager = Arc::new(SecurityManager::new());
    
    // Initialize monitoring manager
    let monitoring_manager = Arc::new(MonitoringManager::new());
    
    // Initialize backup manager
    let backup_config = BackupConfig::default();
    let backup_manager = Arc::new(BackupManager::new(backup_config, "data".to_string())
        .with_monitoring(Arc::clone(&monitoring_manager)));
    
    // Start automatic backup
    BackupManager::start_auto_backup(Arc::clone(&backup_manager));
    
    // Initialize audit logger
    let audit_logger = Arc::new(AuditLogger::new("audit.log".to_string(), 10000)
        .with_monitoring(Arc::clone(&monitoring_manager)));
    
    // Initialize critical error handler for production-critical paths
    let critical_error_handler = Arc::new(CriticalErrorHandler::new());
    
    // Initialize enhanced transaction processor
    let transaction_processor = Arc::new(processors::TransactionProcessor::new(
        Arc::clone(&blockchain_manager),
        Arc::clone(&storage),
        None, // Use default config
    ));
    
    // Start the transaction processor
    transaction_processor.start().await.expect("Failed to start transaction processor");
    
    // Create channel for BLE transactions
    let (_tx_sender, _tx_receiver) = tokio::sync::mpsc::channel::<String>(100);
    
    // Initialize BLE manager
    let ble_manager = Arc::new(BLEManager::new()
        .await
        .expect("Failed to initialize BLE manager"));
    
    // Get port from environment or use default
    let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string()).parse::<u16>().unwrap_or(8080);
    
    log::info!("Starting AirChainPay Relay Server on port {}", port);
    
    HttpServer::new(move || {
        App::new()
            // Use built-in Actix Web middleware instead of custom middleware that requires Clone
            .wrap(actix_web::middleware::Logger::default())
            .wrap(actix_web::middleware::Compress::default())
            .wrap(actix_cors::Cors::default()
                .allow_any_origin()
                .allow_any_method()
                .allow_any_header()
                .max_age(3600))
            
            // Health check endpoints with health rate limiting
            .service(
                web::scope("/health")
                    .wrap(HealthRateLimiter::new())
                    .service(health)
                    .service(detailed_health)
                    .service(component_health)
                    .service(health_alerts)
                    .service(resolve_alert)
                    .service(health_metrics)
            )
            
            // Metrics endpoint with metrics rate limiting
            .service(
                web::scope("/metrics")
                    .wrap(MetricsRateLimiter::new())
                    .service(web::resource("").to(|| async { "Metrics endpoint" }))
            )
            
            // BLE endpoints with BLE rate limiting
            .service(
                web::scope("/ble")
                    .wrap(BLERateLimiter::new())
                    .wrap(validate_ble_request())
                    .service(ble_scan)
            )
            
            // Transaction endpoints with transaction rate limiting
            .service(
                web::scope("/transaction")
                    .wrap(TransactionRateLimiter::new())
                    .wrap(validate_transaction_request())
                    .service(submit_transaction)
            )
            
            // Compressed transaction endpoints with transaction rate limiting
            .service(
                web::scope("/compressed")
                    .wrap(TransactionRateLimiter::new())
                    .wrap(validate_compressed_payload_request())
                    .service(send_compressed_tx)
            )
            
            // Compression endpoints with compress rate limiting
            .service(
                web::scope("/compress")
                    .wrap(CompressRateLimiter::new())
                    .service(compress_transaction)
                    .service(compress_ble_payment)
                    .service(compress_qr_payment)
            )
            
            // Legacy endpoints with transaction rate limiting
            .service(
                web::scope("/api/v1")
                    .wrap(TransactionRateLimiter::new())
                    .wrap(validate_transaction_request())
                    .service(legacy_submit_transaction)
            )
            
            // Direct endpoints with transaction rate limiting
            .service(
                web::scope("/send")
                    .wrap(TransactionRateLimiter::new())
                    .wrap(validate_transaction_request())
                    .service(process_transaction)
            )
            
            // Auth endpoints with auth rate limiting
            .service(
                web::scope("/auth")
                    .wrap(AuthRateLimiter::new())
                    .wrap(validate_auth_request())
                    // Add auth endpoints here when implemented
            )
            
            // Database endpoints with database rate limiting
            .service(
                web::scope("/api/database")
                    .wrap(DatabaseRateLimiter::new())
                    // Add database endpoints here when implemented
            )
            
            // Backup endpoints with database rate limiting
            .service(
                web::scope("/backup")
                    .wrap(DatabaseRateLimiter::new())
                    .service(create_backup)
                    .service(restore_backup)
                    .service(list_backups)
                    .service(get_backup_info)
                    .service(delete_backup)
                    .service(verify_backup)
                    .service(get_backup_stats)
                    .service(cleanup_backups)
            )
            
            // Audit endpoints with database rate limiting
            .service(
                web::scope("/audit")
                    .wrap(DatabaseRateLimiter::new())
                    .service(get_audit_events)
                    .service(get_security_events)
                    .service(get_failed_events)
                    .service(get_critical_events)
                    .service(get_events_by_user)
                    .service(get_events_by_device)
                    .service(get_audit_stats)
                    .service(export_audit_events)
                    .service(clear_audit_events)
            )
            
            // Error handling endpoints with database rate limiting
            .service(
                web::scope("/error")
                    .wrap(DatabaseRateLimiter::new())
                    .service(get_error_statistics)
                    .service(reset_error_statistics)
                    .service(get_circuit_breaker_status)
                    .service(reset_circuit_breaker)
                    .service(test_error_handling)
                    .service(get_error_summary)
            )
            
            // Configuration management endpoints with database rate limiting
            .service(
                web::scope("/config")
                    .wrap(DatabaseRateLimiter::new())
                    .service(get_configuration)
                    .service(reload_configuration)
                    .service(export_configuration)
                    .service(import_configuration)
                    .service(validate_configuration)
                    .service(get_configuration_summary)
                    .service(update_configuration_field)
                    .service(save_configuration_to_file)
            )
            
            // Transaction processor endpoints with transaction rate limiting
            .service(
                web::scope("/processor")
                    .wrap(TransactionRateLimiter::new())
                    .service(add_transaction_to_processor)
                    .service(get_processor_status)
                    .service(get_processor_metrics)
                    .service(get_failed_transactions)
                    .service(retry_failed_transaction)
                    .service(clear_processor_queue)
                    .service(get_transaction_status)
            )
            
            // Critical error handler endpoints with database rate limiting
            .service(
                web::scope("/critical")
                    .wrap(DatabaseRateLimiter::new())
                    .service(get_critical_errors)
                    .service(get_critical_errors_by_path)
                    .service(get_critical_metrics)
                    .service(reset_critical_circuit_breaker)
                    .service(get_critical_health)
                    .service(test_critical_error_handling)
            )
            
            // App data
            .app_data(web::Data::new(storage.clone()))
            .app_data(web::Data::new(blockchain_manager.clone()))
            .app_data(web::Data::new(auth_manager.clone()))
            .app_data(web::Data::new(security_manager.clone()))
            .app_data(web::Data::new(monitoring_manager.clone()))
            .app_data(web::Data::new(ble_manager.clone()))
            .app_data(web::Data::new(backup_manager.clone()))
            .app_data(web::Data::new(audit_logger.clone()))
            .app_data(web::Data::new(critical_error_handler.clone()))
            .app_data(web::Data::new(config_manager.clone()))
            .app_data(web::Data::new(transaction_processor.clone()))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
