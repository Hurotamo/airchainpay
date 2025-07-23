//! Key management for the wallet core
//!
//! This module handles secure generation, storage, and management of cryptographic keys.

pub mod secure_private_key;
pub mod key_manager;
pub mod secure_seed_phrase;

// Re-export all public items from submodules
pub use secure_private_key::*;
pub use key_manager::*;
pub use secure_seed_phrase::*; 