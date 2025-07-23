//! Encryption functionality for the wallet core
//!
//! This module handles AES-256-GCM and ChaCha20-Poly1305 encryption for sensitive data.

pub mod encryption_manager;
pub mod encryption_algorithm;
pub mod encrypted_data;

// Re-export all public items from submodules
pub use encryption_manager::*;
pub use encryption_algorithm::*;
pub use encrypted_data::*;

