const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("GovernanceProposal", function () {
    async function deployGovernanceFixture() {
        const [owner, member1, member2, member3, recipient] = await ethers.getSigners();

        // Deploy GovernanceToken
        const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
        const governanceToken = await GovernanceToken.deploy();

        // Deploy GovernanceProposal
        const GovernanceProposal = await ethers.getContractFactory("GovernanceProposal");
        const governanceProposal = await GovernanceProposal.deploy(await governanceToken.getAddress());

        // Grant governance role to proposal contract
        const GOVERNANCE_ROLE = await governanceToken.GOVERNANCE_ROLE();
        await governanceToken.grantRole(GOVERNANCE_ROLE, await governanceProposal.getAddress());

        // Setup members with stakes
        await governanceToken.connect(member1).deposit({ value: ethers.parseEther("100") }); // 10 voting power
        await governanceToken.connect(member2).deposit({ value: ethers.parseEther("25") });  // 5 voting power
        await governanceToken.connect(member3).deposit({ value: ethers.parseEther("9") });   // 3 voting power

        return { governanceToken, governanceProposal, owner, member1, member2, member3, recipient };
    }

    describe("Proposal Creation", function () {
        it("Should create HIGH_CONVICTION proposal for > 10 ETH", async function () {
            const { governanceProposal, member1, recipient } = await loadFixture(deployGovernanceFixture);

            const proposalId = await governanceProposal.connect(member1).createProposal.staticCall(
                0, // HIGH_CONVICTION
                recipient.address,
                ethers.parseEther("15"),
                "Major investment in DeFi protocol"
            );

            await expect(governanceProposal.connect(member1).createProposal(
                0,
                recipient.address,
                ethers.parseEther("15"),
                "Major investment in DeFi protocol"
            )).to.emit(governanceProposal, "ProposalCreated");

            expect(proposalId).to.equal(1);
        });

        it("Should create EXPERIMENTAL proposal for 1-10 ETH", async function () {
            const { governanceProposal, member1, recipient } = await loadFixture(deployGovernanceFixture);

            await governanceProposal.connect(member1).createProposal(
                1, // EXPERIMENTAL
                recipient.address,
                ethers.parseEther("5"),
                "Experimental NFT project"
            );

            const proposal = await governanceProposal.getProposal(1);
            expect(proposal.proposalType).to.equal(1);
        });

        it("Should create OPERATIONAL proposal for < 1 ETH", async function () {
            const { governanceProposal, member1, recipient } = await loadFixture(deployGovernanceFixture);

            await governanceProposal.connect(member1).createProposal(
                2, // OPERATIONAL
                recipient.address,
                ethers.parseEther("0.5"),
                "Server costs"
            );

            const proposal = await governanceProposal.getProposal(1);
            expect(proposal.proposalType).to.equal(2);
        });

        it("Should reject proposal from member with insufficient stake", async function () {
            const { governanceProposal, owner, recipient } = await loadFixture(deployGovernanceFixture);

            await expect(
                governanceProposal.connect(owner).createProposal(
                    2,
                    recipient.address,
                    ethers.parseEther("0.5"),
                    "Test"
                )
            ).to.be.revertedWith("Insufficient stake to create proposal");
        });

        it("Should reject HIGH_CONVICTION proposal with amount <= 10 ETH", async function () {
            const { governanceProposal, member1, recipient } = await loadFixture(deployGovernanceFixture);

            await expect(
                governanceProposal.connect(member1).createProposal(
                    0,
                    recipient.address,
                    ethers.parseEther("10"),
                    "Test"
                )
            ).to.be.revertedWith("HIGH_CONVICTION requires > 10 ETH");
        });

        it("Should reject proposal with zero address recipient", async function () {
            const { governanceProposal, member1 } = await loadFixture(deployGovernanceFixture);

            await expect(
                governanceProposal.connect(member1).createProposal(
                    2,
                    ethers.ZeroAddress,
                    ethers.parseEther("0.5"),
                    "Test"
                )
            ).to.be.revertedWith("Invalid recipient");
        });

        it("Should reject proposal with zero amount", async function () {
            const { governanceProposal, member1, recipient } = await loadFixture(deployGovernanceFixture);

            await expect(
                governanceProposal.connect(member1).createProposal(
                    2,
                    recipient.address,
                    0,
                    "Test"
                )
            ).to.be.revertedWith("Amount must be greater than 0");
        });
    });

    describe("Voting", function () {
        it("Should allow voting on active proposal", async function () {
            const { governanceProposal, member1, member2, recipient } = await loadFixture(deployGovernanceFixture);

            await governanceProposal.connect(member1).createProposal(
                2,
                recipient.address,
                ethers.parseEther("0.5"),
                "Test proposal"
            );

            await expect(governanceProposal.connect(member2).vote(1, 1)) // Vote FOR
                .to.emit(governanceProposal, "VoteCast");
        });

        it("Should prevent double voting", async function () {
            const { governanceProposal, member1, member2, recipient } = await loadFixture(deployGovernanceFixture);

            await governanceProposal.connect(member1).createProposal(
                2,
                recipient.address,
                ethers.parseEther("0.5"),
                "Test"
            );

            await governanceProposal.connect(member2).vote(1, 1);

            await expect(
                governanceProposal.connect(member2).vote(1, 1)
            ).to.be.revertedWith("Already voted");
        });

        it("Should prevent voting with zero voting power", async function () {
            const { governanceProposal, member1, owner, recipient } = await loadFixture(deployGovernanceFixture);

            await governanceProposal.connect(member1).createProposal(
                2,
                recipient.address,
                ethers.parseEther("0.5"),
                "Test"
            );

            await expect(
                governanceProposal.connect(owner).vote(1, 1)
            ).to.be.revertedWith("No voting power");
        });

        it("Should count votes correctly", async function () {
            const { governanceProposal, member1, member2, member3, recipient } = await loadFixture(deployGovernanceFixture);

            await governanceProposal.connect(member1).createProposal(
                2,
                recipient.address,
                ethers.parseEther("0.5"),
                "Test"
            );

            await governanceProposal.connect(member1).vote(1, 1); // FOR: 10
            await governanceProposal.connect(member2).vote(1, 0); // AGAINST: 5
            await governanceProposal.connect(member3).vote(1, 2); // ABSTAIN: 3

            const proposal = await governanceProposal.getProposal(1);
            // Check that votes were counted (exact values depend on sqrt calculation)
            expect(proposal.forVotes).to.be.gt(0);
            expect(proposal.againstVotes).to.be.gt(0);
            expect(proposal.abstainVotes).to.be.gt(0);
            // Verify FOR votes > AGAINST votes (member1 has more stake)
            expect(proposal.forVotes).to.be.gt(proposal.againstVotes);
        });

        it("Should prevent voting after voting period ends", async function () {
            const { governanceProposal, member1, member2, recipient } = await loadFixture(deployGovernanceFixture);

            await governanceProposal.connect(member1).createProposal(
                2,
                recipient.address,
                ethers.parseEther("0.5"),
                "Test"
            );

            // Fast forward past voting period (3 days)
            await time.increase(3 * 24 * 60 * 60 + 1);

            await expect(
                governanceProposal.connect(member2).vote(1, 1)
            ).to.be.revertedWith("Voting ended");
        });
    });

    describe("Delegation", function () {
        it("Should allow delegation to another member", async function () {
            const { governanceProposal, member1, member2 } = await loadFixture(deployGovernanceFixture);

            await expect(governanceProposal.connect(member1).delegate(member2.address))
                .to.emit(governanceProposal, "DelegateChanged")
                .withArgs(member1.address, ethers.ZeroAddress, member2.address);

            expect(await governanceProposal.delegates(member1.address)).to.equal(member2.address);
        });

        it("Should prevent delegation to zero address", async function () {
            const { governanceProposal, member1 } = await loadFixture(deployGovernanceFixture);

            await expect(
                governanceProposal.connect(member1).delegate(ethers.ZeroAddress)
            ).to.be.revertedWith("Cannot delegate to zero address");
        });

        it("Should prevent self-delegation", async function () {
            const { governanceProposal, member1 } = await loadFixture(deployGovernanceFixture);

            await expect(
                governanceProposal.connect(member1).delegate(member1.address)
            ).to.be.revertedWith("Cannot delegate to self");
        });

        it("Should prevent circular delegation", async function () {
            const { governanceProposal, member1, member2 } = await loadFixture(deployGovernanceFixture);

            await governanceProposal.connect(member1).delegate(member2.address);

            await expect(
                governanceProposal.connect(member2).delegate(member1.address)
            ).to.be.revertedWith("Circular delegation");
        });

        it("Should allow revoking delegation", async function () {
            const { governanceProposal, member1, member2 } = await loadFixture(deployGovernanceFixture);

            await governanceProposal.connect(member1).delegate(member2.address);

            await expect(governanceProposal.connect(member1).revokeDelegate())
                .to.emit(governanceProposal, "DelegateChanged")
                .withArgs(member1.address, member2.address, ethers.ZeroAddress);
        });

        it("Should reject revoking non-existent delegation", async function () {
            const { governanceProposal, member1 } = await loadFixture(deployGovernanceFixture);

            await expect(
                governanceProposal.connect(member1).revokeDelegate()
            ).to.be.revertedWith("No active delegation");
        });
    });

    describe("Proposal Queueing", function () {
        it("Should queue proposal that meets quorum and threshold", async function () {
            const { governanceProposal, member1, member2, member3, recipient } = await loadFixture(deployGovernanceFixture);

            // Create OPERATIONAL proposal (10% quorum, 51% threshold)
            await governanceProposal.connect(member1).createProposal(
                2,
                recipient.address,
                ethers.parseEther("0.5"),
                "Test"
            );

            // Vote: FOR=15, AGAINST=0 (total power = 18)
            await governanceProposal.connect(member1).vote(1, 1); // 10
            await governanceProposal.connect(member2).vote(1, 1); // 5

            // Fast forward past voting period
            await time.increase(3 * 24 * 60 * 60 + 1);

            await expect(governanceProposal.queueProposal(1))
                .to.emit(governanceProposal, "ProposalQueued");

            const state = await governanceProposal.getProposalState(1);
            expect(state).to.equal(3); // QUEUED
        });

        it("Should defeat proposal that fails quorum", async function () {
            const { governanceProposal, member1, member3, recipient } = await loadFixture(deployGovernanceFixture);

            // Create HIGH_CONVICTION proposal (30% quorum required)
            await governanceProposal.connect(member1).createProposal(
                0,
                recipient.address,
                ethers.parseEther("15"),
                "Test"
            );

            // Only member3 votes (3 voting power out of 18 total = 16.7% < 30%)
            await governanceProposal.connect(member3).vote(1, 1);

            await time.increase(3 * 24 * 60 * 60 + 1);

            await expect(governanceProposal.queueProposal(1))
                .to.emit(governanceProposal, "ProposalDefeated")
                .withArgs(1, "Quorum not met");
        });

        it("Should defeat proposal that fails threshold", async function () {
            const { governanceProposal, member1, member2, member3, recipient } = await loadFixture(deployGovernanceFixture);

            // Create HIGH_CONVICTION proposal (66% threshold required)
            await governanceProposal.connect(member1).createProposal(
                0,
                recipient.address,
                ethers.parseEther("15"),
                "Test"
            );

            // Vote: FOR=10, AGAINST=8 (10/18 = 55.5% < 66%)
            await governanceProposal.connect(member1).vote(1, 1); // 10
            await governanceProposal.connect(member2).vote(1, 0); // 5
            await governanceProposal.connect(member3).vote(1, 0); // 3

            await time.increase(3 * 24 * 60 * 60 + 1);

            await expect(governanceProposal.queueProposal(1))
                .to.emit(governanceProposal, "ProposalDefeated")
                .withArgs(1, "Threshold not met");
        });
    });

    describe("Guardian Functions", function () {
        it("Should allow guardian to cancel proposal", async function () {
            const { governanceProposal, owner, member1, recipient } = await loadFixture(deployGovernanceFixture);

            await governanceProposal.connect(member1).createProposal(
                2,
                recipient.address,
                ethers.parseEther("0.5"),
                "Malicious proposal"
            );

            const GUARDIAN_ROLE = await governanceProposal.GUARDIAN_ROLE();
            await governanceProposal.grantRole(GUARDIAN_ROLE, owner.address);

            await expect(governanceProposal.connect(owner).cancelProposal(1))
                .to.emit(governanceProposal, "ProposalCancelled");

            const state = await governanceProposal.getProposalState(1);
            expect(state).to.equal(5); // CANCELLED
        });
    });

    describe("Threshold Configuration", function () {
        it("Should return correct thresholds for HIGH_CONVICTION", async function () {
            const { governanceProposal } = await loadFixture(deployGovernanceFixture);

            const [quorum, threshold] = await governanceProposal.getThresholds(0);
            expect(quorum).to.equal(30);
            expect(threshold).to.equal(66);
        });

        it("Should return correct thresholds for EXPERIMENTAL", async function () {
            const { governanceProposal } = await loadFixture(deployGovernanceFixture);

            const [quorum, threshold] = await governanceProposal.getThresholds(1);
            expect(quorum).to.equal(20);
            expect(threshold).to.equal(60);
        });

        it("Should return correct thresholds for OPERATIONAL", async function () {
            const { governanceProposal } = await loadFixture(deployGovernanceFixture);

            const [quorum, threshold] = await governanceProposal.getThresholds(2);
            expect(quorum).to.equal(10);
            expect(threshold).to.equal(51);
        });
    });
});
