// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AirChainPayToken
 * @dev Enhanced payment contract supporting both native tokens and ERC-20 stablecoins
 * Supports USDC, USDT, and other ERC-20 tokens alongside native currency
 */
contract AirChainPayToken is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // Supported token types
    enum TokenType { NATIVE, ERC20 }

    // Payment information
    struct Payment {
        address from;
        address to;
        uint256 amount;
        address token; // address(0) for native token
        TokenType tokenType;
        string paymentReference;
        uint256 timestamp;
        bytes32 paymentId;
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
        string paymentReference
    );

    event TokenAdded(address indexed token, string symbol, bool isStablecoin);
    event TokenRemoved(address indexed token);
    event TokenConfigUpdated(address indexed token, uint256 minAmount, uint256 maxAmount);
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

    constructor() Ownable(msg.sender) {
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
     * @dev Process a native token payment
     * @param to Recipient address
     * @param paymentReference Payment reference string
     */
    function payNative(
        address to,
        string calldata paymentReference
    ) external payable nonReentrant {
        if (to == address(0)) revert InvalidRecipient();
        if (msg.value == 0) revert InvalidAmount();
        if (bytes(paymentReference).length == 0) revert InvalidPaymentReference();

        TokenConfig memory config = supportedTokens[address(0)];
        if (!config.isSupported) revert TokenNotSupported();
        if (msg.value < config.minAmount || msg.value > config.maxAmount) revert InvalidAmount();

        // Calculate fee
        uint256 fee = (msg.value * nativeFeeRate) / 10000;
        uint256 netAmount = msg.value - fee;

        // Create payment record
        bytes32 paymentId = keccak256(abi.encodePacked(
            msg.sender,
            to,
            msg.value,
            address(0),
            block.timestamp,
            totalPayments
        ));

        payments[paymentId] = Payment({
            from: msg.sender,
            to: to,
            amount: msg.value,
            token: address(0),
            tokenType: TokenType.NATIVE,
            paymentReference: paymentReference,
            timestamp: block.timestamp,
            paymentId: paymentId
        });

        // Update statistics
        totalPayments++;
        userPaymentCount[msg.sender]++;
        totalNativeVolume += msg.value;

        // Transfer to recipient
        (bool success, ) = to.call{value: netAmount}("");
        if (!success) revert TransferFailed();

        emit PaymentProcessed(
            paymentId,
            msg.sender,
            to,
            msg.value,
            address(0),
            TokenType.NATIVE,
            paymentReference
        );
    }

    /**
     * @dev Process an ERC-20 token payment
     * @param token Token contract address
     * @param to Recipient address
     * @param amount Payment amount
     * @param paymentReference Payment reference string
     */
    function payToken(
        address token,
        address to,
        uint256 amount,
        string calldata paymentReference
    ) external nonReentrant {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (bytes(paymentReference).length == 0) revert InvalidPaymentReference();

        TokenConfig memory config = supportedTokens[token];
        if (!config.isSupported) revert TokenNotSupported();
        if (amount < config.minAmount || amount > config.maxAmount) revert InvalidAmount();

        IERC20 tokenContract = IERC20(token);
        
        // Check user balance and allowance
        if (tokenContract.balanceOf(msg.sender) < amount) revert InsufficientBalance();
        if (tokenContract.allowance(msg.sender, address(this)) < amount) revert InsufficientBalance();

        // Calculate fee
        uint256 fee = (amount * tokenFeeRate) / 10000;
        uint256 netAmount = amount - fee;

        // Create payment record
        bytes32 paymentId = keccak256(abi.encodePacked(
            msg.sender,
            to,
            amount,
            token,
            block.timestamp,
            totalPayments
        ));

        payments[paymentId] = Payment({
            from: msg.sender,
            to: to,
            amount: amount,
            token: token,
            tokenType: TokenType.ERC20,
            paymentReference: paymentReference,
            timestamp: block.timestamp,
            paymentId: paymentId
        });

        // Update statistics
        totalPayments++;
        userPaymentCount[msg.sender]++;
        totalTokenVolume[token] += amount;

        // Transfer tokens
        tokenContract.safeTransferFrom(msg.sender, to, netAmount);
        
        // Transfer fee to contract (if any)
        if (fee > 0) {
            tokenContract.safeTransferFrom(msg.sender, address(this), fee);
        }

        emit PaymentProcessed(
            paymentId,
            msg.sender,
            to,
            amount,
            token,
            TokenType.ERC20,
            paymentReference
        );
    }

    /**
     * @dev Batch payment function for multiple recipients
     * @param token Token address (address(0) for native)
     * @param recipients Array of recipient addresses
     * @param amounts Array of payment amounts
     * @param paymentReference Single reference for all payments
     */
    function batchPay(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts,
        string calldata paymentReference
    ) external payable nonReentrant {
        require(recipients.length == amounts.length, "Array length mismatch");
        require(recipients.length > 0 && recipients.length <= 50, "Invalid batch size");

        if (token == address(0)) {
            // Native token batch payment
            uint256 totalAmount = 0;
            for (uint i = 0; i < amounts.length; i++) {
                totalAmount += amounts[i];
            }
            require(msg.value == totalAmount, "Incorrect total amount");

            for (uint i = 0; i < recipients.length; i++) {
                _processNativePayment(recipients[i], amounts[i], paymentReference);
            }
        } else {
            // ERC-20 token batch payment
            for (uint i = 0; i < recipients.length; i++) {
                _processTokenPayment(token, recipients[i], amounts[i], paymentReference);
            }
        }
    }

    /**
     * @dev Internal function to process native payment
     */
    function _processNativePayment(
        address to,
        uint256 amount,
        string memory paymentReference
    ) internal {
        TokenConfig memory config = supportedTokens[address(0)];
        require(config.isSupported && amount >= config.minAmount && amount <= config.maxAmount, "Invalid amount");

        uint256 fee = (amount * nativeFeeRate) / 10000;
        uint256 netAmount = amount - fee;

        (bool success, ) = to.call{value: netAmount}("");
        require(success, "Transfer failed");

        // Create payment record and emit event (simplified for batch)
        bytes32 paymentId = keccak256(abi.encodePacked(
            msg.sender, to, amount, address(0), block.timestamp, totalPayments
        ));
        
        totalPayments++;
        userPaymentCount[msg.sender]++;
        totalNativeVolume += amount;

        emit PaymentProcessed(paymentId, msg.sender, to, amount, address(0), TokenType.NATIVE, paymentReference);
    }

    /**
     * @dev Internal function to process token payment
     */
    function _processTokenPayment(
        address token,
        address to,
        uint256 amount,
        string memory paymentReference
    ) internal {
        TokenConfig memory config = supportedTokens[token];
        require(config.isSupported && amount >= config.minAmount && amount <= config.maxAmount, "Invalid amount");

        IERC20 tokenContract = IERC20(token);
        uint256 fee = (amount * tokenFeeRate) / 10000;
        uint256 netAmount = amount - fee;

        tokenContract.safeTransferFrom(msg.sender, to, netAmount);
        if (fee > 0) {
            tokenContract.safeTransferFrom(msg.sender, address(this), fee);
        }

        // Create payment record and emit event (simplified for batch)
        bytes32 paymentId = keccak256(abi.encodePacked(
            msg.sender, to, amount, token, block.timestamp, totalPayments
        ));
        
        totalPayments++;
        userPaymentCount[msg.sender]++;
        totalTokenVolume[token] += amount;

        emit PaymentProcessed(paymentId, msg.sender, to, amount, token, TokenType.ERC20, paymentReference);
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
     * @dev Get payment details
     */
    function getPayment(bytes32 paymentId) external view returns (Payment memory) {
        return payments[paymentId];
    }

    /**
     * @dev Get user payment statistics
     */
    function getUserStats(address user) external view returns (
        uint256 paymentCount,
        uint256 totalSent
    ) {
        return (userPaymentCount[user], totalSent); // Note: totalSent would need additional tracking
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