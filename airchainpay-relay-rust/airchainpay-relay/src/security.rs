use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub window_ms: u64,
    pub max_requests: u32,
}

pub fn validate_device_id(device_id: &str) -> bool {
    if device_id.is_empty() || device_id.len() > 100 {
        return false;
    }
    
    // Only allow alphanumeric characters, hyphens, and underscores
    device_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_')
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_device_id_validation() {
        assert!(validate_device_id("device-123"));
        assert!(validate_device_id("device_123"));
        assert!(!validate_device_id("device@123"));
        assert!(!validate_device_id(""));
    }
} 