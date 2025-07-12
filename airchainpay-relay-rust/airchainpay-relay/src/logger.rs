use tracing::{info, warn, error, debug, Level};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use std::sync::Once;

static INIT: Once = Once::new();

pub struct Logger;

impl Logger {
    pub fn init(log_level: &str) {
        INIT.call_once(|| {
            let level = match log_level.to_lowercase().as_str() {
                "trace" => Level::TRACE,
                "debug" => Level::DEBUG,
                "info" => Level::INFO,
                "warn" => Level::WARN,
                "error" => Level::ERROR,
                _ => Level::INFO,
            };

            tracing_subscriber::registry()
                .with(tracing_subscriber::EnvFilter::new(
                    std::env::var("RUST_LOG").unwrap_or_else(|_| format!("airchainpay_relay={}", level))
                ))
                .with(tracing_subscriber::fmt::layer())
                .init();
        });
    }

    pub fn info(message: &str) {
        info!("{}", message);
    }

    pub fn warn(message: &str) {
        warn!("{}", message);
    }

    pub fn error(message: &str) {
        error!("{}", message);
    }

    pub fn debug(message: &str) {
        debug!("{}", message);
    }

    pub fn transaction_received(tx_hash: &str, chain_id: u64) {
        info!("Transaction received: {} on chain {}", tx_hash, chain_id);
    }

    pub fn transaction_processed(tx_hash: &str, chain_id: u64) {
        info!("Transaction processed: {} on chain {}", tx_hash, chain_id);
    }

    pub fn transaction_failed(tx_hash: &str, error: &str) {
        error!("Transaction failed: {} - {}", tx_hash, error);
    }

    pub fn ble_device_connected(device_id: &str) {
        info!("BLE device connected: {}", device_id);
    }

    pub fn ble_device_disconnected(device_id: &str) {
        warn!("BLE device disconnected: {}", device_id);
    }

    pub fn auth_success(device_id: &str) {
        info!("Authentication successful for device: {}", device_id);
    }

    pub fn auth_failure(device_id: &str, reason: &str) {
        warn!("Authentication failed for device: {} - {}", device_id, reason);
    }

    pub fn security_violation(ip: &str, action: &str) {
        error!("Security violation from {}: {}", ip, action);
    }

    pub fn rate_limit_hit(ip: &str) {
        warn!("Rate limit hit for IP: {}", ip);
    }

    pub fn system_metric(name: &str, value: f64) {
        debug!("System metric: {} = {}", name, value);
    }
} 