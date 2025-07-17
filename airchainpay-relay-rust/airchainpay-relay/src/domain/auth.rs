use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};
use chrono::{Utc, Duration};
use rand::Rng;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthRequest {
    pub device_id: String,
    pub public_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub token: String,
    pub expires_at: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // Subject (user ID)
    pub exp: i64,    // Expiration time
    pub iat: i64,    // Issued at
    pub typ: String, // Token type
}

#[derive(Debug, Clone)]
pub struct AuthManager {

}

impl Default for AuthManager {
    fn default() -> Self {
        Self::new()
    }
}

impl AuthManager {
    pub fn new() -> Self {
        Self {

        }
    }

    /// Generate a secure JWT secret
    pub fn generate_jwt_secret() -> String {
        let mut rng = rand::rng();
        let bytes: [u8; 64] = rng.random(); // 512-bit secret
        hex::encode(bytes)
    }

    /// Get JWT secret from environment or generate a new one
    pub fn get_or_generate_jwt_secret() -> String {
        std::env::var("JWT_SECRET").unwrap_or_else(|_| {
            let secret = Self::generate_jwt_secret();
            println!("JWT_SECRET not found in environment, generated new secret: {secret}");
            secret
        })
    }

    /// Generate a JWT token
    pub fn generate_jwt_token(subject: &str, token_type: &str) -> String {
        let secret = Self::get_or_generate_jwt_secret();
        let now = Utc::now();
        let exp = now + Duration::hours(24); // 24 hour expiration

        let claims = Claims {
            sub: subject.to_string(),
            exp: exp.timestamp(),
            iat: now.timestamp(),
            typ: token_type.to_string(),
        };

        match encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(secret.as_ref()),
        ) {
            Ok(token) => token,
            Err(e) => {
                println!("Failed to generate JWT token: {e}");
                String::new()
            }
        }
    }

    /// Verify a JWT token
    pub fn verify_jwt_token(token: &str) -> Result<Claims, Box<dyn std::error::Error>> {
        let secret = Self::get_or_generate_jwt_secret();
        
        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(secret.as_ref()),
            &Validation::default(),
        )?;

        Ok(token_data.claims)
    }

    // Removed authenticate_device method

    /// Generate secure secrets for production
    pub fn generate_production_secrets() -> HashMap<String, String> {
        let mut secrets = HashMap::new();
        
        // Generate JWT secret
        secrets.insert("JWT_SECRET".to_string(), Self::generate_jwt_secret());
        
        // Generate API key
        secrets.insert("API_KEY".to_string(), Self::generate_random_string(32));
        
        // Generate database password
        secrets.insert("DATABASE_PASSWORD".to_string(), Self::generate_random_string(16));
        
        // Generate Redis password
        secrets.insert("REDIS_PASSWORD".to_string(), Self::generate_random_string(16));
        
        // Generate encryption key
        secrets.insert("ENCRYPTION_KEY".to_string(), Self::generate_random_string(32));
        
        secrets
    }

    /// Generate random string
    fn generate_random_string(length: usize) -> String {
        let mut rng = rand::rng();
        let chars: Vec<char> = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".chars().collect();
        
        (0..length)
            .map(|_| chars[rng.random_range(0..chars.len())])
            .collect()
    }


}

// Public function for generating JWT tokens (used by API endpoints)
pub fn generate_jwt_token(subject: &str, token_type: &str) -> String {
    AuthManager::generate_jwt_token(subject, token_type)
}

// Public function for verifying JWT tokens
#[allow(dead_code)]
pub fn verify_jwt_token(token: &str) -> Result<Claims, Box<dyn std::error::Error>> {
    AuthManager::verify_jwt_token(token)
}

// Public function for generating production secrets
#[allow(dead_code)]
pub fn generate_production_secrets() -> HashMap<String, String> {
    AuthManager::generate_production_secrets()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jwt_secret_generation() {
        let secret1 = AuthManager::generate_jwt_secret();
        let secret2 = AuthManager::generate_jwt_secret();
        
        assert_eq!(secret1.len(), 128); // 64 bytes = 128 hex chars
        assert_ne!(secret1, secret2); // Should be different each time
    }

    #[test]
    fn test_jwt_token_generation_and_verification() {
        // Set a consistent JWT secret for this test
        std::env::set_var("JWT_SECRET", "test_secret_for_jwt_verification_1234567890abcdef");
        
        let token = AuthManager::generate_jwt_token("test_device", "device");
        assert!(!token.is_empty());
        
        let claims = AuthManager::verify_jwt_token(&token).unwrap();
        assert_eq!(claims.sub, "test_device");
        assert_eq!(claims.typ, "device");
        
        // Clean up
        std::env::remove_var("JWT_SECRET");
    }

    #[test]
    fn test_production_secrets_generation() {
        let secrets = AuthManager::generate_production_secrets();
        
        assert!(secrets.contains_key("JWT_SECRET"));
        assert!(secrets.contains_key("API_KEY"));
        assert!(secrets.contains_key("DATABASE_PASSWORD"));
        assert!(secrets.contains_key("REDIS_PASSWORD"));
        assert!(secrets.contains_key("ENCRYPTION_KEY"));
        
        assert_eq!(secrets["JWT_SECRET"].len(), 128);
        assert_eq!(secrets["API_KEY"].len(), 32); 
        assert_eq!(secrets["DATABASE_PASSWORD"].len(), 16);
        assert_eq!(secrets["REDIS_PASSWORD"].len(), 16);
        assert_eq!(secrets["ENCRYPTION_KEY"].len(), 32);
    }
} 