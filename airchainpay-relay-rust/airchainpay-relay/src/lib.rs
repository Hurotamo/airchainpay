pub mod airchainpay {
    include!(concat!(env!("OUT_DIR"), "/airchainpay.rs"));
}

pub mod middleware;
pub mod validators;
pub mod scripts;
pub mod infrastructure;
pub mod utils;
pub mod app;
pub mod domain;
pub mod api; 