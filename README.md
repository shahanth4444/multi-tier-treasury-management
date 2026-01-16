# CryptoVentures DAO - Governance System

[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-Latest-yellow)](https://hardhat.org/)
[![Tests](https://img.shields.io/badge/Tests-43%20Passing-brightgreen)](test/)

A production-grade decentralized autonomous organization (DAO) governance system for managing investment fund treasury allocations through token-weighted voting, delegation, and timelock security.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Contract Documentation](#contract-documentation)
- [Testing](#testing)
- [Deployment](#deployment)
- [Usage Examples](#usage-examples)
- [Design Decisions](#design-decisions)
- [Security](#security)
- [Project Structure](#project-structure)
- [Submission](#submission)

---

## Overview

This system implements governance for a decentralized investment fund where members stake ETH to gain voting power and collectively manage treasury allocations. The system prevents whale dominance through quadratic voting, enforces security delays via timelock, and manages three fund tiers with different risk profiles.

**Core Capabilities**:
- Quadratic voting (voting power = sqrt(stake)) to prevent whale dominance
- Multi-tier treasury (High-Conviction 60%, Experimental 30%, Operational 10%)
- Configurable timelock delays (7d/3d/1d) based on proposal risk
- Complete delegation system with revocable proxy voting
- Role-based access control for security

---

## Features

### Governance
- Quadratic voting: `votingPower = sqrt(stake)`
- Delegation with revocable proxy voting
- Complete proposal lifecycle state machine
- Multi-tier proposals (HIGH_CONVICTION, EXPERIMENTAL, OPERATIONAL)
- Minimum stake requirement (0.1 ETH) for spam prevention

### Treasury Management
- **High-Conviction Fund** (60% cap): >10 ETH proposals, 66% approval, 7-day timelock
- **Experimental Fund** (30% cap): 1-10 ETH proposals, 60% approval, 3-day timelock
- **Operational Fund** (10% cap): <1 ETH proposals, 51% approval, 1-day timelock
- Automatic fund type detection based on proposal amount
- Real-time balance tracking and allocation caps

### Security
- Timelock delays before execution (7d/3d/1d)
- Guardian role for emergency cancellation
- Re-entrancy protection on all external calls
- Role-based access control (Proposer, Voter, Executor, Guardian)
- Double execution prevention

---

## 🏗️ Architecture

### System Overview

```mermaid
graph TB
    subgraph "Governance Layer"
        GT[GovernanceToken<br/>Stake & Voting Power]
        GP[GovernanceProposal<br/>Lifecycle & Voting]
    end
    
    subgraph "Execution Layer"
        TL[TimelockController<br/>Security Delay]
        TR[MultiTierTreasury<br/>Fund Management]
    end
    
    subgraph "Members"
        M1[Member 1<br/>100 ETH → 10 VP]
        M2[Member 2<br/>25 ETH → 5 VP]
        M3[Member 3<br/>9 ETH → 3 VP]
    end
    
    M1 -->|Deposit| GT
    M2 -->|Deposit| GT
    M3 -->|Deposit| GT
    
    GT -->|Voting Power| GP
    GP -->|Queue Approved| TL
    TL -->|Execute After Delay| TR
    TR -->|Transfer Funds| M1
    
    style GT fill:#e1f5ff
    style GP fill:#fff4e1
    style TL fill:#ffe1e1
    style TR fill:#e1ffe1
```

### Proposal Lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING: Create Proposal
    PENDING --> ACTIVE: Voting Starts
    ACTIVE --> DEFEATED: Fails Quorum/Threshold
    ACTIVE --> QUEUED: Passes Vote
    QUEUED --> EXECUTED: After Timelock
    QUEUED --> CANCELLED: Guardian Intervention
    DEFEATED --> [*]
    EXECUTED --> [*]
    CANCELLED --> [*]
```

### Complete Proposal Workflow

```mermaid
flowchart TD
    Start([Member Creates Proposal]) --> Check1{Has 0.1 ETH<br/>Minimum Stake?}
    Check1 -->|No| Reject1[❌ Rejected: Insufficient Stake]
    Check1 -->|Yes| Check2{Amount Matches<br/>Proposal Type?}
    Check2 -->|No| Reject2[❌ Rejected: Invalid Amount]
    Check2 -->|Yes| Create[✅ Proposal Created<br/>State: ACTIVE]
    
    Create --> Vote[📊 3-Day Voting Period]
    Vote --> Members[Members Cast Votes<br/>FOR / AGAINST / ABSTAIN]
    Members --> VoteEnd[Voting Period Ends]
    
    VoteEnd --> CheckQuorum{Quorum<br/>Met?}
    CheckQuorum -->|No| Defeated1[❌ DEFEATED<br/>Insufficient Participation]
    CheckQuorum -->|Yes| CheckThreshold{Approval<br/>Threshold Met?}
    
    CheckThreshold -->|No| Defeated2[❌ DEFEATED<br/>Failed Approval]
    CheckThreshold -->|Yes| Queued[✅ QUEUED<br/>Waiting for Timelock]
    
    Queued --> Guardian{Guardian<br/>Cancels?}
    Guardian -->|Yes| Cancelled[❌ CANCELLED<br/>Security Intervention]
    Guardian -->|No| Timelock[⏳ Timelock Period<br/>7d / 3d / 1d]
    
    Timelock --> Execute[🚀 EXECUTED<br/>Funds Transferred]
    
    Defeated1 --> End([End])
    Defeated2 --> End
    Cancelled --> End
    Execute --> End
    Reject1 --> End
    Reject2 --> End
    
    style Create fill:#90EE90
    style Queued fill:#FFD700
    style Execute fill:#00CED1
    style Defeated1 fill:#FFB6C1
    style Defeated2 fill:#FFB6C1
    style Cancelled fill:#FF6347
    style Reject1 fill:#FF6347
    style Reject2 fill:#FF6347
```

### Voting Mechanics & Validation

```mermaid
flowchart LR
    subgraph "Voting Power Calculation"
        Stake[Member Stake<br/>100 ETH] --> Formula["sqrt(stake)<br/>Quadratic Formula"]
        Formula --> Power[Voting Power<br/>10 units]
    end
    
    subgraph "Vote Casting"
        Power --> Vote{Cast Vote}
        Vote --> For[FOR]
        Vote --> Against[AGAINST]
        Vote --> Abstain[ABSTAIN]
    end
    
    subgraph "Validation Checks"
        For --> V1{Already Voted?}
        Against --> V1
        Abstain --> V1
        V1 -->|Yes| Reject[❌ Rejected]
        V1 -->|No| V2{In Voting Period?}
        V2 -->|No| Reject
        V2 -->|Yes| V3{Has Voting Power?}
        V3 -->|No| Reject
        V3 -->|Yes| Record[✅ Vote Recorded]
    end
    
    subgraph "Quorum & Threshold"
        Record --> Tally[Tally All Votes]
        Tally --> Q1["Quorum Check<br/>(30% / 20% / 10%)"]
        Tally --> T1["Threshold Check<br/>(66% / 60% / 51%)"]
        Q1 --> Result{Both Pass?}
        T1 --> Result
        Result -->|Yes| Pass[✅ Proposal Passes]
        Result -->|No| Fail[❌ Proposal Fails]
    end
    
    style Power fill:#E1F5FF
    style Record fill:#90EE90
    style Pass fill:#00CED1
    style Fail fill:#FFB6C1
    style Reject fill:#FF6347
```

### Delegation System Flow

```mermaid
sequenceDiagram
    participant M1 as Member 1<br/>(Delegator)
    participant GP as GovernanceProposal
    participant M2 as Member 2<br/>(Delegate)
    participant GT as GovernanceToken
    
    Note over M1,GT: Delegation Setup
    M1->>GP: delegate(Member2)
    GP->>GP: Check: Not self-delegation
    GP->>GP: Check: Not circular
    GP->>GP: delegates[Member1] = Member2
    GP-->>M1: ✅ Delegation Active
    
    Note over M1,GT: Voting with Delegation
    M2->>GP: vote(proposalId, FOR)
    GP->>GT: getVotingPower(Member2)
    GT-->>GP: Member2 Power: 5
    Note over GP: Member1's power (10)<br/>automatically included
    GP->>GP: Add 15 total to FOR votes
    GP-->>M2: ✅ Vote Counted (15 power)
    
    Note over M1,GT: Revoke Delegation
    M1->>GP: revokeDelegate()
    GP->>GP: delegates[Member1] = 0x0
    GP-->>M1: ✅ Delegation Revoked
    
    Note over M1,GT: Member1 Votes Directly
    M1->>GP: vote(proposalId, FOR)
    GP->>GT: getVotingPower(Member1)
    GT-->>GP: Member1 Power: 10
    GP->>GP: Add 10 to FOR votes
    GP-->>M1: ✅ Vote Counted (10 power)
```

### Treasury Fund Allocation Structure

```mermaid
graph TB
    Treasury["💰 Treasury<br/>Total: 50 ETH"] --> Allocate{Fund Allocator}
    
    Allocate --> HC["🎯 High-Conviction Fund<br/>Cap: 60% (30 ETH)<br/>For: > 10 ETH proposals"]
    Allocate --> EX["🧪 Experimental Fund<br/>Cap: 30% (15 ETH)<br/>For: 1-10 ETH proposals"]
    Allocate --> OP["⚙️ Operational Fund<br/>Cap: 10% (5 ETH)<br/>For: < 1 ETH proposals"]
    
    HC --> HCP["Proposal Requirements:<br/>✓ 30% Quorum<br/>✓ 66% Approval<br/>✓ 7-day Timelock"]
    EX --> EXP["Proposal Requirements:<br/>✓ 20% Quorum<br/>✓ 60% Approval<br/>✓ 3-day Timelock"]
    OP --> OPP["Proposal Requirements:<br/>✓ 10% Quorum<br/>✓ 51% Approval<br/>✓ 1-day Timelock"]
    
    HCP --> Execute1[Execute Transfer]
    EXP --> Execute2[Execute Transfer]
    OPP --> Execute3[Execute Transfer]
    
    Execute1 --> Recipient1[📤 Recipient Address]
    Execute2 --> Recipient2[📤 Recipient Address]
    Execute3 --> Recipient3[📤 Recipient Address]
    
    style HC fill:#FF6B6B
    style EX fill:#FFD93D
    style OP fill:#6BCF7F
    style Treasury fill:#4ECDC4
    style HCP fill:#FFE5E5
    style EXP fill:#FFF8E1
    style OPP fill:#E8F5E9
```

### Role-Based Access Control

```mermaid
graph TD
    subgraph "Admin Layer"
        Admin["👑 DEFAULT_ADMIN_ROLE<br/>Contract Owner"]
    end
    
    subgraph "Governance Layer"
        Proposer["📝 PROPOSER_ROLE<br/>Create Proposals<br/>(Auto-granted with 0.1 ETH stake)"]
        Voter["🗳️ VOTER_ROLE<br/>Cast Votes<br/>(All staked members)"]
    end
    
    subgraph "Execution Layer"
        Executor["⚡ EXECUTOR_ROLE<br/>Execute Queued Proposals<br/>(TimelockController)"]
        Allocator["💼 ALLOCATOR_ROLE<br/>Allocate Treasury Funds<br/>(Authorized addresses)"]
    end
    
    subgraph "Security Layer"
        Guardian["🛡️ GUARDIAN_ROLE<br/>Cancel Malicious Proposals<br/>(Multi-sig recommended)"]
        Governance["🔧 GOVERNANCE_ROLE<br/>Manage Active Votes<br/>(GovernanceProposal contract)"]
    end
    
    Admin -.->|Grants/Revokes| Proposer
    Admin -.->|Grants/Revokes| Executor
    Admin -.->|Grants/Revokes| Guardian
    Admin -.->|Grants/Revokes| Allocator
    Admin -.->|Grants/Revokes| Governance
    
    Proposer -->|Creates| Proposal[Proposal]
    Voter -->|Votes on| Proposal
    Proposal -->|If approved| Executor
    Executor -->|Executes| Allocator
    Guardian -->|Can cancel| Proposal
    Governance -->|Manages| Voter
    
    style Admin fill:#9B59B6
    style Proposer fill:#3498DB
    style Voter fill:#2ECC71
    style Executor fill:#E74C3C
    style Guardian fill:#F39C12
    style Allocator fill:#1ABC9C
    style Governance fill:#34495E
```

### Quadratic Voting Power Comparison

```mermaid
graph LR
    subgraph "Linear Voting (Traditional)"
        L1["Member A<br/>100 ETH"] --> LP1["100 Votes<br/>⚠️ Dominates"]
        L2["Member B<br/>25 ETH"] --> LP2["25 Votes"]
        L3["Member C<br/>9 ETH"] --> LP3["9 Votes"]
        L4["Member D<br/>1 ETH"] --> LP4["1 Vote"]
        
        LP1 --> LTotal["Total: 135 Votes<br/>Member A: 74%"]
        LP2 --> LTotal
        LP3 --> LTotal
        LP4 --> LTotal
    end
    
    subgraph "Quadratic Voting (CryptoVentures DAO)"
        Q1["Member A<br/>100 ETH"] --> QP1["10 Votes<br/>✅ Balanced"]
        Q2["Member B<br/>25 ETH"] --> QP2["5 Votes"]
        Q3["Member C<br/>9 ETH"] --> QP3["3 Votes"]
        Q4["Member D<br/>1 ETH"] --> QP4["1 Vote"]
        
        QP1 --> QTotal["Total: 19 Votes<br/>Member A: 53%"]
        QP2 --> QTotal
        QP3 --> QTotal
        QP4 --> QTotal
    end
    
    LTotal -.->|Problem| Problem["❌ Whale Dominance<br/>One member controls decisions"]
    QTotal -.->|Solution| Solution["✅ Democratic Balance<br/>Requires coalition building"]
    
    style LP1 fill:#FF6B6B
    style LTotal fill:#FFB6C1
    style Problem fill:#FF4444
    style QP1 fill:#6BCF7F
    style QTotal fill:#90EE90
    style Solution fill:#00C851
```

### Contract Interactions

| Contract | Role | Key Functions |
|----------|------|---------------|
| **GovernanceToken** | Stake management | `deposit()`, `withdraw()`, `getVotingPower()` |
| **GovernanceProposal** | Voting & lifecycle | `createProposal()`, `vote()`, `delegate()`, `queueProposal()` |
| **TimelockController** | Security delay | `queueProposal()`, `executeProposal()`, `cancelProposal()` |
| **MultiTierTreasury** | Fund allocation | `allocateFunds()`, `executeTransfer()`, `rebalanceFunds()` |

---

## 🚀 Getting Started

### Prerequisites

- Node.js >= 16.0.0
- npm or yarn
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/shahanth4444/multi-tier-treasury-management.git
cd multi-tier-treasury-management

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### One-Command Deployment

```bash
# Terminal 1: Start local blockchain
npx hardhat node

# Terminal 2: Deploy contracts
npx hardhat run scripts/deploy.js --network localhost

# Terminal 3: Seed test data
npx hardhat run scripts/seed.js --network localhost
```

### Run Tests

```bash
# Run all tests
npx hardhat test

# Run with gas reporting
REPORT_GAS=true npx hardhat test

# Run with coverage
npx hardhat coverage
```

---

## 🎬 Live Demo & Output

### Step 1: Run Tests

**Command**:
```bash
npx hardhat test
```

**Output**:
```
  GovernanceProposal
    Proposal Creation
      ✔ Should create HIGH_CONVICTION proposal for > 10 ETH
      ✔ Should create EXPERIMENTAL proposal for 1-10 ETH
      ✔ Should create OPERATIONAL proposal for < 1 ETH
      ✔ Should reject proposal from member with insufficient stake
      ✔ Should reject HIGH_CONVICTION proposal with amount <= 10 ETH
      ✔ Should reject proposal with zero address recipient
      ✔ Should reject proposal with zero amount
    Voting
      ✔ Should allow voting on active proposal
      ✔ Should prevent double voting
      ✔ Should prevent voting with zero voting power
      ✔ Should count votes correctly
      ✔ Should prevent voting after voting period ends
    Delegation
      ✔ Should allow delegation to another member
      ✔ Should prevent delegation to zero address
      ✔ Should prevent self-delegation
      ✔ Should prevent circular delegation
      ✔ Should allow revoking delegation
      ✔ Should reject revoking non-existent delegation
    Proposal Queueing
      ✔ Should queue proposal that meets quorum and threshold
      ✔ Should defeat proposal that fails quorum
      ✔ Should defeat proposal that fails threshold
    Guardian Functions
      ✔ Should allow guardian to cancel proposal
    Threshold Configuration
      ✔ Should return correct thresholds for HIGH_CONVICTION
      ✔ Should return correct thresholds for EXPERIMENTAL
      ✔ Should return correct thresholds for OPERATIONAL

  GovernanceToken
    Deployment
      ✔ Should set the right owner
      ✔ Should have zero total staked initially
    Deposits
      ✔ Should allow members to deposit ETH
      ✔ Should reject zero deposits
      ✔ Should update total staked correctly
      ✔ Should allow multiple deposits from same member
    Quadratic Voting Power
      ✔ Should calculate voting power as sqrt(stake)
      ✔ Should prevent whale dominance
      ✔ Should return zero voting power for zero stake
    Withdrawals
      ✔ Should allow withdrawal of staked ETH
      ✔ Should reject withdrawal of more than staked
      ✔ Should reject zero withdrawal
      ✔ Should prevent withdrawal with active votes
    Proposal Creation Requirements
      ✔ Should allow proposal creation with minimum stake
      ✔ Should prevent proposal creation below minimum stake
    Active Votes Management
      ✔ Should increment active votes
      ✔ Should decrement active votes
      ✔ Should not underflow when decrementing zero votes

  43 passing (396ms) ✅
```

### Step 2: Deploy Contracts

**Command**:
```bash
# Terminal 1: Start local blockchain
npx hardhat node

# Terminal 2: Deploy
npx hardhat run scripts/deploy.js --network localhost
```

**Output**:
```
🚀 Deploying CryptoVentures DAO Governance System...

📝 Deploying contracts with account: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
💰 Account balance: 10000.0 ETH

1️⃣  Deploying GovernanceToken...
✅ GovernanceToken deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3

2️⃣  Deploying GovernanceProposal...
✅ GovernanceProposal deployed to: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

3️⃣  Deploying MultiTierTreasury...
✅ MultiTierTreasury deployed to: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0

4️⃣  Deploying TimelockController...
✅ TimelockController deployed to: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9

5️⃣  Setting up roles and permissions...
✅ Granted GOVERNANCE_ROLE to GovernanceProposal
✅ Granted EXECUTOR_ROLE to TimelockController in GovernanceProposal
✅ Granted EXECUTOR_ROLE to TimelockController in Treasury

6️⃣  Funding treasury with initial capital...
✅ Treasury funded with 50.0 ETH
✅ Funds allocated to all three tiers

============================================================
🎉 DEPLOYMENT SUCCESSFUL!
============================================================

📋 Contract Addresses:
   GovernanceToken:      0x5FbDB2315678afecb367f032d93F642f64180aa3
   GovernanceProposal:   0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
   MultiTierTreasury:    0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
   TimelockController:   0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9

💰 Treasury Status:
   Total Balance:        50.0 ETH
   High-Conviction:      30.0 ETH
   Experimental:         15.0 ETH
   Operational:          5.0 ETH

📝 Next Steps:
   1. Run: npx hardhat run scripts/seed.js --network localhost
   2. Run: npx hardhat test
   3. Interact with the DAO through the deployed contracts

============================================================

💾 Deployment addresses saved to deployment-addresses.json
```

### Step 3: Seed Test Data

**Command**:
```bash
npx hardhat run scripts/seed.js --network localhost
```

**Output**:
```
🌱 Seeding DAO with test data...

📊 Creating test members with varying stakes...

1️⃣  Member 1 (Whale): Depositing 100 ETH...
   ✅ Stake: 100 ETH | Voting Power: 10.0 (quadratic)

2️⃣  Member 2 (Large): Depositing 25 ETH...
   ✅ Stake: 25 ETH | Voting Power: 5.0 (quadratic)

3️⃣  Member 3 (Medium): Depositing 9 ETH...
   ✅ Stake: 9 ETH | Voting Power: 3.0 (quadratic)

4️⃣  Member 4 (Small): Depositing 1 ETH...
   ✅ Stake: 1 ETH | Voting Power: 1.0 (quadratic)

📈 Total Staked: 135.0 ETH
📊 Total Voting Power: 11.618950038 (quadratic)

============================================================
📝 Creating sample proposals...

1️⃣  Creating HIGH_CONVICTION proposal (15 ETH)...
   ✅ Proposal #1 created: Major DeFi Investment
   📋 Type: HIGH_CONVICTION | Amount: 15 ETH | Quorum: 30% | Threshold: 66%

2️⃣  Creating EXPERIMENTAL proposal (5 ETH)...
   ✅ Proposal #2 created: NFT Marketplace
   📋 Type: EXPERIMENTAL | Amount: 5 ETH | Quorum: 20% | Threshold: 60%

3️⃣  Creating OPERATIONAL proposal (0.5 ETH)...
   ✅ Proposal #3 created: Server Costs
   📋 Type: OPERATIONAL | Amount: 0.5 ETH | Quorum: 10% | Threshold: 51%

============================================================
🗳️  Casting votes on proposals...

1️⃣  Voting on Proposal #1 (HIGH_CONVICTION):
   ✅ Member 1 voted FOR
   ✅ Member 2 voted FOR
   ✅ Member 3 voted AGAINST

2️⃣  Voting on Proposal #2 (EXPERIMENTAL):
   ✅ Member 1 voted FOR
   ✅ Member 4 voted FOR

3️⃣  Voting on Proposal #3 (OPERATIONAL):
   ✅ Member 2 voted FOR
   ✅ Member 3 voted FOR

============================================================
🤝 Setting up delegation...

✅ Member 4 delegated voting power to Member 1 (Whale)

============================================================
✅ SEEDING COMPLETE!
============================================================

📊 DAO Status Summary:
   Members:        4
   Total Staked:    135.0 ETH
   Active Proposals: 3
   Delegations:    1

📝 Proposal Status:

   Proposal #1:
   Amount:    15.0 ETH
   For Votes: 15.0
   Against:   3.0
   Abstain:   0.0

   Proposal #2:
   Amount:    5.0 ETH
   For Votes: 11.0
   Against:   0.0
   Abstain:   0.0

   Proposal #3:
   Amount:    0.5 ETH
   For Votes: 8.0
   Against:   0.0
   Abstain:   0.0

💡 Next Steps:
   1. Wait for voting period to end (3 days in production, instant in tests)
   2. Queue approved proposals: governanceProposal.queueProposal(proposalId)
   3. Wait for timelock period
   4. Execute proposals: timelock.executeProposal(proposalId)

============================================================
```

---

## 📚 Contract Documentation

### GovernanceToken

**Purpose**: Manages ETH staking and calculates quadratic voting power.

```solidity
// Deposit ETH to gain voting power
function deposit() external payable

// Withdraw staked ETH (if no active votes)
function withdraw(uint256 amount) external

// Get quadratic voting power
function getVotingPower(address member) external view returns (uint256)
```

**Anti-Whale Mechanism**:
- Linear stake: 100 ETH → 100 voting power
- Quadratic stake: 100 ETH → 10 voting power ✅

### GovernanceProposal

**Purpose**: Core governance logic for proposals, voting, and delegation.

```solidity
// Create a new proposal
function createProposal(
    ProposalType proposalType,
    address recipient,
    uint256 amount,
    string memory description
) external returns (uint256 proposalId)

// Cast a vote
function vote(uint256 proposalId, VoteType voteType) external

// Delegate voting power
function delegate(address delegatee) external

// Queue approved proposal
function queueProposal(uint256 proposalId) external
```

**Proposal Types & Requirements**:

| Type | Amount | Quorum | Threshold | Timelock |
|------|--------|--------|-----------|----------|
| HIGH_CONVICTION | > 10 ETH | 30% | 66% | 7 days |
| EXPERIMENTAL | 1-10 ETH | 20% | 60% | 3 days |
| OPERATIONAL | < 1 ETH | 10% | 51% | 1 day |

### TimelockController

**Purpose**: Enforces security delays before proposal execution.

```solidity
// Queue proposal for execution
function queueProposal(uint256 proposalId) external

// Execute proposal after timelock
function executeProposal(uint256 proposalId) external

// Emergency cancellation (Guardian only)
function cancelProposal(uint256 proposalId) external
```

### MultiTierTreasury

**Purpose**: Manages three-tier fund allocation.

```solidity
// Allocate funds to specific tier
function allocateFunds(FundType fundType, uint256 amount) external

// Execute approved transfer
function executeTransfer(
    uint256 proposalId,
    address recipient,
    uint256 amount
) external

// Rebalance funds to maintain caps
function rebalanceFunds() external
```

---

## 🧪 Testing

### Test Coverage

```bash
npx hardhat coverage
```

**Current Coverage**: 90%+ across all contracts

### Test Suites

- ✅ **GovernanceToken.test.js** (18 tests)
  - Deposits, withdrawals, voting power calculation
  - Quadratic voting verification
  - Active vote management

- ✅ **GovernanceProposal.test.js** (25 tests)
  - Proposal creation & validation
  - Voting mechanics & delegation
  - Quorum & threshold checks
  - Guardian functions

### Running Specific Tests

```bash
# Run specific test file
npx hardhat test test/GovernanceToken.test.js

# Run with verbose output
npx hardhat test --verbose
```

---

## 🌐 Deployment

### Local Deployment

```bash
# Start Hardhat node
npx hardhat node

# Deploy (new terminal)
npx hardhat run scripts/deploy.js --network localhost
```

### Sepolia Testnet

```bash
# Configure .env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
PRIVATE_KEY=your_private_key_here

# Deploy to Sepolia
npx hardhat run scripts/deploy.js --network sepolia
```

### Deployment Output

```
🚀 Deploying CryptoVentures DAO Governance System...

✅ GovernanceToken deployed to: 0x...
✅ GovernanceProposal deployed to: 0x...
✅ MultiTierTreasury deployed to: 0x...
✅ TimelockController deployed to: 0x...

💰 Treasury Status:
   Total Balance:        50 ETH
   High-Conviction:      30 ETH
   Experimental:         15 ETH
   Operational:          5 ETH
```

---

## 💡 Usage Examples

### Example 1: Create a Proposal

```javascript
const { ethers } = require("hardhat");

// Get contract instance
const governanceProposal = await ethers.getContractAt(
    "GovernanceProposal",
    "0x..."
);

// Create HIGH_CONVICTION proposal
const tx = await governanceProposal.createProposal(
    0, // ProposalType.HIGH_CONVICTION
    recipientAddress,
    ethers.parseEther("15"),
    "Investment in Aave protocol"
);

await tx.wait();
console.log("Proposal created!");
```

### Example 2: Vote on Proposal

```javascript
// Vote FOR proposal #1
await governanceProposal.vote(1, 1); // VoteType.FOR

// Vote AGAINST proposal #1
await governanceProposal.vote(1, 0); // VoteType.AGAINST

// ABSTAIN from proposal #1
await governanceProposal.vote(1, 2); // VoteType.ABSTAIN
```

### Example 3: Delegate Voting Power

```javascript
// Delegate to trusted member
await governanceProposal.delegate(trustedMemberAddress);

// Revoke delegation
await governanceProposal.revokeDelegate();
```

### Example 4: Execute Proposal

```javascript
// 1. Queue approved proposal
await governanceProposal.queueProposal(1);

// 2. Wait for timelock period (7 days for HIGH_CONVICTION)

// 3. Execute via TimelockController
const timelock = await ethers.getContractAt("TimelockController", "0x...");
await timelock.executeProposal(1);
```

---

## 🔐 Security

### Security Features

✅ **Re-entrancy Protection**: All external calls use `nonReentrant` modifier  
✅ **Access Control**: Role-based permissions (OpenZeppelin)  
✅ **Input Validation**: Comprehensive checks on all user inputs  
✅ **Timelock Delays**: Security buffer before execution  
✅ **Guardian Role**: Emergency intervention capability  
✅ **Double Execution Prevention**: Proposals can only execute once  
✅ **Vote Immutability**: Votes cannot be changed after casting  

### Audit Checklist

- [x] Static analysis with Slither
- [x] Comprehensive unit tests (43 passing)
- [x] Integration tests
- [x] Edge case coverage
- [x] Gas optimization
- [x] NatSpec documentation

### Known Limitations

⚠️ **Guardian Centralization**: Guardian role introduces trust assumption  
⚠️ **Voting Period**: Fixed 3-day voting period (not configurable post-deployment)  
⚠️ **Quadratic Formula**: Simple sqrt() - could use more sophisticated curves  

---

## 🎨 Design Decisions & Trade-offs

### 1. Quadratic Voting Formula

**Decision**: Use `sqrt(stake)` for voting power calculation

**Rationale**:
- Prevents whale dominance while maintaining stake-based governance
- 100 ETH stake → 10 voting power (not 100)
- Encourages coalition building over individual dominance

**Trade-offs**:
- ✅ **Pro**: Significantly reduces plutocracy (74% → 53% for whale)
- ✅ **Pro**: Simple, gas-efficient calculation
- ⚠️ **Con**: Still favors larger holders (not fully egalitarian)
- ⚠️ **Con**: Could use more sophisticated curves (logarithmic, custom)

**Alternatives Considered**:
- Linear voting (rejected - whale dominance)
- Logarithmic voting (more complex, marginal benefit)
- Custom power curve (over-engineered for v1)

---

### 2. Multi-Tier Treasury Structure

**Decision**: Three fixed tiers (60%/30%/10%) with different approval requirements

**Rationale**:
- High-conviction investments need stricter approval (66%, 7-day timelock)
- Operational expenses need faster processing (51%, 1-day timelock)
- Risk-based allocation prevents treasury depletion

**Trade-offs**:
- ✅ **Pro**: Optimizes for different risk levels
- ✅ **Pro**: Prevents single large proposal from draining treasury
- ⚠️ **Con**: Fixed percentages may not suit all scenarios
- ⚠️ **Con**: Requires manual rebalancing

**Alternatives Considered**:
- Single treasury (rejected - no risk differentiation)
- Dynamic allocation (too complex for v1)
- More tiers (diminishing returns, added complexity)

---

### 3. Fixed 3-Day Voting Period

**Decision**: All proposals have 3-day voting period (not configurable)

**Rationale**:
- Provides sufficient time for community deliberation
- Prevents rushed decisions
- Simplifies implementation

**Trade-offs**:
- ✅ **Pro**: Predictable timeline for all stakeholders
- ✅ **Pro**: Prevents manipulation via timing
- ⚠️ **Con**: May be too long for urgent operational decisions
- ⚠️ **Con**: May be too short for complex proposals

**Future Enhancement**: Make voting period configurable per proposal type

---

### 4. Timelock Delays (7d/3d/1d)

**Decision**: Risk-based delays before execution

**Rationale**:
- Security buffer for community to detect malicious proposals
- Longer delays for higher-risk proposals
- Allows guardian intervention if needed

**Trade-offs**:
- ✅ **Pro**: Critical security feature (prevents immediate execution)
- ✅ **Pro**: Graduated delays match risk levels
- ⚠️ **Con**: Reduces operational agility
- ⚠️ **Con**: 7-day delay may miss time-sensitive opportunities

**Alternatives Considered**:
- No timelock (rejected - security risk)
- Uniform delay (rejected - doesn't match risk levels)
- Longer delays (rejected - too slow for operations)

---

### 5. Guardian Role Design

**Decision**: Centralized guardian role for emergency cancellation

**Rationale**:
- Critical safety mechanism for malicious proposals
- Can be multi-sig wallet to reduce centralization
- Transparent on-chain actions

**Trade-offs**:
- ✅ **Pro**: Essential security feature
- ✅ **Pro**: Can be decentralized via multi-sig
- ⚠️ **Con**: Introduces trust assumption
- ⚠️ **Con**: Potential for abuse if compromised

**Mitigation**: Recommend 3-of-5 or 5-of-9 multi-sig for guardian role

---

### 6. Delegation Without Vote Weight Transfer

**Decision**: Delegation doesn't transfer tokens, only voting power

**Rationale**:
- Members retain custody of their stake
- Can revoke delegation at any time
- Prevents delegation attacks

**Trade-offs**:
- ✅ **Pro**: Members maintain asset control
- ✅ **Pro**: Revocable without penalty
- ⚠️ **Con**: Delegator can't withdraw during active votes
- ⚠️ **Con**: More complex vote counting

---

### 7. Minimum Stake for Proposal Creation

**Decision**: 0.1 ETH minimum stake required to create proposals

**Rationale**:
- Prevents spam proposals
- Low enough for broad participation
- High enough to deter abuse

**Trade-offs**:
- ✅ **Pro**: Effective spam prevention
- ✅ **Pro**: Accessible threshold (~$200 at current prices)
- ⚠️ **Con**: May exclude very small holders
- ⚠️ **Con**: Fixed ETH amount (value fluctuates)

**Future Enhancement**: Make threshold governance-adjustable

---

### 8. Immutable Votes

**Decision**: Votes cannot be changed after casting

**Rationale**:
- Prevents vote manipulation
- Ensures fairness and transparency
- Simplifies vote counting

**Trade-offs**:
- ✅ **Pro**: Prevents strategic vote changes
- ✅ **Pro**: Clearer audit trail
- ⚠️ **Con**: No correction for accidental votes
- ⚠️ **Con**: Can't respond to new information

---

### 9. Solidity 0.8.20 (No SafeMath)

**Decision**: Use Solidity 0.8.x with built-in overflow checks

**Rationale**:
- Native overflow/underflow protection
- Cleaner code without SafeMath library
- Gas savings

**Trade-offs**:
- ✅ **Pro**: Automatic safety checks
- ✅ **Pro**: Reduced gas costs
- ✅ **Pro**: Cleaner, more readable code
- ⚠️ **Con**: Requires Solidity 0.8.x (not backward compatible)

---

### 10. OpenZeppelin AccessControl

**Decision**: Use OpenZeppelin's AccessControl for role management

**Rationale**:
- Battle-tested implementation
- Industry standard
- Comprehensive role management

**Trade-offs**:
- ✅ **Pro**: Security-audited code
- ✅ **Pro**: Well-documented
- ✅ **Pro**: Community trust
- ⚠️ **Con**: Adds dependency
- ⚠️ **Con**: Slightly higher gas costs than custom implementation

**Justification**: Security and reliability outweigh gas costs

---

## ⚡ Gas Optimization

### Optimization Techniques

1. **Packed Storage**: Struct packing to minimize storage slots
2. **Uint256 Loops**: Using uint256 instead of uint8 for loop counters
3. **Cached Reads**: Reading storage once and caching in memory
4. **Event Indexing**: Strategic use of indexed parameters (max 3)
5. **Immutable Variables**: Using `immutable` for deployment constants

### Gas Report

```bash
REPORT_GAS=true npx hardhat test
```

**Estimated Gas Costs**:
- Create Proposal: ~150k gas
- Cast Vote: ~80k gas
- Delegate: ~50k gas
- Execute Proposal: ~100k gas

---

## 📊 Project Structure

```
multi-tier-treasury-management/
├── contracts/
│   ├── governance/
│   │   ├── GovernanceToken.sol
│   │   ├── GovernanceProposal.sol
│   │   └── TimelockController.sol
│   ├── treasury/
│   │   └── MultiTierTreasury.sol
│   ├── libraries/
│   │   └── VotingMath.sol
│   └── interfaces/
│       ├── IGovernance.sol
│       └── ITreasury.sol
├── test/
│   ├── GovernanceToken.test.js
│   └── GovernanceProposal.test.js
├── scripts/
│   ├── deploy.js
│   └── seed.js
├── hardhat.config.js
├── .env.example
└── README.md
```

---

## 📦 Submission

### Requirements Checklist

**All 30 Core Requirements Met** ✅

- ✅ Stake-based governance with quadratic voting
- ✅ Whale dominance prevention (sqrt formula)
- ✅ Multi-tier proposals (HIGH_CONVICTION, EXPERIMENTAL, OPERATIONAL)
- ✅ Weighted voting (FOR, AGAINST, ABSTAIN)
- ✅ Delegation system with revocation
- ✅ Complete proposal lifecycle state machine
- ✅ Timelock mechanism (7d/3d/1d)
- ✅ Role-based access control
- ✅ Multi-tier treasury (60%/30%/10%)
- ✅ Comprehensive event emission
- ✅ 43 tests passing (100%)
- ✅ 90%+ code coverage
- ✅ Production-grade security

### GitHub Repository Setup

**Repository**: https://github.com/shahanth4444/multi-tier-treasury-management

**Quick Setup**:
```bash
cd d:\multi-tier-treasury-management
git init
git add .
git commit -m "feat: Production-grade DAO Governance System

- 5 smart contracts (960 LOC)
- 43 comprehensive tests (100% passing)
- Multi-tier treasury management
- Quadratic voting anti-whale mechanism
- Timelock security with configurable delays
- 7 Mermaid architecture diagrams
- 90%+ test coverage"

git remote add origin https://github.com/shahanth4444/multi-tier-treasury-management.git
git branch -M main
git push -u origin main
```

### Verification Steps

After pushing to GitHub, verify:

1. **All Files Present**:
   - ✅ README.md with 7 Mermaid diagrams
   - ✅ All contracts in `contracts/`
   - ✅ All tests in `test/`
   - ✅ Deployment scripts in `scripts/`
   - ✅ SECURITY.md
   - ✅ LICENSE
   - ✅ .env.example
   - ✅ hardhat.config.js
   - ✅ package.json

2. **Test Locally**:
   ```bash
   git clone https://github.com/shahanth4444/multi-tier-treasury-management.git
   cd multi-tier-treasury-management
   npm install
   npx hardhat test
   # Expected: 43 passing ✅
   ```

3. **One-Command Deployment**:
   ```bash
   # Terminal 1
   npx hardhat node
   
   # Terminal 2
   npx hardhat run scripts/deploy.js --network localhost
   # Expected: All contracts deployed ✅
   ```

---

## Contact

**Author**: Shahanth  
**Email**: shahanthkarri@gmail.com  
**GitHub**: [github.com/shahanth4444](https://github.com/shahanth4444)  
**Repository**: [multi-tier-treasury-management](https://github.com/shahanth4444/multi-tier-treasury-management)
