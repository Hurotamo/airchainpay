mod api;
mod ble;
mod blockchain;
mod security;
mod storage;
mod auth;
mod config;
mod logger;
mod processors;
mod validators;
mod utils;
mod scheduler;
mod middleware;
mod monitoring;
mod tests;
mod scripts;

use actix_web::{App, HttpServer, middleware, web};
use actix_cors::Cors;
use std::sync::Arc;
use crate::config::Config;
use crate::storage::Storage;
use crate::blockchain::BlockchainManager;
use crate::auth::AuthManager;
use crate::security::SecurityManager;
use crate::monitoring::MonitoringManager;
use crate::middleware::{cors_config, compression_config, logging_config, SecurityMiddleware};
use crate::middleware::input_validation::{
    validate_transaction_request, validate_ble_request, validate_auth_request, validate_compressed_payload_request
};
use crate::api::{
    health, ble_scan, send_tx, send_compressed_tx, compress_transaction, 
    compress_ble_payment, compress_qr_payment, submit_transaction, legacy_submit_transaction
};
use crate::ble::BLEManager;
use crate::logger::Logger;
use std::env;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize logger
    Logger::init().expect("Failed to initialize logger");
    
    // Load configuration
    let config = Config::new().expect("Failed to load configuration");
    
    // Initialize storage
    let storage = Arc::new(Storage::new(&config.database_url).expect("Failed to initialize storage"));
    
    // Initialize blockchain manager
    let blockchain_manager = Arc::new(BlockchainManager::new().expect("Failed to initialize blockchain manager"));
    
    // Initialize auth manager
    let auth_manager = Arc::new(AuthManager::new());
    
    // Initialize security manager
    let security_manager = Arc::new(SecurityManager::new());
    
    // Initialize monitoring manager
    let monitoring_manager = Arc::new(MonitoringManager::new());
    
    // Initialize BLE manager
    let ble_manager = Arc::new(BLEManager::new());
    
    // Get port from environment or use default
    let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string()).parse::<u16>().unwrap_or(8080);
    
    log::info!("Starting AirChainPay Relay Server on port {}", port);
    
    HttpServer::new(move || {
        App::new()
            // Apply middleware
            .wrap(cors_config())
            .wrap(compression_config())
            .wrap(logging_config())
            .wrap(SecurityMiddleware::new())
            
            // Health check endpoint (no validation needed)
            .service(health)
            
            // BLE endpoints with validation
            .service(
                web::scope("/ble")
                    .wrap(validate_ble_request())
                    .service(ble_scan)
            )
            
            // Transaction endpoints with enhanced validation
            .service(
                web::scope("/transaction")
                    .wrap(validate_transaction_request())
                    .service(submit_transaction)
            )
            
            // Compressed transaction endpoints with validation
            .service(
                web::scope("/compressed")
                    .wrap(validate_compressed_payload_request())
                    .service(send_compressed_tx)
            )
            
            // Compression endpoints with validation
            .service(
                web::scope("/compress")
                    .service(compress_transaction)
                    .service(compress_ble_payment)
                    .service(compress_qr_payment)
            )
            
            // Legacy endpoints with validation
            .service(
                web::scope("/api/v1")
                    .wrap(validate_transaction_request())
                    .service(legacy_submit_transaction)
            )
            
            // Direct endpoints with validation
            .service(
                web::scope("/send")
                    .wrap(validate_transaction_request())
                    .service(send_tx)
            )
            
            // Auth endpoints with validation
            .service(
                web::scope("/auth")
                    .wrap(validate_auth_request())
                    // Add auth endpoints here when implemented
            )
            
            // App data
            .app_data(web::Data::new(storage.clone()))
            .app_data(web::Data::new(blockchain_manager.clone()))
            .app_data(web::Data::new(auth_manager.clone()))
            .app_data(web::Data::new(security_manager.clone()))
            .app_data(web::Data::new(monitoring_manager.clone()))
            .app_data(web::Data::new(ble_manager.clone()))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
