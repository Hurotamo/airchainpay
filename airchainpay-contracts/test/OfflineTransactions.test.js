const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AirChainPay Offline Transactions", function () {
  let airChainPay, airChainPayToken, mockToken;
  let owner, user1, user2, user3;
  let ownerAddress, user1Address, user2Address, user3Address;

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    user1Address = await user1.getAddress();
    user2Address = await user2.getAddress();
    user3Address = await user3.getAddress();

    // Deploy contracts
    const AirChainPay = await ethers.getContractFactory("AirChainPay");
    const AirChainPayToken = await ethers.getContractFactory("AirChainPayToken");
    const MockERC20 = await ethers.getContractFactory("MockERC20");

    airChainPay = await AirChainPay.deploy();
    airChainPayToken = await AirChainPayToken.deploy();
    mockToken = await MockERC20.deploy("Test Token", "TEST");

    await airChainPay.waitForDeployment();
    await airChainPayToken.waitForDeployment();
    await mockToken.waitForDeployment();
  });

  describe("AirChainPay Contract", function () {
    it("Should deploy correctly", async function () {
      expect(await airChainPay.owner()).to.equal(ownerAddress);
      expect(await airChainPay.getNonce(user1Address)).to.equal(0);
    });

    it("Should execute direct payment", async function () {
      const amount = ethers.parseEther("0.1");
      const initialBalance = await ethers.provider.getBalance(user2Address);

      await airChainPay.connect(user1).pay(user2Address, "Direct payment", {
        value: amount
      });

      const finalBalance = await ethers.provider.getBalance(user2Address);
      expect(finalBalance - initialBalance).to.equal(amount);
    });

    it("Should execute meta-transaction", async function () {
      const amount = ethers.parseEther("0.1");
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const paymentReference = "Meta payment test";

      // Get current nonce
      const nonce = await airChainPay.getNonce(user1Address);

      // Create EIP-712 typed data
      const domain = {
        name: "AirChainPay",
        version: "1",
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await airChainPay.getAddress()
      };

      const types = {
        Payment: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "paymentReference", type: "string" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      };

      const value = {
        from: user1Address,
        to: user2Address,
        amount: amount,
        paymentReference: paymentReference,
        nonce: nonce,
        deadline: deadline
      };

      // Sign using EIP-712
      const signature = await user1.signTypedData(domain, types, value);

      // Execute meta-transaction
      const initialBalance = await ethers.provider.getBalance(user2Address);
      await airChainPay.connect(owner).executeMetaTransaction(
        user1Address,
        user2Address,
        amount,
        paymentReference,
        deadline,
        signature,
        { value: amount }
      );

      const finalBalance = await ethers.provider.getBalance(user2Address);
      expect(finalBalance - initialBalance).to.equal(amount);

      // Check nonce was incremented
      expect(await airChainPay.getNonce(user1Address)).to.equal(1);
    });

    it("Should execute batch meta-transaction", async function () {
      const recipients = [user2Address, user3Address];
      const amounts = [ethers.parseEther("0.1"), ethers.parseEther("0.2")];
      const totalAmount = amounts.reduce((a, b) => a + b, ethers.parseEther("0"));
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const paymentReference = "Batch payment test";

      // Get current nonce
      const nonce = await airChainPay.getNonce(user1Address);

      // Create EIP-712 typed data for batch
      const domain = {
        name: "AirChainPay",
        version: "1",
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await airChainPay.getAddress()
      };

      const types = {
        BatchPayment: [
          { name: "from", type: "address" },
          { name: "recipients", type: "address[]" },
          { name: "amounts", type: "uint256[]" },
          { name: "paymentReference", type: "string" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      };

      const value = {
        from: user1Address,
        recipients: recipients,
        amounts: amounts,
        paymentReference: paymentReference,
        nonce: nonce,
        deadline: deadline
      };

      // Sign using EIP-712
      const signature = await user1.signTypedData(domain, types, value);

      // Execute batch meta-transaction
      const initialBalance2 = await ethers.provider.getBalance(user2Address);
      const initialBalance3 = await ethers.provider.getBalance(user3Address);

      await airChainPay.connect(owner).executeBatchMetaTransaction(
        user1Address,
        recipients,
        amounts,
        paymentReference,
        deadline,
        signature,
        { value: totalAmount }
      );

      const finalBalance2 = await ethers.provider.getBalance(user2Address);
      const finalBalance3 = await ethers.provider.getBalance(user3Address);

      expect(finalBalance2 - initialBalance2).to.equal(amounts[0]);
      expect(finalBalance3 - initialBalance3).to.equal(amounts[1]);

      // Check nonce was incremented
      expect(await airChainPay.getNonce(user1Address)).to.equal(1);
    });

    it("Should reject expired transaction", async function () {
      const amount = ethers.parseEther("0.1");
      const deadline = Math.floor(Date.now() / 1000) - 3600; // Expired
      const paymentReference = "Expired payment";

      const nonce = await airChainPay.getNonce(user1Address);

      const domain = {
        name: "AirChainPay",
        version: "1",
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await airChainPay.getAddress()
      };

      const types = {
        Payment: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "paymentReference", type: "string" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      };

      const value = {
        from: user1Address,
        to: user2Address,
        amount: amount,
        paymentReference: paymentReference,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, value);

      await expect(
        airChainPay.connect(owner).executeMetaTransaction(
          user1Address,
          user2Address,
          amount,
          paymentReference,
          deadline,
          signature,
          { value: amount }
        )
      ).to.be.revertedWith("Transaction expired");
    });

    it("Should reject invalid signature", async function () {
      const amount = ethers.parseEther("0.1");
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const paymentReference = "Invalid signature test";

      const nonce = await airChainPay.getNonce(user1Address);

      const domain = {
        name: "AirChainPay",
        version: "1",
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await airChainPay.getAddress()
      };

      const types = {
        Payment: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "paymentReference", type: "string" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      };

      const value = {
        from: user1Address,
        to: user2Address,
        amount: amount,
        paymentReference: paymentReference,
        nonce: nonce,
        deadline: deadline
      };

      // Sign with wrong account
      const signature = await user2.signTypedData(domain, types, value);

      await expect(
        airChainPay.connect(owner).executeMetaTransaction(
          user1Address,
          user2Address,
          amount,
          paymentReference,
          deadline,
          signature,
          { value: amount }
        )
      ).to.be.revertedWith("Invalid signature");
    });
  });

  describe("AirChainPayToken Contract", function () {
    beforeEach(async function () {
      // Add mock token to supported tokens
      await airChainPayToken.addToken(
        await mockToken.getAddress(),
        "TEST",
        false,
        18,
        ethers.parseEther("0.001"),
        ethers.parseEther("100")
      );

      // Mint tokens to user1
      await mockToken.mint(user1Address, ethers.parseEther("10"));
      await mockToken.connect(user1).approve(await airChainPayToken.getAddress(), ethers.parseEther("10"));
    });

    it("Should execute native token meta-transaction", async function () {
      const amount = ethers.parseEther("0.1");
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const paymentReference = "Native meta payment";

      const nonce = await airChainPayToken.getNonce(user1Address);

      const domain = {
        name: "AirChainPayToken",
        version: "1",
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await airChainPayToken.getAddress()
      };

      const types = {
        NativePayment: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "paymentReference", type: "string" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      };

      const value = {
        from: user1Address,
        to: user2Address,
        amount: amount,
        paymentReference: paymentReference,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, value);

      const initialBalance = await ethers.provider.getBalance(user2Address);
      await airChainPayToken.connect(owner).executeNativeMetaTransaction(
        user1Address,
        user2Address,
        amount,
        paymentReference,
        deadline,
        signature,
        { value: amount }
      );

      const finalBalance = await ethers.provider.getBalance(user2Address);
      expect(finalBalance - initialBalance).to.equal(amount);
    });

    it("Should execute token meta-transaction", async function () {
      const amount = ethers.parseEther("1");
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const paymentReference = "Token meta payment";

      const nonce = await airChainPayToken.getNonce(user1Address);

      const domain = {
        name: "AirChainPayToken",
        version: "1",
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await airChainPayToken.getAddress()
      };

      const types = {
        TokenPayment: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "paymentReference", type: "string" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      };

      const value = {
        from: user1Address,
        to: user2Address,
        token: await mockToken.getAddress(),
        amount: amount,
        paymentReference: paymentReference,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, value);

      const initialBalance = await mockToken.balanceOf(user2Address);
      await airChainPayToken.connect(owner).executeTokenMetaTransaction(
        user1Address,
        user2Address,
        await mockToken.getAddress(),
        amount,
        paymentReference,
        deadline,
        signature
      );

      const finalBalance = await mockToken.balanceOf(user2Address);
      // Account for 0.25% fee (997500000000000000 instead of 1000000000000000000)
      const expectedAmount = amount * 9975n / 10000n;
      expect(finalBalance - initialBalance).to.equal(expectedAmount);
    });

    it("Should execute batch native meta-transaction", async function () {
      const recipients = [user2Address, user3Address];
      const amounts = [ethers.parseEther("0.1"), ethers.parseEther("0.2")];
      const totalAmount = amounts.reduce((a, b) => a + b, ethers.parseEther("0"));
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const paymentReference = "Batch native payment";

      const nonce = await airChainPayToken.getNonce(user1Address);

      const domain = {
        name: "AirChainPayToken",
        version: "1",
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await airChainPayToken.getAddress()
      };

      const types = {
        BatchNativePayment: [
          { name: "from", type: "address" },
          { name: "recipients", type: "address[]" },
          { name: "amounts", type: "uint256[]" },
          { name: "paymentReference", type: "string" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      };

      const value = {
        from: user1Address,
        recipients: recipients,
        amounts: amounts,
        paymentReference: paymentReference,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, value);

      const initialBalance2 = await ethers.provider.getBalance(user2Address);
      const initialBalance3 = await ethers.provider.getBalance(user3Address);

      await airChainPayToken.connect(owner).executeBatchNativeMetaTransaction(
        user1Address,
        recipients,
        amounts,
        paymentReference,
        deadline,
        signature,
        { value: totalAmount }
      );

      const finalBalance2 = await ethers.provider.getBalance(user2Address);
      const finalBalance3 = await ethers.provider.getBalance(user3Address);

      expect(finalBalance2 - initialBalance2).to.equal(amounts[0]);
      expect(finalBalance3 - initialBalance3).to.equal(amounts[1]);
    });

    it("Should execute batch token meta-transaction", async function () {
      const recipients = [user2Address, user3Address];
      const amounts = [ethers.parseEther("1"), ethers.parseEther("2")];
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const paymentReference = "Batch token payment";

      const nonce = await airChainPayToken.getNonce(user1Address);

      const domain = {
        name: "AirChainPayToken",
        version: "1",
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await airChainPayToken.getAddress()
      };

      const types = {
        BatchTokenPayment: [
          { name: "from", type: "address" },
          { name: "token", type: "address" },
          { name: "recipients", type: "address[]" },
          { name: "amounts", type: "uint256[]" },
          { name: "paymentReference", type: "string" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      };

      const value = {
        from: user1Address,
        token: await mockToken.getAddress(),
        recipients: recipients,
        amounts: amounts,
        paymentReference: paymentReference,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, value);

      const initialBalance2 = await mockToken.balanceOf(user2Address);
      const initialBalance3 = await mockToken.balanceOf(user3Address);

      await airChainPayToken.connect(owner).executeBatchTokenMetaTransaction(
        user1Address,
        await mockToken.getAddress(),
        recipients,
        amounts,
        paymentReference,
        deadline,
        signature
      );

      const finalBalance2 = await mockToken.balanceOf(user2Address);
      const finalBalance3 = await mockToken.balanceOf(user3Address);

      // Account for 0.25% fee
      const expectedAmount1 = amounts[0] * 9975n / 10000n;
      const expectedAmount2 = amounts[1] * 9975n / 10000n;
      expect(finalBalance2 - initialBalance2).to.equal(expectedAmount1);
      expect(finalBalance3 - initialBalance3).to.equal(expectedAmount2);
    });
  });
}); 