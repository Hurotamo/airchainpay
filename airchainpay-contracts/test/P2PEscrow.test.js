const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("P2PEscrow", function () {
  let p2pEscrow;
  let mockToken;
  let owner;
  let seller;
  let buyer1;
  let buyer2;
  let addrs;

  beforeEach(async function () {
    [owner, seller, buyer1, buyer2, ...addrs] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("Test Token", "TEST");
    await mockToken.waitForDeployment();

    // Deploy P2P Escrow
    const P2PEscrow = await ethers.getContractFactory("P2PEscrow");
    p2pEscrow = await P2PEscrow.deploy();
    await p2pEscrow.waitForDeployment();

    // Mint tokens to seller
    await mockToken.mint(seller.address, ethers.parseEther("1000"));
    
    // Approve escrow contract
    await mockToken.connect(seller).approve(await p2pEscrow.getAddress(), ethers.parseEther("1000"));
  });

  describe("Master Initialization", function () {
    it("Should initialize master", async function () {
      await p2pEscrow.initMaster();
      const master = await p2pEscrow.master();
      expect(master.initialized).to.be.true;
      expect(master.nextSaleId).to.equal(0);
    });

    it("Should not allow double initialization", async function () {
      await p2pEscrow.initMaster();
      await expect(p2pEscrow.initMaster()).to.be.revertedWith("Master already initialized");
    });
  });

  describe("Sale Creation", function () {
    beforeEach(async function () {
      await p2pEscrow.initMaster();
    });

    it("Should create a sale", async function () {
      const amount = ethers.parseEther("100");
      const price = 50000; // $500.00
      const currency = "USD";

      await expect(
        p2pEscrow.connect(seller).createSale(await mockToken.getAddress(), amount, price, currency)
      )
        .to.emit(p2pEscrow, "SaleCreated")
        .withArgs(0, seller.address, amount, price, currency);

      const sale = await p2pEscrow.getSale(0);
      expect(sale.seller).to.equal(seller.address);
      expect(sale.amount).to.equal(amount);
      expect(sale.price).to.equal(price);
      expect(sale.currency).to.equal(currency);
    });

    it("Should transfer tokens to escrow", async function () {
      const amount = ethers.parseEther("100");
      const initialBalance = await mockToken.balanceOf(seller.address);
      
      await p2pEscrow.connect(seller).createSale(await mockToken.getAddress(), amount, 50000, "USD");
      
      const finalBalance = await mockToken.balanceOf(seller.address);
      const escrowBalance = await mockToken.balanceOf(await p2pEscrow.getAddress());
      
      expect(finalBalance).to.equal(initialBalance - amount);
      expect(escrowBalance).to.equal(amount);
    });
  });

  describe("Buyer Management", function () {
    beforeEach(async function () {
      await p2pEscrow.initMaster();
      await p2pEscrow.connect(seller).createSale(
        await mockToken.getAddress(),
        ethers.parseEther("100"),
        50000,
        "USD"
      );
    });

    it("Should add buyer to sale", async function () {
      await expect(
        p2pEscrow.connect(seller).addBuyer(0, buyer1.address)
      )
        .to.emit(p2pEscrow, "BuyerAdded")
        .withArgs(0, buyer1.address);

      const buyers = await p2pEscrow.getSaleBuyers(0);
      expect(buyers).to.include(buyer1.address);
      
      const sale = await p2pEscrow.getSale(0);
      expect(sale.buyer).to.equal(buyer1.address);
    });

    it("Should remove buyer from sale", async function () {
      await p2pEscrow.connect(seller).addBuyer(0, buyer1.address);
      
      await expect(
        p2pEscrow.connect(seller).removeBuyer(0, buyer1.address)
      )
        .to.emit(p2pEscrow, "BuyerRemoved")
        .withArgs(0, buyer1.address);

      const buyers = await p2pEscrow.getSaleBuyers(0);
      expect(buyers).to.not.include(buyer1.address);
    });

    it("Should force remove buyer (admin only)", async function () {
      await p2pEscrow.connect(seller).addBuyer(0, buyer1.address);
      
      await expect(
        p2pEscrow.connect(owner).forceRemoveBuyer(0, buyer1.address)
      )
        .to.emit(p2pEscrow, "BuyerForceRemoved")
        .withArgs(0, buyer1.address);

      const buyers = await p2pEscrow.getSaleBuyers(0);
      expect(buyers).to.not.include(buyer1.address);
    });
  });

  describe("Payment Flow", function () {
    beforeEach(async function () {
      await p2pEscrow.initMaster();
      await p2pEscrow.connect(seller).createSale(
        await mockToken.getAddress(),
        ethers.parseEther("100"),
        50000,
        "USD"
      );
      await p2pEscrow.connect(seller).addBuyer(0, buyer1.address);
    });

    it("Should mark payment as paid", async function () {
      await expect(
        p2pEscrow.connect(buyer1).markPaid(0)
      )
        .to.emit(p2pEscrow, "PaymentMarked")
        .withArgs(0);

      const sale = await p2pEscrow.getSale(0);
      expect(sale.isPaid).to.be.true;
    });

    it("Should allow buyer to claim payment", async function () {
      await p2pEscrow.connect(buyer1).markPaid(0);
      
      const initialBalance = await mockToken.balanceOf(buyer1.address);
      
      await expect(
        p2pEscrow.connect(buyer1).claimPayment(0)
      )
        .to.emit(p2pEscrow, "PaymentClaimed")
        .withArgs(0, buyer1.address);

      const finalBalance = await mockToken.balanceOf(buyer1.address);
      expect(finalBalance).to.equal(initialBalance + ethers.parseEther("100"));
      
      const sale = await p2pEscrow.getSale(0);
      expect(sale.isFinished).to.be.true;
    });

    it("Should not allow claim without payment marked", async function () {
      await expect(
        p2pEscrow.connect(buyer1).claimPayment(0)
      ).to.be.revertedWith("Payment not marked as paid");
    });
  });

  describe("Sale Cancellation", function () {
    beforeEach(async function () {
      await p2pEscrow.initMaster();
      await p2pEscrow.connect(seller).createSale(
        await mockToken.getAddress(),
        ethers.parseEther("100"),
        50000,
        "USD"
      );
    });

    it("Should allow seller to cancel sale", async function () {
      const initialBalance = await mockToken.balanceOf(seller.address);
      
      await expect(
        p2pEscrow.connect(seller).cancelSale(0)
      )
        .to.emit(p2pEscrow, "SaleCanceled")
        .withArgs(0);

      const finalBalance = await mockToken.balanceOf(seller.address);
      expect(finalBalance).to.equal(initialBalance + ethers.parseEther("100"));
      
      const sale = await p2pEscrow.getSale(0);
      expect(sale.isCanceled).to.be.true;
    });

    it("Should not allow cancel after payment marked", async function () {
      await p2pEscrow.connect(seller).addBuyer(0, buyer1.address);
      await p2pEscrow.connect(buyer1).markPaid(0);
      
      await expect(
        p2pEscrow.connect(seller).cancelSale(0)
      ).to.be.revertedWith("Cannot cancel after payment");
    });
  });
});