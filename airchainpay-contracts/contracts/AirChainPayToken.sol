// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title AirChainPayToken
 * @dev Enhanced payment contract supporting both native tokens and ERC-20 stablecoins
 * Supports USDC, USDT, and other ERC-20 tokens alongside native currency
 * Now includes offline-signed transaction support via meta-transactions
 */
contract AirChainPayToken is ReentrancyGuard, Ownable, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // Supported token types
    enum TokenType { NATIVE, ERC20 }

    // Meta-transaction domain separators
    bytes32 public constant NATIVE_PAYMENT_TYPEHASH = keccak256(
        "NativePayment(address from,address to,uint256 amount,string paymentReference,uint256 nonce,uint256 deadline)"
    );
    
    bytes32 public constant TOKEN_PAYMENT_TYPEHASH = keccak256(
        "TokenPayment(address from,address to,address token,uint256 amount,string paymentReference,uint256 nonce,uint256 deadline)"
    );

    // Nonce tracking for replay protection
    mapping(address => uint256) public nonces;

    // Payment information
    struct Payment {
        address from;
        address to;
        uint256 amount;
        address token;
        TokenType tokenType;
        string paymentReference;
        uint256 timestamp;
        bytes32 paymentId;
        bool isRelayed;
    }

    // Token configuration
    struct TokenConfig {
        bool isSupported;
        bool isStablecoin;
        uint8 decimals;
        string symbol;
        uint256 minAmount;
        uint256 maxAmount;
    }

    // State variables
    mapping(address => TokenConfig) public supportedTokens;
    mapping(bytes32 => Payment) public payments;
    mapping(address => uint256) public userPaymentCount;
    
    address[] public tokenList;
    uint256 public totalPayments;
    uint256 public totalNativeVolume;
    mapping(address => uint256) public totalTokenVolume;

    // Fee configuration (in basis points, 100 = 1%)
    uint256 public nativeFeeRate = 0; // No fee for native tokens initially
    uint256 public tokenFeeRate = 25; // 0.25% fee for tokens
    uint256 public constant MAX_FEE_RATE = 500; // Maximum 5% fee

    // Events
    event PaymentProcessed(
        bytes32 indexed paymentId,
        address indexed from,
        address indexed to,
        uint256 amount,
        address token,
        TokenType tokenType,
        string paymentReference,
        bool isRelayed
    );

    event MetaTransactionExecuted(
        address indexed from,
        address indexed to,
        uint256 amount,
        address token,
        TokenType tokenType,
        string paymentReference
    );

    event TokenAdded(address indexed token, string symbol, bool isStablecoin);
    event TokenRemoved(address indexed token);
    event FeeRatesUpdated(uint256 nativeFeeRate, uint256 tokenFeeRate);
    event FeesWithdrawn(address indexed token, uint256 amount);

    // Errors
    error TokenNotSupported();
    error InvalidAmount();
    error InvalidRecipient();
    error InvalidPaymentReference();
    error TransferFailed();
    error InvalidFeeRate();
    error InsufficientBalance();
    error InvalidSignature();
    error TransactionExpired();

    constructor() Ownable(msg.sender) EIP712("AirChainPayToken", "1") {
        // Add native token support (ETH/tCORE)
        supportedTokens[address(0)] = TokenConfig({
            isSupported: true,
            isStablecoin: false,
            decimals: 18,
            symbol: "NATIVE",
            minAmount: 0.001 ether,
            maxAmount: 100 ether
        });
    }

    /**
     * @dev Add support for an ERC-20 token
     * @param token Token contract address
     * @param symbol Token symbol
     * @param isStablecoin Whether this is a stablecoin
     * @param decimals Token decimals
     * @param minAmount Minimum payment amount
     * @param maxAmount Maximum payment amount
     */
    function addToken(
        address token,
        string memory symbol,
        bool isStablecoin,
        uint8 decimals,
        uint256 minAmount,
        uint256 maxAmount
    ) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(!supportedTokens[token].isSupported, "Token already supported");
        require(minAmount > 0 && maxAmount > minAmount, "Invalid amount limits");

        supportedTokens[token] = TokenConfig({
            isSupported: true,
            isStablecoin: isStablecoin,
            decimals: decimals,
            symbol: symbol,
            minAmount: minAmount,
            maxAmount: maxAmount
        });

        tokenList.push(token);
        emit TokenAdded(token, symbol, isStablecoin);
    }

    /**
     * @dev Remove support for a token
     * @param token Token contract address
     */
    function removeToken(address token) external onlyOwner {
        require(token != address(0), "Cannot remove native token");
        require(supportedTokens[token].isSupported, "Token not supported");

        supportedTokens[token].isSupported = false;
        
        // Remove from tokenList
        for (uint i = 0; i < tokenList.length; i++) {
            if (tokenList[i] == token) {
                tokenList[i] = tokenList[tokenList.length - 1];
                tokenList.pop();
                break;
            }
        }

        emit TokenRemoved(token);
    }



    /**
     * @dev Execute a native token meta-transaction (offline-signed)
     * @param from The address that signed the transaction
     * @param to Recipient address
     * @param amount Payment amount
     * @param paymentReference Payment reference string
     * @param deadline Transaction deadline
     * @param signature The signature of the transaction
     */
    function executeNativeMetaTransaction(
        address from,
        address to,
        uint256 amount,
        string calldata paymentReference,
        uint256 deadline,
        bytes calldata signature
    ) external payable nonReentrant {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (bytes(paymentReference).length == 0) revert InvalidPaymentReference();
        if (block.timestamp > deadline) revert TransactionExpired();
        if (from == address(0)) revert InvalidRecipient();
        if (msg.value != amount) revert InvalidAmount();

        TokenConfig memory config = supportedTokens[address(0)];
        if (!config.isSupported) revert TokenNotSupported();
        if (amount < config.minAmount || amount > config.maxAmount) revert InvalidAmount();

        // Get current nonce before incrementing
        uint256 currentNonce = nonces[from];

        // Verify the signature
        bytes32 structHash = keccak256(abi.encode(
            NATIVE_PAYMENT_TYPEHASH,
            from,
            to,
            amount,
            keccak256(bytes(paymentReference)),
            currentNonce,
            deadline
        ));

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);
        if (signer != from) revert InvalidSignature();

        // Increment nonce after verification
        nonces[from]++;

        // Calculate fee
        uint256 fee = (amount * nativeFeeRate) / 10000;
        uint256 netAmount = amount - fee;

        // Create payment record
        bytes32 paymentId = keccak256(abi.encodePacked(
            from,
            to,
            amount,
            address(0),
            block.timestamp,
            totalPayments
        ));

        payments[paymentId] = Payment({
            from: from,
            to: to,
            amount: amount,
            token: address(0),
            tokenType: TokenType.NATIVE,
            paymentReference: paymentReference,
            timestamp: block.timestamp,
            paymentId: paymentId,
            isRelayed: true
        });

        // Update statistics
        totalPayments++;
        userPaymentCount[from]++;
        totalNativeVolume += amount;

        // Transfer to recipient
        (bool success, ) = to.call{value: netAmount}("");
        if (!success) revert TransferFailed();

        emit PaymentProcessed(
            paymentId,
            from,
            to,
            amount,
            address(0),
            TokenType.NATIVE,
            paymentReference,
            true
        );

        emit MetaTransactionExecuted(from, to, amount, address(0), TokenType.NATIVE, paymentReference);
    }



    /**
     * @dev Execute an ERC-20 token meta-transaction (offline-signed)
     * @param from The address that signed the transaction
     * @param to Recipient address
     * @param token Token contract address
     * @param amount Payment amount
     * @param paymentReference Payment reference string
     * @param deadline Transaction deadline
     * @param signature The signature of the transaction
     */
    function executeTokenMetaTransaction(
        address from,
        address to,
        address token,
        uint256 amount,
        string calldata paymentReference,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (bytes(paymentReference).length == 0) revert InvalidPaymentReference();
        if (block.timestamp > deadline) revert TransactionExpired();
        if (from == address(0)) revert InvalidRecipient();

        TokenConfig memory config = supportedTokens[token];
        if (!config.isSupported) revert TokenNotSupported();
        if (amount < config.minAmount || amount > config.maxAmount) revert InvalidAmount();

        // Get current nonce before incrementing
        uint256 currentNonce = nonces[from];

        // Verify the signature
        bytes32 structHash = keccak256(abi.encode(
            TOKEN_PAYMENT_TYPEHASH,
            from,
            to,
            token,
            amount,
            keccak256(bytes(paymentReference)),
            currentNonce,
            deadline
        ));

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);
        if (signer != from) revert InvalidSignature();

        // Increment nonce after verification
        nonces[from]++;

        IERC20 tokenContract = IERC20(token);
        
        // Check user balance and allowance
        if (tokenContract.balanceOf(from) < amount) revert InsufficientBalance();
        if (tokenContract.allowance(from, address(this)) < amount) revert InsufficientBalance();

        // Calculate fee
        uint256 fee = (amount * tokenFeeRate) / 10000;
        uint256 netAmount = amount - fee;

        // Create payment record
        bytes32 paymentId = keccak256(abi.encodePacked(
            from,
            to,
            amount,
            token,
            block.timestamp,
            totalPayments
        ));

        payments[paymentId] = Payment({
            from: from,
            to: to,
            amount: amount,
            token: token,
            tokenType: TokenType.ERC20,
            paymentReference: paymentReference,
            timestamp: block.timestamp,
            paymentId: paymentId,
            isRelayed: true
        });

        // Update statistics
        totalPayments++;
        userPaymentCount[from]++;
        totalTokenVolume[token] += amount;

        // Transfer tokens
        tokenContract.safeTransferFrom(from, to, netAmount);
        
        // Transfer fee to contract (if any)
        if (fee > 0) {
            tokenContract.safeTransferFrom(from, address(this), fee);
        }

        emit PaymentProcessed(
            paymentId,
            from,
            to,
            amount,
            token,
            TokenType.ERC20,
            paymentReference,
            true
        );

        emit MetaTransactionExecuted(from, to, amount, token, TokenType.ERC20, paymentReference);
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
     * @dev Execute a batch of native token meta-transactions
     * @param from The address that signed the transactions
     * @param recipients Array of recipient addresses
     * @param amounts Array of payment amounts
     * @param paymentReference Single reference for all payments
     * @param deadline Transaction deadline
     * @param signature The signature of the batch transaction
     */
    function executeBatchNativeMetaTransaction(
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
        bytes32 batchTypeHash = keccak256("BatchNativePayment(address from,address[] recipients,uint256[] amounts,string paymentReference,uint256 nonce,uint256 deadline)");
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
        if (signer != from) revert InvalidSignature();

        // Increment nonce after verification
        nonces[from]++;

        // Execute all payments
        for (uint i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "Invalid recipient");
            require(amounts[i] > 0, "Invalid amount");
            
            TokenConfig memory config = supportedTokens[address(0)];
            if (!config.isSupported) revert TokenNotSupported();
            if (amounts[i] < config.minAmount || amounts[i] > config.maxAmount) revert InvalidAmount();

            uint256 fee = (amounts[i] * nativeFeeRate) / 10000;
            uint256 netAmount = amounts[i] - fee;

            // Create payment record
            bytes32 paymentId = keccak256(abi.encodePacked(
                from, recipients[i], amounts[i], address(0), block.timestamp, totalPayments
            ));

            payments[paymentId] = Payment({
                from: from,
                to: recipients[i],
                amount: amounts[i],
                token: address(0),
                tokenType: TokenType.NATIVE,
                paymentReference: paymentReference,
                timestamp: block.timestamp,
                paymentId: paymentId,
                isRelayed: true
            });

            // Update statistics
            totalPayments++;
            userPaymentCount[from]++;
            totalNativeVolume += amounts[i];

            emit PaymentProcessed(
                paymentId,
                from,
                recipients[i],
                amounts[i],
                address(0),
                TokenType.NATIVE,
                paymentReference,
                true
            );

            emit MetaTransactionExecuted(from, recipients[i], amounts[i], address(0), TokenType.NATIVE, paymentReference);
            
            (bool sent, ) = recipients[i].call{value: netAmount}("");
            if (!sent) revert TransferFailed();
        }
    }

    /**
     * @dev Execute a batch of ERC-20 token meta-transactions
     * @param from The address that signed the transactions
     * @param token Token contract address
     * @param recipients Array of recipient addresses
     * @param amounts Array of payment amounts
     * @param paymentReference Single reference for all payments
     * @param deadline Transaction deadline
     * @param signature The signature of the batch transaction
     */
    function executeBatchTokenMetaTransaction(
        address from,
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts,
        string calldata paymentReference,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        require(recipients.length == amounts.length, "Array length mismatch");
        require(recipients.length > 0 && recipients.length <= 10, "Invalid batch size");
        require(block.timestamp <= deadline, "Transaction expired");
        require(from != address(0), "Invalid from address");

        TokenConfig memory config = supportedTokens[token];
        if (!config.isSupported) revert TokenNotSupported();

        // Get current nonce before incrementing
        uint256 currentNonce = nonces[from];

        // Verify the signature for batch transaction
        bytes32 batchTypeHash = keccak256("BatchTokenPayment(address from,address token,address[] recipients,uint256[] amounts,string paymentReference,uint256 nonce,uint256 deadline)");
        bytes32 recipientsHash = keccak256(abi.encodePacked(recipients));
        bytes32 amountsHash = keccak256(abi.encodePacked(amounts));
        bytes32 referenceHash = keccak256(bytes(paymentReference));
        
        bytes32 structHash = keccak256(abi.encode(
            batchTypeHash,
            from,
            token,
            recipientsHash,
            amountsHash,
            referenceHash,
            currentNonce,
            deadline
        ));

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);
        if (signer != from) revert InvalidSignature();

        // Increment nonce after verification
        nonces[from]++;

        IERC20 tokenContract = IERC20(token);
        uint256 totalAmount = 0;
        for (uint i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }

        // Check user balance and allowance
        if (tokenContract.balanceOf(from) < totalAmount) revert InsufficientBalance();
        if (tokenContract.allowance(from, address(this)) < totalAmount) revert InsufficientBalance();

        // Execute all payments
        for (uint i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "Invalid recipient");
            require(amounts[i] > 0, "Invalid amount");
            if (amounts[i] < config.minAmount || amounts[i] > config.maxAmount) revert InvalidAmount();

            uint256 fee = (amounts[i] * tokenFeeRate) / 10000;
            uint256 netAmount = amounts[i] - fee;

            // Create payment record
            bytes32 paymentId = keccak256(abi.encodePacked(
                from, recipients[i], amounts[i], token, block.timestamp, totalPayments
            ));

            payments[paymentId] = Payment({
                from: from,
                to: recipients[i],
                amount: amounts[i],
                token: token,
                tokenType: TokenType.ERC20,
                paymentReference: paymentReference,
                timestamp: block.timestamp,
                paymentId: paymentId,
                isRelayed: true
            });

            // Update statistics
            totalPayments++;
            userPaymentCount[from]++;
            totalTokenVolume[token] += amounts[i];

            // Transfer tokens
            tokenContract.safeTransferFrom(from, recipients[i], netAmount);
            
            // Transfer fee to contract (if any)
            if (fee > 0) {
                tokenContract.safeTransferFrom(from, address(this), fee);
            }

            emit PaymentProcessed(
                paymentId,
                from,
                recipients[i],
                amounts[i],
                token,
                TokenType.ERC20,
                paymentReference,
                true
            );

            emit MetaTransactionExecuted(from, recipients[i], amounts[i], token, TokenType.ERC20, paymentReference);
        }
    }



    /**
     * @dev Update fee rates (only owner)
     */
    function updateFeeRates(uint256 _nativeFeeRate, uint256 _tokenFeeRate) external onlyOwner {
        if (_nativeFeeRate > MAX_FEE_RATE || _tokenFeeRate > MAX_FEE_RATE) revert InvalidFeeRate();
        
        nativeFeeRate = _nativeFeeRate;
        tokenFeeRate = _tokenFeeRate;
        
        emit FeeRatesUpdated(_nativeFeeRate, _tokenFeeRate);
    }

    /**
     * @dev Withdraw collected fees (only owner)
     */
    function withdrawFees(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            // Withdraw native token fees
            require(address(this).balance >= amount, "Insufficient balance");
            (bool success, ) = owner().call{value: amount}("");
            require(success, "Transfer failed");
        } else {
            // Withdraw ERC-20 token fees
            IERC20(token).safeTransfer(owner(), amount);
        }
        
        emit FeesWithdrawn(token, amount);
    }

    /**
     * @dev Get supported tokens list
     */
    function getSupportedTokens() external view returns (address[] memory) {
        address[] memory allTokens = new address[](tokenList.length + 1);
        allTokens[0] = address(0); // Native token
        
        for (uint i = 0; i < tokenList.length; i++) {
            allTokens[i + 1] = tokenList[i];
        }
        
        return allTokens;
    }

    /**
     * @dev Get token configuration
     */
    function getTokenConfig(address token) external view returns (TokenConfig memory) {
        return supportedTokens[token];
    }



    /**
     * @dev Emergency function to recover stuck tokens
     */
    function emergencyRecover(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = owner().call{value: amount}("");
            require(success, "Recovery failed");
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }

    // Receive function for native token payments
    receive() external payable {}
} 