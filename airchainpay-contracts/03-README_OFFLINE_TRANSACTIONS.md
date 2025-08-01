# AirChainPay Offline Transaction Support

## Overview

The AirChainPay contracts now support **offline-signed transactions** (meta-transactions) that enable users to sign transactions offline and have them executed by a relay or any third party. This provides true offline payment capability.

## Key Features

✅ **Offline Signing**: Users can sign transactions without internet connection  
✅ **Meta-Transactions**: EIP-712 compliant signature verification  
✅ **Batch Support**: Multiple payments in a single signature  
✅ **Token Support**: Both native and ERC-20 token payments  
✅ **Security**: Nonce-based replay protection and deadline expiration  
✅ **Gasless**: Relayers can pay gas fees on behalf of users  

## Contract Functions

### AirChainPay.sol

#### Direct Transactions (Online)
```solidity
function pay(address to, string calldata paymentReference) external payable
```

#### Offline-Signed Transactions
```solidity
function executeMetaTransaction(
    address from,
    address to,
    uint256 amount,
    string calldata paymentReference,
    uint256 deadline,
    bytes calldata signature
) external payable

function executeBatchMetaTransaction(
    address from,
    address[] calldata recipients,
    uint256[] calldata amounts,
    string calldata paymentReference,
    uint256 deadline,
    bytes calldata signature
) external payable
```

### AirChainPayToken.sol

#### Direct Transactions (Online)
```solidity
function payNative(address to, string calldata paymentReference) external payable
function payToken(address token, address to, uint256 amount, string calldata paymentReference) external
```

#### Offline-Signed Transactions
```solidity
function executeNativeMetaTransaction(
    address from,
    address to,
    uint256 amount,
    string calldata paymentReference,
    uint256 deadline,
    bytes calldata signature
) external payable

function executeTokenMetaTransaction(
    address from,
    address to,
    address token,
    uint256 amount,
    string calldata paymentReference,
    uint256 deadline,
    bytes calldata signature
) external

function executeBatchNativeMetaTransaction(
    address from,
    address[] calldata recipients,
    uint256[] calldata amounts,
    string calldata paymentReference,
    uint256 deadline,
    bytes calldata signature
) external payable

function executeBatchTokenMetaTransaction(
    address from,
    address token,
    address[] calldata recipients,
    uint256[] calldata amounts,
    string calldata paymentReference,
    uint256 deadline,
    bytes calldata signature
) external
```

## Quick Start

### 1. Deploy Contracts
```bash
npx hardhat run scripts/deploy-offline-contracts.js --network <network>
```

### 2. Test Functionality
```bash
npx hardhat test test/OfflineTransactions.test.js
```

### 3. Manual Testing
```bash
npx hardhat run scripts/test-offline-transactions.js --network <network>
```

## Usage Examples

### JavaScript/TypeScript

#### Single Payment (Native Token)
```javascript
const { ethers } = require("ethers");

// 1. Get current nonce
const nonce = await contract.getNonce(userAddress);

// 2. Create the message to sign
const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
const paymentReference = "Payment for services";
const amount = ethers.parseEther("0.1");

// 3. Create struct hash
const PAYMENT_TYPEHASH = await contract.PAYMENT_TYPEHASH();
const structHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address", "address", "uint256", "bytes32", "uint256", "uint256"],
    [
        PAYMENT_TYPEHASH,
        userAddress,
        recipientAddress,
        amount,
        ethers.keccak256(ethers.toUtf8Bytes(paymentReference)),
        nonce,
        deadline
    ]
));

// 4. Get domain separator and create hash to sign
const domainSeparator = await contract.getDomainSeparator();
const hashToSign = ethers.keccak256(ethers.solidityPacked(
    ["string", "bytes32", "bytes32"],
    ["\x19\x01", domainSeparator, structHash]
));

// 5. Sign the hash
const signature = await wallet.signMessage(ethers.getBytes(hashToSign));

// 6. Execute meta-transaction (can be done by anyone)
await contract.executeMetaTransaction(
    userAddress,
    recipientAddress,
    amount,
    paymentReference,
    deadline,
    signature,
    { value: amount }
);
```

