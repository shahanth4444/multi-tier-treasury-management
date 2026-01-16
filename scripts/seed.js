const hre = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("🌱 Seeding DAO with test data...\n");

    // Load deployment addresses
    if (!fs.existsSync("deployment-addresses.json")) {
        console.error("❌ deployment-addresses.json not found. Please run deploy.js first.");
        process.exit(1);
    }

    const deployment = JSON.parse(fs.readFileSync("deployment-addresses.json", "utf8"));
    const { GovernanceToken, GovernanceProposal, MultiTierTreasury } = deployment.contracts;

    const [deployer, member1, member2, member3, member4, recipient1, recipient2] = await hre.ethers.getSigners();

    // Get contract instances
    const governanceToken = await hre.ethers.getContractAt("GovernanceToken", GovernanceToken);
    const governanceProposal = await hre.ethers.getContractAt("GovernanceProposal", GovernanceProposal);

    console.log("📊 Creating test members with varying stakes...\n");

    // Member 1: Whale (100 ETH stake, 10 voting power)
    console.log("1️⃣  Member 1 (Whale): Depositing 100 ETH...");
    await governanceToken.connect(member1).deposit({ value: hre.ethers.parseEther("100") });
    const member1Power = await governanceToken.getVotingPower(member1.address);
    console.log("   ✅ Stake: 100 ETH | Voting Power:", hre.ethers.formatUnits(member1Power, 9), "(quadratic)");

    // Member 2: Large holder (25 ETH stake, 5 voting power)
    console.log("\n2️⃣  Member 2 (Large): Depositing 25 ETH...");
    await governanceToken.connect(member2).deposit({ value: hre.ethers.parseEther("25") });
    const member2Power = await governanceToken.getVotingPower(member2.address);
    console.log("   ✅ Stake: 25 ETH | Voting Power:", hre.ethers.formatUnits(member2Power, 9), "(quadratic)");

    // Member 3: Medium holder (9 ETH stake, 3 voting power)
    console.log("\n3️⃣  Member 3 (Medium): Depositing 9 ETH...");
    await governanceToken.connect(member3).deposit({ value: hre.ethers.parseEther("9") });
    const member3Power = await governanceToken.getVotingPower(member3.address);
    console.log("   ✅ Stake: 9 ETH | Voting Power:", hre.ethers.formatUnits(member3Power, 9), "(quadratic)");

    // Member 4: Small holder (1 ETH stake, 1 voting power)
    console.log("\n4️⃣  Member 4 (Small): Depositing 1 ETH...");
    await governanceToken.connect(member4).deposit({ value: hre.ethers.parseEther("1") });
    const member4Power = await governanceToken.getVotingPower(member4.address);
    console.log("   ✅ Stake: 1 ETH | Voting Power:", hre.ethers.formatUnits(member4Power, 9), "(quadratic)");

    const totalStaked = await governanceToken.totalStaked();
    const totalVotingPower = await governanceToken.getTotalVotingPower();
    console.log("\n📈 Total Staked:", hre.ethers.formatEther(totalStaked), "ETH");
    console.log("📊 Total Voting Power:", hre.ethers.formatUnits(totalVotingPower, 9), "(quadratic)\n");

    console.log("=".repeat(60));
    console.log("📝 Creating sample proposals...\n");

    // Proposal 1: HIGH_CONVICTION (Major DeFi investment)
    console.log("1️⃣  Creating HIGH_CONVICTION proposal (15 ETH)...");
    const tx1 = await governanceProposal.connect(member1).createProposal(
        0, // HIGH_CONVICTION
        recipient1.address,
        hre.ethers.parseEther("15"),
        "Major investment in Aave protocol - High conviction opportunity"
    );
    await tx1.wait();
    console.log("   ✅ Proposal #1 created: Major DeFi Investment");
    console.log("   📋 Type: HIGH_CONVICTION | Amount: 15 ETH | Quorum: 30% | Threshold: 66%");

    // Proposal 2: EXPERIMENTAL (NFT project)
    console.log("\n2️⃣  Creating EXPERIMENTAL proposal (5 ETH)...");
    const tx2 = await governanceProposal.connect(member2).createProposal(
        1, // EXPERIMENTAL
        recipient2.address,
        hre.ethers.parseEther("5"),
        "Experimental NFT marketplace - Medium risk bet"
    );
    await tx2.wait();
    console.log("   ✅ Proposal #2 created: NFT Marketplace");
    console.log("   📋 Type: EXPERIMENTAL | Amount: 5 ETH | Quorum: 20% | Threshold: 60%");

    // Proposal 3: OPERATIONAL (Server costs)
    console.log("\n3️⃣  Creating OPERATIONAL proposal (0.5 ETH)...");
    const tx3 = await governanceProposal.connect(member3).createProposal(
        2, // OPERATIONAL
        deployer.address,
        hre.ethers.parseEther("0.5"),
        "Monthly server and infrastructure costs"
    );
    await tx3.wait();
    console.log("   ✅ Proposal #3 created: Server Costs");
    console.log("   📋 Type: OPERATIONAL | Amount: 0.5 ETH | Quorum: 10% | Threshold: 51%");

    console.log("\n" + "=".repeat(60));
    console.log("🗳️  Casting votes on proposals...\n");

    // Vote on Proposal 1 (will pass)
    console.log("1️⃣  Voting on Proposal #1 (HIGH_CONVICTION):");
    await governanceProposal.connect(member1).vote(1, 1); // FOR
    console.log("   ✅ Member 1 voted FOR");
    await governanceProposal.connect(member2).vote(1, 1); // FOR
    console.log("   ✅ Member 2 voted FOR");
    await governanceProposal.connect(member3).vote(1, 0); // AGAINST
    console.log("   ✅ Member 3 voted AGAINST");

    // Vote on Proposal 2 (will pass)
    console.log("\n2️⃣  Voting on Proposal #2 (EXPERIMENTAL):");
    await governanceProposal.connect(member1).vote(2, 1); // FOR
    console.log("   ✅ Member 1 voted FOR");
    await governanceProposal.connect(member4).vote(2, 1); // FOR
    console.log("   ✅ Member 4 voted FOR");

    // Vote on Proposal 3 (will pass)
    console.log("\n3️⃣  Voting on Proposal #3 (OPERATIONAL):");
    await governanceProposal.connect(member2).vote(3, 1); // FOR
    console.log("   ✅ Member 2 voted FOR");
    await governanceProposal.connect(member3).vote(3, 1); // FOR
    console.log("   ✅ Member 3 voted FOR");

    console.log("\n" + "=".repeat(60));
    console.log("🤝 Setting up delegation...\n");

    // Member 4 delegates to Member 1
    await governanceProposal.connect(member4).delegate(member1.address);
    console.log("✅ Member 4 delegated voting power to Member 1 (Whale)");

    console.log("\n" + "=".repeat(60));
    console.log("✅ SEEDING COMPLETE!");
    console.log("=".repeat(60));

    console.log("\n📊 DAO Status Summary:");
    console.log("   Members:        4");
    console.log("   Total Staked:   ", hre.ethers.formatEther(totalStaked), "ETH");
    console.log("   Active Proposals: 3");
    console.log("   Delegations:    1");

    console.log("\n📝 Proposal Status:");
    for (let i = 1; i <= 3; i++) {
        const proposal = await governanceProposal.getProposal(i);
        console.log(`\n   Proposal #${i}:`);
        console.log(`   Amount:    ${hre.ethers.formatEther(proposal.amount)} ETH`);
        console.log(`   For Votes: ${hre.ethers.formatUnits(proposal.forVotes, 9)}`);
        console.log(`   Against:   ${hre.ethers.formatUnits(proposal.againstVotes, 9)}`);
        console.log(`   Abstain:   ${hre.ethers.formatUnits(proposal.abstainVotes, 9)}`);
    }

    console.log("\n💡 Next Steps:");
    console.log("   1. Wait for voting period to end (3 days in production, instant in tests)");
    console.log("   2. Queue approved proposals: governanceProposal.queueProposal(proposalId)");
    console.log("   3. Wait for timelock period");
    console.log("   4. Execute proposals: timelock.executeProposal(proposalId)");
    console.log("\n" + "=".repeat(60) + "\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
