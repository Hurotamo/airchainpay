//! Password management for the wallet core
//!
//! This module handles password hashing, verification, and generation.

pub mod password_hasher;
pub mod password_config;
pub mod password_algorithm;

// Re-export all public items from submodules
pub use password_hasher::*;
pub use password_config::*;
pub use password_algorithm::*; 