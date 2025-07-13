use crate::auth::generate_production_secrets;
use std::collections::HashMap;

fn main() {
    println!("Generating production secrets for AirChainPay Relay...");
    
    match generate_production_secrets() {
        Ok(secrets) => {
            println!("✅ Successfully generated production secrets:");
            println!();
            
            for (key, value) in secrets {
                println!("  {}: {}", key, base64::engine::general_purpose::STANDARD.encode(value));
            }
            
            println!();
            println!("🔐 Store these secrets securely in your production environment.");
            println!("⚠️  Never commit these secrets to version control!");
        }
        Err(e) => {
            eprintln!("❌ Failed to generate production secrets: {}", e);
            std::process::exit(1);
        }
    }
} 