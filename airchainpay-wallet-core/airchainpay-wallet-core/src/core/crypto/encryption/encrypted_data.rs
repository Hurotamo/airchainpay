use super::EncryptionAlgorithm;

/// Encrypted data structure
#[derive(Debug, Clone)]
pub struct EncryptedData {
    pub algorithm: EncryptionAlgorithm,
    pub ciphertext: Vec<u8>,
    pub nonce: Vec<u8>,
    pub tag: Vec<u8>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypted_data_creation() {
        let data = EncryptedData {
            algorithm: EncryptionAlgorithm::AES256GCM,
            ciphertext: vec![1, 2, 3, 4],
            nonce: vec![5, 6, 7, 8],
            tag: vec![9, 10, 11, 12],
        };
        
        assert_eq!(data.ciphertext.len(), 4);
        assert_eq!(data.nonce.len(), 4);
        assert_eq!(data.tag.len(), 4);
    }
} 