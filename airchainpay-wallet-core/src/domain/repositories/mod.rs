//! Domain repositories
//! 
//! This module contains repository traits for data access
//! following Domain-Driven Design principles.

pub mod transaction_repository;
pub mod storage_repository;

// Re-export repositories
pub use transaction_repository::*;
pub use storage_repository::*; 