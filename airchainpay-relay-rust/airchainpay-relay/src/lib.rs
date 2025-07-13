pub mod airchainpay {
    include!(concat!(env!("OUT_DIR"), "/airchainpay.rs"));
}

pub mod api;
pub mod auth;
pub mod blockchain;
pub mod ble;
pub mod config;
pub mod error;
pub mod middleware;
pub mod monitoring;
pub mod processors;
pub mod security;
pub mod storage;
pub mod tests;
pub mod utils;
pub mod validators;
pub mod scheduler;
pub mod scripts; 