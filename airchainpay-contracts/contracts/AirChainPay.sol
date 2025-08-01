// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AirChainPay
 * @dev Enhanced payment contract supporting offline-signed transactions via meta-transactions.
 * Allows users to send payments with references and supports both direct and relayed transactions.
 */
contract AirChainPay is EIP712, ReentrancyGuard {
    using ECDSA for bytes32;

    // Owner of the contract
    address public owner;

    // Meta-transaction domain separator
    bytes32 public constant PAYMENT_TYPEHASH = keccak256(
        "Payment(address from,address to,uint256 amount,string paymentReference,uint256 nonce,uint256 deadline)"
    );

    // Nonce tracking for replay protection
    mapping(address => uint256) public nonces;

    // Emitted when a payment is made
    event Payment(address indexed from, address indexed to, uint256 amount, string paymentReference, bool isRelayed);
    // Emitted when the owner withdraws funds
    event Withdrawal(address indexed to, uint256 amount);
    // Emitted when a meta-transaction is executed
    event MetaTransactionExecuted(address indexed from, address indexed to, uint256 amount, string paymentReference);

    // Set the contract owner at deployment
    constructor() EIP712("AirChainPay", "1") {
        owner = msg.sender;
    }

    /**
     * @dev Pay another address with a reference string (direct transaction)
     * @param to Recipient address
     * @param paymentReference Reference string for the payment
     */
    function pay(address to, string calldata paymentReference) external payable nonReentrant {
        require(to != address(0), "Invalid recipient");
        require(msg.value > 0, "No value sent");
        emit Payment(msg.sender, to, msg.value, paymentReference, false);
        (bool sent, ) = to.call{value: msg.value}("");
        require(sent, "Transfer failed");
    }

    /**
     * @dev Execute a meta-transaction (offline-signed transaction)
     * @param from The address that signed the transaction
     * @param to Recipient address
     * @param amount Payment amount
     * @param paymentReference Reference string for the payment
     * @param deadline Transaction deadline
     * @param signature The signature of the transaction
     */
    function executeMetaTransaction(
        address from,
        address to,
        uint256 amount,
        string calldata paymentReference,
        uint256 deadline,
        bytes calldata signature
    ) external payable nonReentrant {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "No value sent");
        require(msg.value == amount, "Incorrect value sent");
        require(block.timestamp <= deadline, "Transaction expired");
        require(from != address(0), "Invalid from address");

        // Get current nonce before incrementing
        uint256 currentNonce = nonces[from];

        // Verify the signature
        bytes32 structHash = keccak256(abi.encode(
            PAYMENT_TYPEHASH,
            from,
            to,
            amount,
            keccak256(bytes(paymentReference)),
            currentNonce,
            deadline
        ));

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);
        require(signer == from, "Invalid signature");

        // Increment nonce after verification
        nonces[from]++;

        emit Payment(from, to, amount, paymentReference, true);
        emit MetaTransactionExecuted(from, to, amount, paymentReference);
        
        (bool sent, ) = to.call{value: amount}("");
        require(sent, "Transfer failed");
    }

    /**
     * @dev Execute a batch of meta-transactions
     * @param from The address that signed the transactions
     * @param recipients Array of recipient addresses
     * @param amounts Array of payment amounts
     * @param paymentReference Single reference for all payments
     * @param deadline Transaction deadline
     * @param signature The signature of the batch transaction
     */
    function executeBatchMetaTransaction(
        address from,
        address[] calldata recipients,
        uint256[] calldata amounts,
        string calldata paymentReference,
        uint256 deadline,
        bytes calldata signature
    ) external payable nonReentrant {
        require(recipients.length == amounts.length, "Array length mismatch");
        require(recipients.length > 0 && recipients.length <= 10, "Invalid batch size");
        require(block.timestamp <= deadline, "Transaction expired");
        require(from != address(0), "Invalid from address");

        // Calculate total amount
        uint256 totalAmount = 0;
        for (uint i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        require(msg.value == totalAmount, "Incorrect total value");

        // Get current nonce before incrementing
        uint256 currentNonce = nonces[from];

        // Verify the signature for batch transaction
        bytes32 batchTypeHash = keccak256("BatchPayment(address from,address[] recipients,uint256[] amounts,string paymentReference,uint256 nonce,uint256 deadline)");
        bytes32 recipientsHash = keccak256(abi.encodePacked(recipients));
        bytes32 amountsHash = keccak256(abi.encodePacked(amounts));
        bytes32 referenceHash = keccak256(bytes(paymentReference));
        
        bytes32 structHash = keccak256(abi.encode(
            batchTypeHash,
            from,
            recipientsHash,
            amountsHash,
            referenceHash,
            currentNonce,
            deadline
        ));

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);
        require(signer == from, "Invalid signature");

        // Increment nonce after verification
        nonces[from]++;

        // Execute all payments
        for (uint i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "Invalid recipient");
            require(amounts[i] > 0, "Invalid amount");
            
            emit Payment(from, recipients[i], amounts[i], paymentReference, true);
            emit MetaTransactionExecuted(from, recipients[i], amounts[i], paymentReference);
            
            (bool sent, ) = recipients[i].call{value: amounts[i]}("");
            require(sent, "Transfer failed");
        }
    }

    /**
     * @dev Get the current nonce for an address
     * @param user The address to get the nonce for
     * @return The current nonce
     */
    function getNonce(address user) external view returns (uint256) {
        return nonces[user];
    }

    /**
     * @dev Get the domain separator for meta-transactions
     * @return The domain separator
     */
    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @dev Owner can withdraw contract balance
     * @param amount Amount to withdraw (in wei)
     */
    function withdraw(uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        require(address(this).balance >= amount, "Insufficient balance");
        emit Withdrawal(owner, amount);
        (bool sent, ) = owner.call{value: amount}("");
        require(sent, "Withdraw failed");
    }

    // Accept ETH sent directly to contract
    receive() external payable {}
    fallback() external payable {}
} 