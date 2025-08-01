const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AirChainPay", function () {
  let contract, owner, user1;

  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();
    const AirChainPay = await ethers.getContractFactory("AirChainPay");
    contract = await AirChainPay.deploy();
    await contract.waitForDeployment();
  });

  it("should allow a user to pay another user", async () => {
    const tx = await contract.connect(user1).pay(await contract.getAddress(), "test-ref", { value: ethers.parseEther("1") });
    await expect(tx).to.emit(contract, "Payment").withArgs(user1.address, await contract.getAddress(), ethers.parseEther("1"), "test-ref", false);
  });

  it("should allow owner to withdraw", async () => {
    // Fund contract by calling pay to itself
    await contract.connect(owner).pay(await contract.getAddress(), "funding", { value: ethers.parseEther("2") });
    const tx = await contract.withdraw(ethers.parseEther("1"));
    await expect(tx).to.emit(contract, "Withdrawal").withArgs(owner.address, ethers.parseEther("1"));
  });

  it("should not allow non-owner to withdraw", async () => {
    await expect(contract.connect(user1).withdraw(1)).to.be.revertedWith("Not owner");
  });
}); 