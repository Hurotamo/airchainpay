# AirChainPay Solana Program

This is the native Rust Solana program for AirChainPay, providing decentralized payment functionality on the Solana blockchain.

## Features

- **Native Solana Program**: Built with native Solana program library (not Anchor)
- **Payment Processing**: Handle payments with reference strings
- **Program State Management**: Track total payments and volume
- **Authority Controls**: Program owner can withdraw accumulated funds
- **Multi-cluster Support**: Deploy to devnet, testnet, or mainnet-beta

## Architecture

The program consists of several key components:

- **Instructions**: Define available operations (initialize, process payment, withdraw)
- **State Management**: Program state and payment records
- **Processor**: Business logic for handling instructions
- **Error Handling**: Custom error types for better debugging

## Prerequisites

1. **Rust and Cargo**: Install from [rustup.rs](https://rustup.rs/)
2. **Solana CLI**: Install from [Solana docs](https://docs.solana.com/cli/install-solana-cli-tools)
3. **Solana BPF Toolchain**: 
   ```bash
   solana install
   ```

## Building

```bash
# Build the program
cargo build-sbf

# Run tests
cargo test-sbf
```

## Deployment

### Quick Deployment

Use the provided deployment script:

```bash
# Deploy to devnet (default)
./deploy.sh

# Deploy to testnet
./deploy.sh --cluster testnet

# Deploy with custom keypair
./deploy.sh --cluster devnet --keypair /path/to/keypair.json
```

### Manual Deployment

```bash
# Set cluster
solana config set --url devnet

# Deploy program
solana program deploy target/deploy/airchainpay-solana.so
```

## Program Instructions

### 1. Initialize Program

Initialize the program state with an authority account.

**Accounts:**
- `[signer, writable]` Authority account
- `[writable]` Program state account
- `[]` System program
- `[]` Rent sysvar

### 2. Process Payment

Process a payment from payer to recipient with a reference string.

**Accounts:**
- `[signer, writable]` Payer account
- `[writable]` Recipient account
- `[writable]` Payment record account
- `[writable]` Program state account
- `[]` System program
- `[]` Rent sysvar

**Parameters:**
- `amount`: Amount in lamports
- `payment_reference`: Reference string (max 128 characters)

### 3. Withdraw Funds

Withdraw accumulated funds (authority only).

**Accounts:**
- `[signer, writable]` Authority account
- `[writable]` Program state account
- `[writable]` Destination account
- `[]` System program

**Parameters:**
- `amount`: Amount to withdraw in lamports

## State Accounts

### Program State
```rust
pub struct ProgramState {
    pub is_initialized: bool,
    pub authority: Pubkey,
    pub total_payments: u64,
    pub total_volume: u64,
}
```

### Payment Record
```rust
pub struct PaymentRecord {
    pub is_initialized: bool,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub payment_reference: String,
    pub timestamp: i64,
    pub signature: [u8; 64],
}
```

## Error Codes

| Code | Error | Description |
|------|-------|-------------|
| 0 | InvalidInstruction | Invalid instruction provided |
| 1 | NotRentExempt | Account is not rent exempt |
| 2 | ExpectedAmountMismatch | Amount validation failed |
| 3 | AmountOverflow | Arithmetic overflow in amount calculation |
| 4 | InvalidPaymentReference | Payment reference validation failed |
| 5 | Unauthorized | Unauthorized access attempt |
| 6 | InvalidRecipient | Invalid recipient account |
| 7 | InsufficientFunds | Insufficient funds for operation |
| 8 | PaymentReferenceTooLong | Payment reference exceeds maximum length |
| 9 | AccountAlreadyInitialized | Account is already initialized |
| 10 | AccountNotInitialized | Account is not initialized |

## Testing

```bash
# Run unit tests
cargo test

# Run integration tests with Solana test validator
cargo test-sbf
```

## Client Integration

### JavaScript/TypeScript Client

```typescript
import { Connection, PublicKey, Transaction } from '@solana/web3.js';

// Initialize connection
const connection = new Connection('https://api.devnet.solana.com');

// Program ID (replace with your deployed program ID)
const programId = new PublicKey('YOUR_PROGRAM_ID');

// Create payment instruction
const paymentInstruction = await createPaymentInstruction(
  programId,
  payerKeypair.publicKey,
  recipientPublicKey,
  paymentRecordKeypair.publicKey,
  programStatePublicKey,
  amount,
  paymentReference
);

// Send transaction
const transaction = new Transaction().add(paymentInstruction);
const signature = await connection.sendTransaction(transaction, [payerKeypair]);
```

### Rust Client

```rust
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    signature::{Keypair, Signer},
    transaction::Transaction,
};

// Initialize client
let client = RpcClient::new_with_commitment(
    "https://api.devnet.solana.com".to_string(),
    CommitmentConfig::confirmed(),
);

// Create payment instruction
let instruction = process_payment(
    &program_id,
    &payer.pubkey(),
    &recipient,
    &payment_record,
    &program_state,
    amount,
    payment_reference,
)?;

// Send transaction
let transaction = Transaction::new_signed_with_payer(
    &[instruction],
    Some(&payer.pubkey()),
    &[&payer],
    client.get_latest_blockhash()?,
);

let signature = client.send_and_confirm_transaction(&transaction)?;
```

## Deployment Addresses

After deployment, program addresses will be saved in the `deployments/` directory:

- `deployments/devnet.json` - Devnet deployment info
- `deployments/testnet.json` - Testnet deployment info
- `deployments/mainnet-beta.json` - Mainnet deployment info

## Security Considerations

1. **Authority Management**: Only the program authority can withdraw funds
2. **Input Validation**: All inputs are validated before processing
3. **Overflow Protection**: Arithmetic operations use checked math
4. **Account Ownership**: All accounts are verified for proper ownership
5. **Rent Exemption**: All accounts are required to be rent-exempt

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

## Links

- [Solana Documentation](https://docs.solana.com/)
- [Solana Program Library](https://github.com/solana-labs/solana-program-library)
- [AirChainPay Main Repository](../README.md) 