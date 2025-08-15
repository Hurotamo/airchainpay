// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title P2PEscrow
 * @dev payment contract supporting both native tokens and ERC-20 stablecoins
 * Supports USDC, USDT, and other ERC-20 tokens alongside native currency
 * Now includes offline-signed transaction support via meta-transactions
 */
contract P2PEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    constructor() Ownable(msg.sender) {}

    struct Sale {
        address seller;
        address buyer;
        address token;
        uint256 amount;
        uint256 price;
        string currency;
        bool isPaid;
        bool isFinished;
        bool isCanceled;
        uint256 createdAt;
    }

    struct Master {
        uint256 nextSaleId;
        bool initialized;
    }

    Master public master;
    mapping(uint256 => Sale) public sales;
    mapping(uint256 => address[]) public saleBuyers;
    mapping(uint256 => mapping(address => bool)) public isBuyerInSale;

    event MasterInitialized();
    event SaleCreated(uint256 indexed saleId, address indexed seller, uint256 amount, uint256 price, string currency);
    event BuyerAdded(uint256 indexed saleId, address indexed buyer);
    event BuyerRemoved(uint256 indexed saleId, address indexed buyer);
    event PaymentMarked(uint256 indexed saleId);
    event PaymentClaimed(uint256 indexed saleId, address indexed buyer);
    event SaleCanceled(uint256 indexed saleId);
    event BuyerForceRemoved(uint256 indexed saleId, address indexed buyer);

    modifier onlyInitialized() {
        require(master.initialized, "Master not initialized");
        _;
    }

    modifier saleExists(uint256 saleId) {
        require(saleId < master.nextSaleId, "Sale does not exist");
        _;
    }

    modifier onlySeller(uint256 saleId) {
        require(sales[saleId].seller == msg.sender, "Not the seller");
        _;
    }

    modifier onlyBuyer(uint256 saleId) {
        require(sales[saleId].buyer == msg.sender, "Not the buyer");
        _;
    }

    modifier saleActive(uint256 saleId) {
        require(!sales[saleId].isCanceled, "Sale is canceled");
        require(!sales[saleId].isFinished, "Sale is finished");
        _;
    }

    function initMaster() external {
        require(!master.initialized, "Master already initialized");
        master.initialized = true;
        master.nextSaleId = 0;
        emit MasterInitialized();
    }

    function createSale(
        address token,
        uint256 amount,
        uint256 price,
        string memory currency
    ) external onlyInitialized nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(price > 0, "Price must be greater than 0");
        require(bytes(currency).length > 0, "Currency cannot be empty");

        uint256 saleId = master.nextSaleId;
        master.nextSaleId++;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        sales[saleId] = Sale({
            seller: msg.sender,
            buyer: address(0),
            token: token,
            amount: amount,
            price: price,
            currency: currency,
            isPaid: false,
            isFinished: false,
            isCanceled: false,
            createdAt: block.timestamp
        });

        emit SaleCreated(saleId, msg.sender, amount, price, currency);
    }

    function addBuyer(uint256 saleId, address buyerAddress) 
        external 
        saleExists(saleId) 
        onlySeller(saleId) 
        saleActive(saleId) 
    {
        require(buyerAddress != address(0), "Invalid buyer address");
        require(buyerAddress != sales[saleId].seller, "Seller cannot be buyer");
        require(!isBuyerInSale[saleId][buyerAddress], "Buyer already added");

        saleBuyers[saleId].push(buyerAddress);
        isBuyerInSale[saleId][buyerAddress] = true;

        if (sales[saleId].buyer == address(0)) {
            sales[saleId].buyer = buyerAddress;
        }

        emit BuyerAdded(saleId, buyerAddress);
    }

    function removeBuyer(uint256 saleId, address buyerAddress) 
        external 
        saleExists(saleId) 
        onlySeller(saleId) 
        saleActive(saleId) 
    {
        require(isBuyerInSale[saleId][buyerAddress], "Buyer not in sale");
        require(!sales[saleId].isPaid, "Cannot remove buyer after payment");

        isBuyerInSale[saleId][buyerAddress] = false;

        address[] storage buyers = saleBuyers[saleId];
        for (uint256 i = 0; i < buyers.length; i++) {
            if (buyers[i] == buyerAddress) {
                buyers[i] = buyers[buyers.length - 1];
                buyers.pop();
                break;
            }
        }

        if (sales[saleId].buyer == buyerAddress) {
            sales[saleId].buyer = buyers.length > 0 ? buyers[0] : address(0);
        }

        emit BuyerRemoved(saleId, buyerAddress);
    }

    function markPaid(uint256 saleId) 
        external 
        saleExists(saleId) 
        onlyBuyer(saleId) 
        saleActive(saleId) 
    {
        require(!sales[saleId].isPaid, "Already marked as paid");
        
        sales[saleId].isPaid = true;
        emit PaymentMarked(saleId);
    }

    function claimPayment(uint256 saleId) 
        external 
        saleExists(saleId) 
        onlyBuyer(saleId) 
        saleActive(saleId) 
        nonReentrant 
    {
        require(sales[saleId].isPaid, "Payment not marked as paid");
        require(!sales[saleId].isFinished, "Payment already claimed");

        sales[saleId].isFinished = true;
        
        IERC20(sales[saleId].token).safeTransfer(
            sales[saleId].buyer, 
            sales[saleId].amount
        );

        emit PaymentClaimed(saleId, sales[saleId].buyer);
    }

    function cancelSale(uint256 saleId) 
        external 
        saleExists(saleId) 
        onlySeller(saleId) 
        saleActive(saleId) 
        nonReentrant 
    {
        require(!sales[saleId].isPaid, "Cannot cancel after payment");
        
        sales[saleId].isCanceled = true;
        
        IERC20(sales[saleId].token).safeTransfer(
            sales[saleId].seller, 
            sales[saleId].amount
        );

        emit SaleCanceled(saleId);
    }

    function forceRemoveBuyer(uint256 saleId, address buyerAddress) 
        external 
        onlyOwner 
        saleExists(saleId) 
        saleActive(saleId) 
    {
        require(isBuyerInSale[saleId][buyerAddress], "Buyer not in sale");

        isBuyerInSale[saleId][buyerAddress] = false;

        address[] storage buyers = saleBuyers[saleId];
        for (uint256 i = 0; i < buyers.length; i++) {
            if (buyers[i] == buyerAddress) {
                buyers[i] = buyers[buyers.length - 1];
                buyers.pop();
                break;
            }
        }

        if (sales[saleId].buyer == buyerAddress) {
            sales[saleId].buyer = buyers.length > 0 ? buyers[0] : address(0);
        }

        emit BuyerForceRemoved(saleId, buyerAddress);
    }

    function getSale(uint256 saleId) external view returns (Sale memory) {
        return sales[saleId];
    }

    function getSaleBuyers(uint256 saleId) external view returns (address[] memory) {
        return saleBuyers[saleId];
    }

    function getNextSaleId() external view returns (uint256) {
        return master.nextSaleId;
    }
}