// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../libraries/VotingMath.sol";
import "./GovernanceToken.sol";

/**
 * @title GovernanceProposal
 * @notice Core governance contract managing proposal lifecycle, voting, and delegation
 * @dev Implements weighted voting with delegation and complete state machine
 */
contract GovernanceProposal is AccessControl, ReentrancyGuard {
    using VotingMath for uint256;

    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    GovernanceToken public governanceToken;

    /// @notice Proposal types with different risk levels
    enum ProposalType {
        HIGH_CONVICTION,    // > 10 ETH, 66% approval, 30% quorum, 7 day timelock
        EXPERIMENTAL,       // 1-10 ETH, 60% approval, 20% quorum, 3 day timelock
        OPERATIONAL         // < 1 ETH, 51% approval, 10% quorum, 1 day timelock
    }

    /// @notice Proposal states in lifecycle
    enum ProposalState {
        PENDING,    // Created but voting not started
        ACTIVE,     // Voting period active
        DEFEATED,   // Failed quorum or threshold
        QUEUED,     // Approved, waiting for timelock
        EXECUTED,   // Successfully executed
        CANCELLED   // Cancelled by guardian
    }

    /// @notice Vote types
    enum VoteType {
        AGAINST,
        FOR,
        ABSTAIN
    }

    /// @notice Proposal structure
    struct Proposal {
        uint256 id;
        address proposer;
        ProposalType proposalType;
        address recipient;
        uint256 amount;
        string description;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        uint256 startTime;
        uint256 endTime;
        uint256 queuedTime;
        ProposalState state;
        mapping(address => bool) hasVoted;
        mapping(address => VoteType) votes;
    }

    /// @notice Delegation mapping
    mapping(address => address) public delegates;
    
    /// @notice Proposal counter
    uint256 public proposalCount;
    
    /// @notice All proposals
    mapping(uint256 => Proposal) public proposals;
    
    /// @notice Voting period duration (3 days)
    uint256 public constant VOTING_PERIOD = 3 days;

    // Events
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        ProposalType proposalType,
        address recipient,
        uint256 amount,
        string description
    );
    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        VoteType voteType,
        uint256 votingPower
    );
    event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate);
    event ProposalQueued(uint256 indexed proposalId, uint256 queuedTime);
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalCancelled(uint256 indexed proposalId);
    event ProposalDefeated(uint256 indexed proposalId, string reason);

    constructor(address _governanceToken) {
        governanceToken = GovernanceToken(_governanceToken);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PROPOSER_ROLE, msg.sender);
        _grantRole(EXECUTOR_ROLE, msg.sender);
        _grantRole(GUARDIAN_ROLE, msg.sender);
    }

    /**
     * @notice Create a new proposal
     * @param proposalType Type of proposal (determines thresholds)
     * @param recipient Address to receive funds
     * @param amount Amount of ETH to transfer
     * @param description Proposal description
     * @return proposalId ID of created proposal
     */
    function createProposal(
        ProposalType proposalType,
        address recipient,
        uint256 amount,
        string memory description
    ) external returns (uint256) {
        require(governanceToken.canCreateProposal(msg.sender), "Insufficient stake to create proposal");
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        require(bytes(description).length > 0, "Description required");

        // Validate proposal type matches amount
        if (proposalType == ProposalType.HIGH_CONVICTION) {
            require(amount > 10 ether, "HIGH_CONVICTION requires > 10 ETH");
        } else if (proposalType == ProposalType.EXPERIMENTAL) {
            require(amount >= 1 ether && amount <= 10 ether, "EXPERIMENTAL requires 1-10 ETH");
        } else {
            require(amount < 1 ether, "OPERATIONAL requires < 1 ETH");
        }

        proposalCount++;
        Proposal storage proposal = proposals[proposalCount];
        
        proposal.id = proposalCount;
        proposal.proposer = msg.sender;
        proposal.proposalType = proposalType;
        proposal.recipient = recipient;
        proposal.amount = amount;
        proposal.description = description;
        proposal.startTime = block.timestamp;
        proposal.endTime = block.timestamp + VOTING_PERIOD;
        proposal.state = ProposalState.ACTIVE;

        emit ProposalCreated(proposalCount, msg.sender, proposalType, recipient, amount, description);
        
        return proposalCount;
    }

    /**
     * @notice Cast a vote on a proposal
     * @param proposalId ID of proposal to vote on
     * @param voteType Type of vote (FOR, AGAINST, ABSTAIN)
     */
    function vote(uint256 proposalId, VoteType voteType) external nonReentrant {
        Proposal storage proposal = proposals[proposalId];
        
        require(proposal.state == ProposalState.ACTIVE, "Proposal not active");
        require(block.timestamp >= proposal.startTime, "Voting not started");
        require(block.timestamp <= proposal.endTime, "Voting ended");
        require(!proposal.hasVoted[msg.sender], "Already voted");
        
        uint256 votingPower = governanceToken.getVotingPower(msg.sender);
        require(votingPower > 0, "No voting power");

        // Check if delegated
        address voter = msg.sender;
        if (delegates[msg.sender] != address(0)) {
            voter = delegates[msg.sender];
        }

        proposal.hasVoted[msg.sender] = true;
        proposal.votes[msg.sender] = voteType;
        
        if (voteType == VoteType.FOR) {
            proposal.forVotes += votingPower;
        } else if (voteType == VoteType.AGAINST) {
            proposal.againstVotes += votingPower;
        } else {
            proposal.abstainVotes += votingPower;
        }

        governanceToken.incrementActiveVotes(msg.sender);
        
        emit VoteCast(proposalId, msg.sender, voteType, votingPower);
    }

    /**
     * @notice Delegate voting power to another address
     * @param delegatee Address to delegate to
     */
    function delegate(address delegatee) external {
        require(delegatee != address(0), "Cannot delegate to zero address");
        require(delegatee != msg.sender, "Cannot delegate to self");
        require(delegates[delegatee] != msg.sender, "Circular delegation");
        
        address oldDelegate = delegates[msg.sender];
        delegates[msg.sender] = delegatee;
        
        emit DelegateChanged(msg.sender, oldDelegate, delegatee);
    }

    /**
     * @notice Revoke delegation
     */
    function revokeDelegate() external {
        address oldDelegate = delegates[msg.sender];
        require(oldDelegate != address(0), "No active delegation");
        
        delegates[msg.sender] = address(0);
        
        emit DelegateChanged(msg.sender, oldDelegate, address(0));
    }

    /**
     * @notice Queue an approved proposal for execution
     * @param proposalId ID of proposal to queue
     */
    function queueProposal(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        
        require(proposal.state == ProposalState.ACTIVE, "Proposal not active");
        require(block.timestamp > proposal.endTime, "Voting period not ended");
        
        // Get thresholds based on proposal type
        (uint256 quorum, uint256 threshold) = getThresholds(proposal.proposalType);
        
        uint256 totalVotingPower = governanceToken.getTotalVotingPower();
        uint256 participatedPower = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
        
        // Check quorum
        if (!VotingMath.isQuorumMet(participatedPower, totalVotingPower, quorum)) {
            proposal.state = ProposalState.DEFEATED;
            emit ProposalDefeated(proposalId, "Quorum not met");
            return;
        }
        
        // Check threshold
        if (!VotingMath.isThresholdMet(proposal.forVotes, proposal.againstVotes, threshold)) {
            proposal.state = ProposalState.DEFEATED;
            emit ProposalDefeated(proposalId, "Threshold not met");
            return;
        }
        
        proposal.state = ProposalState.QUEUED;
        proposal.queuedTime = block.timestamp;
        
        emit ProposalQueued(proposalId, block.timestamp);
    }

    /**
     * @notice Get quorum and threshold for proposal type
     * @param proposalType Type of proposal
     * @return quorum Quorum percentage
     * @return threshold Approval threshold percentage
     */
    function getThresholds(ProposalType proposalType) public pure returns (uint256 quorum, uint256 threshold) {
        if (proposalType == ProposalType.HIGH_CONVICTION) {
            return (30, 66);
        } else if (proposalType == ProposalType.EXPERIMENTAL) {
            return (20, 60);
        } else {
            return (10, 51);
        }
    }

    /**
     * @notice Get current state of a proposal
     * @param proposalId ID of proposal
     * @return Current proposal state
     */
    function getProposalState(uint256 proposalId) external view returns (ProposalState) {
        return proposals[proposalId].state;
    }

    /**
     * @notice Get proposal details
     * @param proposalId ID of proposal
     * @return proposer Address of proposer
     * @return proposalType Type of proposal
     * @return recipient Recipient address
     * @return amount Amount to transfer
     * @return description Proposal description
     * @return forVotes Votes in favor
     * @return againstVotes Votes against
     * @return abstainVotes Abstain votes
     * @return startTime Voting start time
     * @return endTime Voting end time
     * @return state Current proposal state
     */
    function getProposal(uint256 proposalId) external view returns (
        address proposer,
        ProposalType proposalType,
        address recipient,
        uint256 amount,
        string memory description,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes,
        uint256 startTime,
        uint256 endTime,
        ProposalState state
    ) {
        Proposal storage proposal = proposals[proposalId];
        return (
            proposal.proposer,
            proposal.proposalType,
            proposal.recipient,
            proposal.amount,
            proposal.description,
            proposal.forVotes,
            proposal.againstVotes,
            proposal.abstainVotes,
            proposal.startTime,
            proposal.endTime,
            proposal.state
        );
    }

    /**
     * @notice Check if address has voted on proposal
     * @param proposalId ID of proposal
     * @param voter Address to check
     * @return True if voted
     */
    function hasVoted(uint256 proposalId, address voter) external view returns (bool) {
        return proposals[proposalId].hasVoted[voter];
    }

    /**
     * @notice Mark proposal as executed (called by TimelockController)
     * @param proposalId ID of proposal
     */
    function markExecuted(uint256 proposalId) external onlyRole(EXECUTOR_ROLE) {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.state == ProposalState.QUEUED, "Proposal not queued");
        
        proposal.state = ProposalState.EXECUTED;
        emit ProposalExecuted(proposalId);
    }

    /**
     * @notice Cancel a proposal (guardian only)
     * @param proposalId ID of proposal to cancel
     */
    function cancelProposal(uint256 proposalId) external onlyRole(GUARDIAN_ROLE) {
        Proposal storage proposal = proposals[proposalId];
        require(
            proposal.state == ProposalState.ACTIVE || proposal.state == ProposalState.QUEUED,
            "Cannot cancel proposal"
        );
        
        proposal.state = ProposalState.CANCELLED;
        emit ProposalCancelled(proposalId);
    }
}
