use airchainpay_relay::domain::auth::generate_production_secrets;

use base64::Engine;

fn main() {
    println!("Generating production secrets for AirChainPay Relay...");
    
    let secrets = generate_production_secrets();
    println!("✅ Successfully generated production secrets:");
    println!();
    
    for (key, value) in secrets {
        println!("  {}: {}", key, base64::engine::general_purpose::STANDARD.encode(value));
    }
    
    println!();
    println!("🔐 Store these secrets securely in your production environment.");
    println!("⚠️  Never commit these secrets to version control!");
} 