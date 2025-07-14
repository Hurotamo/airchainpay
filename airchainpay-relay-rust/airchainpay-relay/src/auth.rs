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
    jwt_secret: String,
    device_tokens: HashMap<String, String>,
}

impl AuthManager {
    pub fn new() -> Self {
        let jwt_secret = Self::get_or_generate_jwt_secret();
        
        Self {
            jwt_secret,
            device_tokens: HashMap::new(),
        }
    }

    /// Generate a secure JWT secret
    pub fn generate_jwt_secret() -> String {
        let mut rng = rand::thread_rng();
        let bytes: [u8; 64] = rng.random(); // 512-bit secret
        hex::encode(bytes)
    }

    /// Get JWT secret from environment or generate a new one
    pub fn get_or_generate_jwt_secret() -> String {
        std::env::var("JWT_SECRET").unwrap_or_else(|_| {
            let secret = Self::generate_jwt_secret();
            println!("JWT_SECRET not found in environment, generated new secret: {}", secret);
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
                println!("Failed to generate JWT token: {}", e);
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

    /// Authenticate a device
    pub fn authenticate_device(&self, request: &AuthRequest) -> Result<AuthResponse, Box<dyn std::error::Error>> {
        // Validate device ID
        if request.device_id.is_empty() {
            return Err("Device ID is required".into());
        }

        // Validate public key
        if request.public_key.is_empty() {
            return Err("Public key is required".into());
        }

        // Generate JWT token
        let token = Self::generate_jwt_token(&request.device_id, "device");

        // Store device token
        let mut device_tokens = self.device_tokens.clone();
        device_tokens.insert(request.device_id.clone(), token.clone());

        let expires_at = Utc::now() + Duration::hours(24);

        Ok(AuthResponse {
            token,
            expires_at: expires_at.to_rfc3339(),
            status: "authenticated".to_string(),
        })
    }

    /// Validate API key
    pub fn validate_api_key(&self, api_key: &str) -> bool {
        let expected_api_key = std::env::var("API_KEY").unwrap_or_else(|_| "dev_api_key".to_string());
        api_key == expected_api_key
    }

    /// Generate API key
    pub fn generate_api_key() -> String {
        let mut rng = rand::thread_rng();
        let bytes: [u8; 32] = rng.random(); // 256-bit API key
        hex::encode(bytes)
    }

    /// Get or generate API key
    pub fn get_or_generate_api_key() -> String {
        std::env::var("API_KEY").unwrap_or_else(|_| {
            let api_key = Self::generate_api_key();
            println!("API_KEY not found in environment, generated new key: {}", api_key);
            api_key
        })
    }

    /// Generate secure secrets for production
    pub fn generate_production_secrets() -> HashMap<String, String> {
        let mut secrets = HashMap::new();
        
        // Generate JWT secret
        secrets.insert("JWT_SECRET".to_string(), Self::generate_jwt_secret());
        
        // Generate API key
        secrets.insert("API_KEY".to_string(), Self::generate_api_key());
        
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
        let mut rng = rand::thread_rng();
        let chars: Vec<char> = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".chars().collect();
        
        (0..length)
            .map(|_| chars[rng.random_range(0..chars.len())])
            .collect()
    }

    /// Validate device token
    pub fn validate_device_token(&self, token: &str) -> Result<String, Box<dyn std::error::Error>> {
        let claims = Self::verify_jwt_token(token)?;
        
        // Check if token is for a device
        if claims.typ != "device" {
            return Err("Invalid token type".into());
        }
        
        // Check if token is expired
        let now = Utc::now().timestamp();
        if claims.exp < now {
            return Err("Token expired".into());
        }
        
        Ok(claims.sub)
    }

    /// Refresh device token
    pub fn refresh_device_token(&self, old_token: &str) -> Result<AuthResponse, Box<dyn std::error::Error>> {
        let device_id = self.validate_device_token(old_token)?;
        
        let token = Self::generate_jwt_token(&device_id, "device");
        let expires_at = Utc::now() + Duration::hours(24);

        Ok(AuthResponse {
            token,
            expires_at: expires_at.to_rfc3339(),
            status: "refreshed".to_string(),
        })
    }

    /// Revoke device token
    pub fn revoke_device_token(&self, device_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        // In a real implementation, you would add the token to a blacklist
        // For now, we just log the revocation
        println!("Token revoked for device: {}", device_id);
        Ok(())
    }

    /// Get token info
    pub fn get_token_info(&self, token: &str) -> Result<Claims, Box<dyn std::error::Error>> {
        Self::verify_jwt_token(token)
    }
}

// Public function for generating JWT tokens (used by API endpoints)
pub fn generate_jwt_token(subject: &str, token_type: &str) -> String {
    AuthManager::generate_jwt_token(subject, token_type)
}

// Public function for verifying JWT tokens
pub fn verify_jwt_token(token: &str) -> Result<Claims, Box<dyn std::error::Error>> {
    AuthManager::verify_jwt_token(token)
}

// Public function for generating production secrets
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
        let token = AuthManager::generate_jwt_token("test_device", "device");
        assert!(!token.is_empty());
        
        let claims = AuthManager::verify_jwt_token(&token).unwrap();
        assert_eq!(claims.sub, "test_device");
        assert_eq!(claims.typ, "device");
    }

    #[test]
    fn test_api_key_generation() {
        let api_key1 = AuthManager::generate_api_key();
        let api_key2 = AuthManager::generate_api_key();
        
        assert_eq!(api_key1.len(), 64); // 32 bytes = 64 hex chars
        assert_ne!(api_key1, api_key2); // Should be different each time
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
        assert_eq!(secrets["API_KEY"].len(), 64);
        assert_eq!(secrets["DATABASE_PASSWORD"].len(), 16);
        assert_eq!(secrets["REDIS_PASSWORD"].len(), 16);
        assert_eq!(secrets["ENCRYPTION_KEY"].len(), 32);
    }
} 