/// Transaction signature structure
#[derive(Debug, Clone)]
pub struct TransactionSignature {
    pub r: String,
    pub s: String,
    pub v: u8,
    pub signature: String,
}

impl TransactionSignature {
    pub fn to_hex(&self) -> String {
        format!("0x{}{}{:02x}", self.r, self.s, self.v)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transaction_signature_creation() {
        let signature = TransactionSignature {
            r: "1234567890abcdef".to_string(),
            s: "abcdef1234567890".to_string(),
            v: 27,
            signature: "test_signature".to_string(),
        };
        
        assert_eq!(signature.r, "1234567890abcdef");
        assert_eq!(signature.s, "abcdef1234567890");
        assert_eq!(signature.v, 27);
    }

    #[test]
    fn test_transaction_signature_to_hex() {
        let signature = TransactionSignature {
            r: "1234567890abcdef".to_string(),
            s: "abcdef1234567890".to_string(),
            v: 27,
            signature: "test_signature".to_string(),
        };
        
        let hex = signature.to_hex();
        assert!(hex.starts_with("0x"));
        assert!(hex.contains("1234567890abcdef"));
        assert!(hex.contains("abcdef1234567890"));
    }
} 