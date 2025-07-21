/// Secure seed phrase wrapper
#[derive(Debug, Clone)]
pub struct SecureSeedPhrase {
    words: Vec<String>,
}

impl SecureSeedPhrase {
    /// Create a new secure seed phrase
    pub fn new(words: Vec<String>) -> Self {
        Self { words }
    }

    /// Get seed phrase words
    pub fn as_words(&self) -> &[String] {
        &self.words
    }

    /// Get seed phrase as string
    pub fn to_string(&self) -> String {
        self.words.join(" ")
    }
}

impl Drop for SecureSeedPhrase {
    fn drop(&mut self) {
        // Clear the seed phrase when dropped
        for word in &mut self.words {
            *word = String::new();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secure_seed_phrase_creation() {
        let words = vec!["test".to_string(), "seed".to_string(), "phrase".to_string()];
        let seed_phrase = SecureSeedPhrase::new(words);
        assert_eq!(seed_phrase.as_words().len(), 3);
    }

    #[test]
    fn test_secure_seed_phrase_to_string() {
        let words = vec!["test".to_string(), "seed".to_string(), "phrase".to_string()];
        let seed_phrase = SecureSeedPhrase::new(words);
        assert_eq!(seed_phrase.to_string(), "test seed phrase");
    }
} 