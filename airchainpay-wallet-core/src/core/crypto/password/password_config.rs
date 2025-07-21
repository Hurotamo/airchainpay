use super::PasswordAlgorithm;

/// Password hashing configuration
pub struct PasswordConfig {
    pub algorithm: PasswordAlgorithm,
    pub salt_length: usize,
    pub iterations: u32,
    pub memory_cost: u32,
    pub parallelism: u32,
}

impl Default for PasswordConfig {
    fn default() -> Self {
        Self {
            algorithm: PasswordAlgorithm::Argon2,
            salt_length: 32,
            iterations: 100_000,
            memory_cost: 65536, // 64MB
            parallelism: 4,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_password_config_default() {
        let config = PasswordConfig::default();
        assert_eq!(config.salt_length, 32);
        assert_eq!(config.iterations, 100_000);
        assert_eq!(config.memory_cost, 65536);
        assert_eq!(config.parallelism, 4);
    }
} 