#### Batch Payment (Native Token)
```javascript
const recipients = [address1, address2, address3];
const amounts = [
    ethers.parseEther("0.1"),
    ethers.parseEther("0.2"),
    ethers.parseEther("0.3")
];
const totalAmount = amounts.reduce((a, b) => a + b, ethers.parseEther("0"));
const deadline = Math.floor(Date.now() / 1000) + 3600;
const paymentReference = "Batch payment";

// Create batch struct hash
const BATCH_PAYMENT_TYPEHASH = ethers.keccak256("BatchPayment(address from,address[] recipients,uint256[] amounts,string paymentReference,uint256 nonce,uint256 deadline)");
const structHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address", "bytes32", "bytes32", "bytes32", "uint256", "uint256"],
    [
        BATCH_PAYMENT_TYPEHASH,
        userAddress,
        ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [recipients])),
        ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint256[]"], [amounts])),
        ethers.keccak256(ethers.toUtf8Bytes(paymentReference)),
        nonce,
        deadline
    ]
));

const domainSeparator = await contract.getDomainSeparator();
const hashToSign = ethers.keccak256(ethers.solidityPacked(
    ["string", "bytes32", "bytes32"],
    ["\x19\x01", domainSeparator, structHash]
));

const signature = await wallet.signMessage(ethers.getBytes(hashToSign));

await contract.executeBatchMetaTransaction(
    userAddress,
    recipients,
    amounts,
    paymentReference,
    deadline,
    signature,
    { value: totalAmount }
);
```

#### Token Payment (ERC-20)
```javascript
const tokenAddress = "0x..."; // ERC-20 token address
const amount = ethers.parseEther("100"); // 100 tokens

// Create token struct hash
const TOKEN_PAYMENT_TYPEHASH = await contract.TOKEN_PAYMENT_TYPEHASH();
const structHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address", "address", "address", "uint256", "bytes32", "uint256", "uint256"],
    [
        TOKEN_PAYMENT_TYPEHASH,
        userAddress,
        recipientAddress,
        tokenAddress,
        amount,
        ethers.keccak256(ethers.toUtf8Bytes(paymentReference)),
        nonce,
        deadline
    ]
));

const domainSeparator = await contract.getDomainSeparator();
const hashToSign = ethers.keccak256(ethers.solidityPacked(
    ["string", "bytes32", "bytes32"],
    ["\x19\x01", domainSeparator, structHash]
));

const signature = await wallet.signMessage(ethers.getBytes(hashToSign));

await contract.executeTokenMetaTransaction(
    userAddress,
    recipientAddress,
    tokenAddress,
    amount,
    paymentReference,
    deadline,
    signature
);
```

### Rust (for relay server)

```rust
use ethers::prelude::*;
use ethers::signers::{LocalWallet, Signer};

// Create the message to sign
let nonce = contract.get_nonce(user_address).call().await?;
let deadline = chrono::Utc::now().timestamp() + 3600;
let payment_reference = "Payment for services";
let amount = U256::from(ethers::utils::parse_units("0.1", 18)?);

// Create struct hash
let payment_typehash = contract.payment_typehash().call().await?;
let struct_hash = ethers::utils::keccak256(abi::encode(&[
    payment_typehash.into(),
    user_address.into(),
    recipient_address.into(),
    amount.into(),
    ethers::utils::keccak256(payment_reference.as_bytes()).into(),
    nonce.into(),
    deadline.into(),
]));

// Get domain separator and create hash to sign
let domain_separator = contract.get_domain_separator().call().await?;
let hash_to_sign = ethers::utils::keccak256(abi::encode(&[
    "\x19\x01".as_bytes(),
    domain_separator,
    struct_hash,
]));

// Sign the hash
let signature = wallet.sign_message(hash_to_sign).await?;

// Execute meta-transaction
contract.execute_meta_transaction(
    user_address,
    recipient_address,
    amount,
    payment_reference,
    deadline,
    signature,
)
.value(amount)
.send()
.await?;
```

