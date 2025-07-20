//! Domain repositories
//! 
//! This module contains repository traits for data access
//! following Domain-Driven Design principles.

pub mod wallet_repository;
pub mod transaction_repository;
pub mod storage_repository;

// Re-export repositories
pub use wallet_repository::*;
pub use transaction_repository::*;
pub use storage_repository::*; 