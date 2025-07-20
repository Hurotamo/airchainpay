cd airchainpay-relay-rust/airchainpay-relay
 
  ./scripts/deploy.sh staging validate
 ./scripts/deploy.sh staging build
 ./scripts/deploy.sh staging test
 ./scripts/deploy.sh staging deploy
 cargo run --bin airchainpay-relay

  #if you want to run it from the workspace 
  # From the workspace root
cargo run --bin airchainpay-relay --manifest-path airchainpay-relay-rust/airchainpay-relay/Cargo.toml|



source .env && cargo run --bin airchainpay-relay
PORT=4000 RUST_LOG=debug cargo run --bin airchainpay-relay