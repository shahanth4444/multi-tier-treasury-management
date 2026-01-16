const hre = require("hardhat");

async function main() {
    console.log("🚀 Deploying CryptoVentures DAO Governance System...\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log("📝 Deploying contracts with account:", deployer.address);
    console.log("💰 Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

    // Deploy GovernanceToken
    console.log("1️⃣  Deploying GovernanceToken...");
    const GovernanceToken = await hre.ethers.getContractFactory("GovernanceToken");
    const governanceToken = await GovernanceToken.deploy();
    await governanceToken.waitForDeployment();
    const governanceTokenAddress = await governanceToken.getAddress();
    console.log("✅ GovernanceToken deployed to:", governanceTokenAddress);

    // Deploy GovernanceProposal
    console.log("\n2️⃣  Deploying GovernanceProposal...");
    const GovernanceProposal = await hre.ethers.getContractFactory("GovernanceProposal");
    const governanceProposal = await GovernanceProposal.deploy(governanceTokenAddress);
    await governanceProposal.waitForDeployment();
    const governanceProposalAddress = await governanceProposal.getAddress();
    console.log("✅ GovernanceProposal deployed to:", governanceProposalAddress);

    // Deploy MultiTierTreasury
    console.log("\n3️⃣  Deploying MultiTierTreasury...");
    const MultiTierTreasury = await hre.ethers.getContractFactory("MultiTierTreasury");
    const treasury = await MultiTierTreasury.deploy();
    await treasury.waitForDeployment();
    const treasuryAddress = await treasury.getAddress();
    console.log("✅ MultiTierTreasury deployed to:", treasuryAddress);

    // Deploy TimelockController
    console.log("\n4️⃣  Deploying TimelockController...");
    const TimelockController = await hre.ethers.getContractFactory("TimelockController");
    const timelock = await TimelockController.deploy(governanceProposalAddress, treasuryAddress);
    await timelock.waitForDeployment();
    const timelockAddress = await timelock.getAddress();
    console.log("✅ TimelockController deployed to:", timelockAddress);

    // Setup roles and permissions
    console.log("\n5️⃣  Setting up roles and permissions...");

    // Grant GOVERNANCE_ROLE to GovernanceProposal contract
    const GOVERNANCE_ROLE = await governanceToken.GOVERNANCE_ROLE();
    await governanceToken.grantRole(GOVERNANCE_ROLE, governanceProposalAddress);
    console.log("✅ Granted GOVERNANCE_ROLE to GovernanceProposal");

    // Grant EXECUTOR_ROLE to TimelockController
    const EXECUTOR_ROLE_PROPOSAL = await governanceProposal.EXECUTOR_ROLE();
    await governanceProposal.grantRole(EXECUTOR_ROLE_PROPOSAL, timelockAddress);
    console.log("✅ Granted EXECUTOR_ROLE to TimelockController in GovernanceProposal");

    const EXECUTOR_ROLE_TREASURY = await treasury.EXECUTOR_ROLE();
    await treasury.grantRole(EXECUTOR_ROLE_TREASURY, timelockAddress);
    console.log("✅ Granted EXECUTOR_ROLE to TimelockController in Treasury");

    // Fund treasury with initial capital
    console.log("\n6️⃣  Funding treasury with initial capital...");
    const initialFunding = hre.ethers.parseEther("50"); // 50 ETH
    await deployer.sendTransaction({
        to: treasuryAddress,
        value: initialFunding
    });
    console.log("✅ Treasury funded with", hre.ethers.formatEther(initialFunding), "ETH");

    // Allocate funds to different tiers
    const ALLOCATOR_ROLE = await treasury.ALLOCATOR_ROLE();
    await treasury.grantRole(ALLOCATOR_ROLE, deployer.address);

    await treasury.allocateFunds(0, hre.ethers.parseEther("30")); // High-Conviction: 30 ETH
    await treasury.allocateFunds(1, hre.ethers.parseEther("15")); // Experimental: 15 ETH
    await treasury.allocateFunds(2, hre.ethers.parseEther("5"));  // Operational: 5 ETH
    console.log("✅ Funds allocated to all three tiers");

    // Print deployment summary
    console.log("\n" + "=".repeat(60));
    console.log("🎉 DEPLOYMENT SUCCESSFUL!");
    console.log("=".repeat(60));
    console.log("\n📋 Contract Addresses:");
    console.log("   GovernanceToken:     ", governanceTokenAddress);
    console.log("   GovernanceProposal:  ", governanceProposalAddress);
    console.log("   MultiTierTreasury:   ", treasuryAddress);
    console.log("   TimelockController:  ", timelockAddress);

    console.log("\n💰 Treasury Status:");
    const treasuryBalance = await hre.ethers.provider.getBalance(treasuryAddress);
    console.log("   Total Balance:       ", hre.ethers.formatEther(treasuryBalance), "ETH");
    const highConviction = await treasury.getFundBalance(0);
    const experimental = await treasury.getFundBalance(1);
    const operational = await treasury.getFundBalance(2);
    console.log("   High-Conviction:     ", hre.ethers.formatEther(highConviction), "ETH");
    console.log("   Experimental:        ", hre.ethers.formatEther(experimental), "ETH");
    console.log("   Operational:         ", hre.ethers.formatEther(operational), "ETH");

    console.log("\n📝 Next Steps:");
    console.log("   1. Run: npx hardhat run scripts/seed.js --network localhost");
    console.log("   2. Run: npx hardhat test");
    console.log("   3. Interact with the DAO through the deployed contracts");
    console.log("\n" + "=".repeat(60) + "\n");

    // Save deployment addresses to file
    const fs = require("fs");
    const deploymentInfo = {
        network: hre.network.name,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: {
            GovernanceToken: governanceTokenAddress,
            GovernanceProposal: governanceProposalAddress,
            MultiTierTreasury: treasuryAddress,
            TimelockController: timelockAddress
        }
    };

    fs.writeFileSync(
        "deployment-addresses.json",
        JSON.stringify(deploymentInfo, null, 2)
    );
    console.log("💾 Deployment addresses saved to deployment-addresses.json\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
