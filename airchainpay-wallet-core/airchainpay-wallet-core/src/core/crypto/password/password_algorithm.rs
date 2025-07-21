#[derive(Debug, Clone)]
pub enum PasswordAlgorithm {
    Argon2,
    PBKDF2,
} 