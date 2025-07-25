use zeroize::Zeroize;

/// Secure seed phrase wrapper
#[derive(Debug, Clone)]
pub struct SecureSeedPhrase {
    phrase: String,
}

impl SecureSeedPhrase {
    /// Create a new secure seed phrase
    pub fn new(phrase: String) -> Self {
        Self { phrase }
    }

    /// Get the seed phrase as a &str
    pub fn as_str(&self) -> &str {
        &self.phrase
    }

    /// Get the seed phrase as `Vec<String>`
    pub fn as_words(&self) -> Vec<String> {
        self.phrase.split_whitespace().map(|s| s.to_string()).collect()
    }
}

impl Drop for SecureSeedPhrase {
    fn drop(&mut self) {
        // Clear the seed phrase when dropped
        self.phrase.zeroize();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use zeroize::Zeroize;

    #[test]
    fn test_secure_seed_phrase_creation() {
        let phrase = "test seed phrase".to_string();
        let seed_phrase = SecureSeedPhrase::new(phrase.clone());
        assert_eq!(seed_phrase.as_words(), vec!["test", "seed", "phrase"]);
        assert_eq!(seed_phrase.as_str(), phrase);
    }
} 