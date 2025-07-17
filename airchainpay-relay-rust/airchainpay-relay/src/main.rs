mod api;
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
use crate::monitoring::MonitoringManager;
use crate::utils::error_handler::EnhancedErrorHandler;
use crate::utils::backup::BackupManager;
use crate::utils::audit::AuditLogger;
use crate::api::{
    health, 
    submit_transaction, legacy_submit_transaction,
    // backup endpoints
    create_backup, restore_backup, list_backups, get_backup_info, delete_backup, 
    verify_backup, get_backup_stats, cleanup_backups,
    // audit endpoints
    get_audit_events, get_security_events, get_failed_events, get_critical_events,
    get_events_by_user, get_events_by_device, get_audit_stats, export_audit_events, clear_audit_events,
    // error endpoints
    get_error_statistics, reset_error_statistics, get_circuit_breaker_status, reset_circuit_breaker,
    test_error_handling, get_error_summary,
    // config endpoints
    get_configuration, reload_configuration, export_configuration, import_configuration,
    validate_configuration, get_configuration_summary, update_configuration_field, save_configuration_to_file,
    // health endpoints
    detailed_health, component_health, health_alerts, resolve_alert, health_metrics,
    // transaction endpoints
    process_transaction, get_transactions, get_metrics, get_devices,
};
use crate::utils::backup::BackupConfig;
use crate::logger::Logger;
use std::env;
use crate::middleware::metrics::MetricsMiddleware;
use crate::middleware::error_handling::ErrorHandlingMiddleware;
use crate::middleware::rate_limiting::RateLimitingMiddleware;
use crate::middleware::ComprehensiveSecurityMiddleware;

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
    
    // Initialize enhanced error handler
    let error_handler = Arc::new(EnhancedErrorHandler::new());
    
    // Initialize enhanced transaction processor
    let transaction_processor = Arc::new(processors::TransactionProcessor::new(
        Arc::clone(&blockchain_manager),
        Arc::clone(&storage),
        None, // Use default config
    ));
    
    // Start the transaction processor
    transaction_processor.start().await.expect("Failed to start transaction processor");
    
    // Get port from environment or use default
    let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string()).parse::<u16>().unwrap_or(8080);
    
    log::info!("Starting AirChainPay Relay Server on port {port}");
    
    HttpServer::new(move || {
        App::new()
            // Global built-in middleware only
            .wrap(actix_web::middleware::Logger::default())
            .wrap(actix_web::middleware::Compress::default())
            .wrap(actix_cors::Cors::permissive())
            .app_data(web::Data::new(Arc::clone(&storage)))
            .app_data(web::Data::new(Arc::clone(&blockchain_manager)))
            .app_data(web::Data::new(Arc::clone(&auth_manager)))
            .app_data(web::Data::new(Arc::clone(&monitoring_manager)))
            .app_data(web::Data::new(Arc::clone(&backup_manager)))
            .app_data(web::Data::new(Arc::clone(&audit_logger)))
            .app_data(web::Data::new(Arc::clone(&transaction_processor)))
            .app_data(web::Data::new(Arc::clone(&config_manager)))
            // Health endpoints (no custom middleware)
            .service(health)
            .service(detailed_health)
            .service(component_health)
            .service(health_alerts)
            .service(resolve_alert)
            .service(health_metrics)
            // API endpoints with custom middleware
            .service(
                web::scope("/api")
                    .wrap(ComprehensiveSecurityMiddleware::new(
                        crate::middleware::EnhancedSecurityConfig::default()
                    ))
                    .wrap(MetricsMiddleware::new(
                        Arc::clone(&monitoring_manager)
                    ))
                    .wrap(ErrorHandlingMiddleware::new(
                        Arc::clone(&error_handler)
                    ))
                    .wrap(RateLimitingMiddleware::new(
                        100, // 100 requests per window
                        10,  // 10 burst requests
                        std::time::Duration::from_secs(60) // 1 minute window
                    ))
                    .service(submit_transaction)
                    .service(legacy_submit_transaction)
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
                    .service(get_error_statistics)
                    .service(reset_error_statistics)
                    .service(get_circuit_breaker_status)
                    .service(reset_circuit_breaker)
                    .service(test_error_handling)
                    .service(get_error_summary)
                    .service(get_configuration)
                    .service(reload_configuration)
                    .service(export_configuration)
                    .service(import_configuration)
                    .service(validate_configuration)
                    .service(get_configuration_summary)
                    .service(update_configuration_field)
                    .service(save_configuration_to_file)
                    .service(process_transaction)
                    .service(get_transactions)
                    .service(get_metrics)
                    .service(get_devices)
            )
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
