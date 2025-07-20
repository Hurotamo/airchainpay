use actix_web::{App, HttpServer, web};

use std::sync::Arc;
use airchainpay_relay::infrastructure::config::DynamicConfigManager;
use airchainpay_relay::infrastructure::storage::file_storage::Storage;
use airchainpay_relay::infrastructure::blockchain::manager::BlockchainManager;
use airchainpay_relay::domain::auth::AuthManager;
use airchainpay_relay::infrastructure::monitoring::manager::MonitoringManager;
use airchainpay_relay::utils::error_handler::EnhancedErrorHandler;
use airchainpay_relay::utils::backup::BackupManager;
use airchainpay_relay::utils::audit::AuditLogger;
use airchainpay_relay::infrastructure::logger::Logger;
use airchainpay_relay::app::transaction_service::TransactionProcessor;
use airchainpay_relay::utils::backup::BackupConfig;
use airchainpay_relay::middleware::metrics::MetricsMiddleware;
use airchainpay_relay::middleware::error_handling::ErrorHandlingMiddleware;
use airchainpay_relay::middleware::rate_limiting::RateLimitingMiddleware;
use airchainpay_relay::middleware::ComprehensiveSecurityMiddleware;
use airchainpay_relay::api::*;
use airchainpay_relay::api::handlers::transaction::validate_inputs;
use airchainpay_relay::utils::animated_ascii;
use std::env;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Display animated ASCII logo
    animated_ascii::display_animated_logo();
    
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
    let transaction_processor = Arc::new(TransactionProcessor::new(
        Arc::clone(&blockchain_manager),
        Arc::clone(&storage),
        None, // Use default config
    ));
    
    // Start the transaction processor
    transaction_processor.start().await.expect("Failed to start transaction processor");
    
    // Get port from environment or use default
    let port = env::var("PORT").unwrap_or_else(|_| "4000".to_string()).parse::<u16>().unwrap_or(4000);
    
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
                        airchainpay_relay::middleware::EnhancedSecurityConfig::default()
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
                    .service(validate_inputs)
            )
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
