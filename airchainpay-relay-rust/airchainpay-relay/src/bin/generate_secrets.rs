use std::collections::HashMap;
use airchainpay_relay::auth::generate_production_secrets;

fn main() {
    println!("🔐 Generating Production Secrets for AirChainPay Relay");
    println!("=====================================================\n");

    // Generate all production secrets
    let secrets = generate_production_secrets();

    println!("Generated Secrets:");
    println!("==================");

    for (key, value) in &secrets {
        println!("{}={}", key, value);
    }

    println!("\n🔧 Environment Variables Setup:");
    println!("==============================");
    println!("Add these to your .env file or environment:");

    for (key, value) in &secrets {
        println!("export {}={}", key, value);
    }

    println!("\n📝 Docker Environment Setup:");
    println!("============================");
    println!("For Docker deployment, add to your docker-compose.yml:");

    for (key, value) in &secrets {
        println!("      {}: \"{}\"", key, value);
    }

    println!("\n🚀 Kubernetes Secret Setup:");
    println!("===========================");
    println!("Create a Kubernetes secret with these values:");

    for (key, value) in &secrets {
        println!("  {}: {}", key, base64::encode(value));
    }

    println!("\n⚠️  Security Notes:");
    println!("==================");
    println!("1. Keep these secrets secure and never commit them to version control");
    println!("2. Use different secrets for each environment (dev, staging, prod)");
    println!("3. Rotate secrets regularly in production");
    println!("4. Store secrets in a secure vault (HashiCorp Vault, AWS Secrets Manager, etc.)");
    println!("5. The JWT_SECRET should be at least 64 bytes (128 hex characters)");
    println!("6. The API_KEY should be at least 32 bytes (64 hex characters)");

    println!("\n✅ Secret generation complete!");
} 