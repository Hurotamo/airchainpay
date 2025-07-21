//! Shared types, utilities, and constants
//! 
//! This module contains common types, utilities, and constants used throughout
//! the wallet core. It provides a centralized location for shared functionality.

pub mod types;
pub mod utils;
pub mod constants;
pub mod error;

// Re-export shared components
pub use types::*;
pub use utils::*;
pub use constants::*;
pub use error::*; 