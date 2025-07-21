//! Infrastructure layer - platform-specific implementations
//! 
//! This module contains platform-specific implementations and external integrations
//! for the wallet system, including storage, networking, and platform services.

pub mod platform;
// pub mod network;
// pub mod persistence;

// Re-export infrastructure components
pub use platform::*;
// pub use network::*;
// pub use persistence::*; 