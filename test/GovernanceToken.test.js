const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("GovernanceToken", function () {
    async function deployGovernanceTokenFixture() {
        const [owner, member1, member2, member3] = await ethers.getSigners();

        const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
        const governanceToken = await GovernanceToken.deploy();

        return { governanceToken, owner, member1, member2, member3 };
    }

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            const { governanceToken, owner } = await loadFixture(deployGovernanceTokenFixture);
            const DEFAULT_ADMIN_ROLE = await governanceToken.DEFAULT_ADMIN_ROLE();
            expect(await governanceToken.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
        });

        it("Should have zero total staked initially", async function () {
            const { governanceToken } = await loadFixture(deployGovernanceTokenFixture);
            expect(await governanceToken.totalStaked()).to.equal(0);
        });
    });

    describe("Deposits", function () {
        it("Should allow members to deposit ETH", async function () {
            const { governanceToken, member1 } = await loadFixture(deployGovernanceTokenFixture);

            const depositAmount = ethers.parseEther("1");
            const tx = await governanceToken.connect(member1).deposit({ value: depositAmount });
            await expect(tx).to.emit(governanceToken, "Staked");

            expect(await governanceToken.stakes(member1.address)).to.equal(depositAmount);
        });

        it("Should reject zero deposits", async function () {
            const { governanceToken, member1 } = await loadFixture(deployGovernanceTokenFixture);

            await expect(
                governanceToken.connect(member1).deposit({ value: 0 })
            ).to.be.revertedWith("Must deposit ETH");
        });

        it("Should update total staked correctly", async function () {
            const { governanceToken, member1, member2 } = await loadFixture(deployGovernanceTokenFixture);

            await governanceToken.connect(member1).deposit({ value: ethers.parseEther("1") });
            await governanceToken.connect(member2).deposit({ value: ethers.parseEther("2") });

            expect(await governanceToken.totalStaked()).to.equal(ethers.parseEther("3"));
        });

        it("Should allow multiple deposits from same member", async function () {
            const { governanceToken, member1 } = await loadFixture(deployGovernanceTokenFixture);

            await governanceToken.connect(member1).deposit({ value: ethers.parseEther("1") });
            await governanceToken.connect(member1).deposit({ value: ethers.parseEther("1") });

            expect(await governanceToken.stakes(member1.address)).to.equal(ethers.parseEther("2"));
        });
    });

    describe("Quadratic Voting Power", function () {
        it("Should calculate voting power as sqrt(stake)", async function () {
            const { governanceToken, member1 } = await loadFixture(deployGovernanceTokenFixture);

            // Deposit 100 ETH
            await governanceToken.connect(member1).deposit({ value: ethers.parseEther("100") });

            const votingPower = await governanceToken.getVotingPower(member1.address);
            // sqrt(100 * 10^18) ≈ 10 * 10^9 (10 billion wei, not 10 ether)
            expect(votingPower).to.be.closeTo(BigInt(10000000000), BigInt(100000000));
        });

        it("Should prevent whale dominance", async function () {
            const { governanceToken, member1, member2 } = await loadFixture(deployGovernanceTokenFixture);

            // Whale deposits 100 ETH
            await governanceToken.connect(member1).deposit({ value: ethers.parseEther("100") });
            // Regular member deposits 1 ETH
            await governanceToken.connect(member2).deposit({ value: ethers.parseEther("1") });

            const whalePower = await governanceToken.getVotingPower(member1.address);
            const memberPower = await governanceToken.getVotingPower(member2.address);

            // Whale has 100x stake but only 10x voting power
            // sqrt(100 ETH) / sqrt(1 ETH) = 10
            expect(whalePower / memberPower).to.equal(10n);
        });

        it("Should return zero voting power for zero stake", async function () {
            const { governanceToken, member1 } = await loadFixture(deployGovernanceTokenFixture);

            expect(await governanceToken.getVotingPower(member1.address)).to.equal(0);
        });
    });

    describe("Withdrawals", function () {
        it("Should allow withdrawal of staked ETH", async function () {
            const { governanceToken, member1 } = await loadFixture(deployGovernanceTokenFixture);

            await governanceToken.connect(member1).deposit({ value: ethers.parseEther("2") });

            const balanceBefore = await ethers.provider.getBalance(member1.address);
            const tx = await governanceToken.connect(member1).withdraw(ethers.parseEther("1"));
            const receipt = await tx.wait();
            const gasCost = receipt.gasUsed * receipt.gasPrice;
            const balanceAfter = await ethers.provider.getBalance(member1.address);

            expect(balanceAfter - balanceBefore + gasCost).to.equal(ethers.parseEther("1"));
            expect(await governanceToken.stakes(member1.address)).to.equal(ethers.parseEther("1"));
        });

        it("Should reject withdrawal of more than staked", async function () {
            const { governanceToken, member1 } = await loadFixture(deployGovernanceTokenFixture);

            await governanceToken.connect(member1).deposit({ value: ethers.parseEther("1") });

            await expect(
                governanceToken.connect(member1).withdraw(ethers.parseEther("2"))
            ).to.be.revertedWith("Insufficient stake");
        });

        it("Should reject zero withdrawal", async function () {
            const { governanceToken, member1 } = await loadFixture(deployGovernanceTokenFixture);

            await governanceToken.connect(member1).deposit({ value: ethers.parseEther("1") });

            await expect(
                governanceToken.connect(member1).withdraw(0)
            ).to.be.revertedWith("Amount must be greater than 0");
        });

        it("Should prevent withdrawal with active votes", async function () {
            const { governanceToken, owner, member1 } = await loadFixture(deployGovernanceTokenFixture);

            await governanceToken.connect(member1).deposit({ value: ethers.parseEther("1") });

            // Simulate active vote
            const GOVERNANCE_ROLE = await governanceToken.GOVERNANCE_ROLE();
            await governanceToken.grantRole(GOVERNANCE_ROLE, owner.address);
            await governanceToken.incrementActiveVotes(member1.address);

            await expect(
                governanceToken.connect(member1).withdraw(ethers.parseEther("1"))
            ).to.be.revertedWith("Cannot withdraw with active votes");
        });
    });

    describe("Proposal Creation Requirements", function () {
        it("Should allow proposal creation with minimum stake", async function () {
            const { governanceToken, member1 } = await loadFixture(deployGovernanceTokenFixture);

            await governanceToken.connect(member1).deposit({ value: ethers.parseEther("0.1") });

            expect(await governanceToken.canCreateProposal(member1.address)).to.be.true;
        });

        it("Should prevent proposal creation below minimum stake", async function () {
            const { governanceToken, member1 } = await loadFixture(deployGovernanceTokenFixture);

            await governanceToken.connect(member1).deposit({ value: ethers.parseEther("0.05") });

            expect(await governanceToken.canCreateProposal(member1.address)).to.be.false;
        });
    });

    describe("Active Votes Management", function () {
        it("Should increment active votes", async function () {
            const { governanceToken, owner, member1 } = await loadFixture(deployGovernanceTokenFixture);

            const GOVERNANCE_ROLE = await governanceToken.GOVERNANCE_ROLE();
            await governanceToken.grantRole(GOVERNANCE_ROLE, owner.address);

            await governanceToken.incrementActiveVotes(member1.address);
            expect(await governanceToken.activeVotes(member1.address)).to.equal(1);
        });

        it("Should decrement active votes", async function () {
            const { governanceToken, owner, member1 } = await loadFixture(deployGovernanceTokenFixture);

            const GOVERNANCE_ROLE = await governanceToken.GOVERNANCE_ROLE();
            await governanceToken.grantRole(GOVERNANCE_ROLE, owner.address);

            await governanceToken.incrementActiveVotes(member1.address);
            await governanceToken.decrementActiveVotes(member1.address);

            expect(await governanceToken.activeVotes(member1.address)).to.equal(0);
        });

        it("Should not underflow when decrementing zero votes", async function () {
            const { governanceToken, owner, member1 } = await loadFixture(deployGovernanceTokenFixture);

            const GOVERNANCE_ROLE = await governanceToken.GOVERNANCE_ROLE();
            await governanceToken.grantRole(GOVERNANCE_ROLE, owner.address);

            await governanceToken.decrementActiveVotes(member1.address);
            expect(await governanceToken.activeVotes(member1.address)).to.equal(0);
        });
    });
});
