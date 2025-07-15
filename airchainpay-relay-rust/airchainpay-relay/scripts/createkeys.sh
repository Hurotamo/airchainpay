# Navigate to the relay directory
cd airchainpay-relay-rust/airchainpay-relay

# Generate individual keys manually
openssl rand -hex 32    # API_KEY
openssl rand -hex 64    # JWT_SECRET  
openssl rand -hex 24    # DB_PASSWORD
openssl rand -hex 32    # ENCRYPTION_KEY

# Navigate to the relay directory
cd airchainpay-relay-rust/airchainpay-relay

# Run the generate keys script for development
./scripts/generate_secrets.sh dev

# Or for staging
./scripts/generate_secrets.sh staging

# Or for production
./scripts/generate_secrets.sh prod

# Using the Rust binary
# Navigate to the relay directory
cd airchainpay-relay-rust/airchainpay-relay

# Run the generate_secrets binary
cargo run --bin generate_secrets

# Using the createkeys script
# Navigate to the relay directory
cd airchainpay-relay-rust/airchainpay-relay

# Run the createkeys script
./scripts/createkeys.sh