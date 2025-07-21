/// Encryption algorithms
#[derive(Debug, Clone)]
pub enum EncryptionAlgorithm {
    AES256GCM,
    ChaCha20Poly1305,
} 