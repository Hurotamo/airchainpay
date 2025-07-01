// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/**
 * @title AirChainPay
 * @dev Simple payment contract for AirChainPay offline/online relay system.
 * Allows users to send payments with references and owner to withdraw funds.
 */
contract AirChainPay {
    // Owner of the contract
    address public owner;

    // Emitted when a payment is made
    event Payment(address indexed from, address indexed to, uint256 amount, string paymentReference);
    // Emitted when the owner withdraws funds
    event Withdrawal(address indexed to, uint256 amount);

    // Set the contract owner at deployment
    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Pay another address with a reference string
     * @param to Recipient address
     * @param paymentReference Reference string for the payment
     */
    function pay(address to, string calldata paymentReference) external payable {
        require(to != address(0), "Invalid recipient");
        require(msg.value > 0, "No value sent");
        emit Payment(msg.sender, to, msg.value, paymentReference);
        (bool sent, ) = to.call{value: msg.value}("");
        require(sent, "Transfer failed");
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