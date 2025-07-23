//! Domain layer - entities, repositories, and services
//! 
//! This module contains the domain logic and business rules for the wallet system.
//! It follows Domain-Driven Design principles with clear separation of concerns.

pub mod entities;
pub mod repositories;

// Re-export domain components
pub use entities::*;
pub use repositories::*; 