## Security Features

### 1. Replay Protection
- Each address has a unique nonce
- Nonce increments with each transaction
- Prevents duplicate transaction execution

### 2. Deadline Protection
- Transactions expire after a specified time
- Prevents stale transaction execution
- Configurable expiration window

### 3. Signature Verification
- EIP-712 compliant signature verification
- Recovers signer address from signature
- Validates signer matches expected address

### 4. Reentrancy Protection
- All meta-transaction functions use `nonReentrant` modifier
- Prevents reentrancy attacks

## Events

### New Events
```solidity
event MetaTransactionExecuted(
    address indexed from,
    address indexed to,
    uint256 amount,
    string paymentReference
);

// Updated Payment event
event Payment(
    address indexed from,
    address indexed to,
    uint256 amount,
    string paymentReference,
    bool isRelayed  // New field
);
```

## Integration with Wallet

The wallet application should:

1. **Detect offline mode**: Check network connectivity
2. **Sign transactions**: Create and sign meta-transactions offline
3. **Queue transactions**: Store signed transactions locally
4. **Submit when online**: Send to relay server when connectivity returns

### Wallet Integration Example

```typescript
// In wallet application
async function createOfflineTransaction(request: PaymentRequest) {
    // 1. Get current nonce
    const nonce = await contract.getNonce(userAddress);
    
    // 2. Create and sign transaction
    const signature = await signMetaTransaction(request, nonce);
    
    // 3. Queue for later submission
    await queueTransaction({
        ...request,
        signature,
        nonce,
        deadline: Date.now() + 3600000 // 1 hour
    });
}

async function submitQueuedTransactions() {
    const queued = await getQueuedTransactions();
    
    for (const tx of queued) {
        try {
            await relayService.submitMetaTransaction(tx);
            await removeFromQueue(tx.id);
        } catch (error) {
            console.error('Failed to submit transaction:', error);
        }
    }
}
```

## Benefits

1. **Offline Capability**: Users can make payments without internet
2. **Gas Optimization**: Relayers can batch transactions
3. **User Experience**: Seamless offline-to-online transition
4. **Security**: Cryptographic signature verification
5. **Flexibility**: Support for both native and token payments

## Limitations

1. **Gas Costs**: Relayers must pay gas fees
2. **Complexity**: More complex than direct transactions
3. **Relay Dependency**: Requires relay infrastructure
4. **Signature Management**: Must handle signature storage securely

## Best Practices

1. **Secure Storage**: Store signatures securely in wallet
2. **Nonce Management**: Track nonces carefully to prevent conflicts
3. **Deadline Handling**: Set appropriate deadlines based on use case
4. **Error Handling**: Implement robust error handling for failed submissions
5. **Monitoring**: Monitor relay service health and transaction status

## Testing

Run the comprehensive test suite:

```bash
# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test test/OfflineTransactions.test.js

# Run with coverage
npx hardhat coverage
```

## Deployment

### 1. Deploy to Testnet
```bash
npx hardhat run scripts/deploy-offline-contracts.js --network core-testnet
npx hardhat run scripts/deploy-offline-contracts.js --network base-sepolia
```

### 2. Verify Contracts
```bash
npx hardhat verify --network core-testnet <contract-address>
npx hardhat verify --network base-sepolia <contract-address>
```

### 3. Test on Testnet
```bash
npx hardhat run scripts/test-offline-transactions.js --network core-testnet
```

## Support

For questions or issues with offline transaction functionality:

1. Check the test files for usage examples
2. Review the contract source code for implementation details
3. Run the test suite to verify functionality
4. Check deployment logs for any errors

## Migration from Previous Version

If you're upgrading from the previous version:

1. **Deploy new contracts** with offline transaction support
2. **Update wallet integration** to use new meta-transaction functions
3. **Update relay server** to handle new contract interfaces
4. **Test thoroughly** before going to production
5. **Migrate existing data** if necessary

The new contracts are backward compatible with existing direct transaction functions. 