// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./GovernanceProposal.sol";

/**
 * @title TimelockController
 * @notice Enforces time delays before proposal execution for security
 * @dev Configurable delays based on proposal type and amount
 */
contract TimelockController is AccessControl, ReentrancyGuard {
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    GovernanceProposal public governanceProposal;
    address public treasury;

    /// @notice Timelock delays by proposal type
    mapping(GovernanceProposal.ProposalType => uint256) public timelockDelays;
    
    /// @notice Execution timestamps for queued proposals
    mapping(uint256 => uint256) public executionTimes;
    
    /// @notice Track executed proposals to prevent double execution
    mapping(uint256 => bool) public executed;

    // Events
    event ProposalQueued(uint256 indexed proposalId, uint256 executionTime);
    event ProposalExecuted(uint256 indexed proposalId, address recipient, uint256 amount);
    event ProposalCancelled(uint256 indexed proposalId);
    event TimelockDelayUpdated(GovernanceProposal.ProposalType proposalType, uint256 newDelay);

    constructor(address _governanceProposal, address _treasury) {
        governanceProposal = GovernanceProposal(_governanceProposal);
        treasury = _treasury;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(EXECUTOR_ROLE, msg.sender);
        _grantRole(GUARDIAN_ROLE, msg.sender);

        // Set default timelock delays
        timelockDelays[GovernanceProposal.ProposalType.HIGH_CONVICTION] = 7 days;
        timelockDelays[GovernanceProposal.ProposalType.EXPERIMENTAL] = 3 days;
        timelockDelays[GovernanceProposal.ProposalType.OPERATIONAL] = 1 days;
    }

    /**
     * @notice Queue a proposal for execution after timelock
     * @param proposalId ID of approved proposal
     */
    function queueProposal(uint256 proposalId) external {
        require(!executed[proposalId], "Proposal already executed");
        require(executionTimes[proposalId] == 0, "Proposal already queued");
        
        GovernanceProposal.ProposalState state = governanceProposal.getProposalState(proposalId);
        require(state == GovernanceProposal.ProposalState.QUEUED, "Proposal not approved");

        (, GovernanceProposal.ProposalType proposalType, , , , , , , , , ) = 
            governanceProposal.getProposal(proposalId);

        uint256 delay = timelockDelays[proposalType];
        uint256 executionTime = block.timestamp + delay;
        
        executionTimes[proposalId] = executionTime;
        
        emit ProposalQueued(proposalId, executionTime);
    }

    /**
     * @notice Execute a proposal after timelock expires
     * @param proposalId ID of proposal to execute
     */
    function executeProposal(uint256 proposalId) external onlyRole(EXECUTOR_ROLE) nonReentrant {
        require(!executed[proposalId], "Proposal already executed");
        require(executionTimes[proposalId] > 0, "Proposal not queued");
        require(block.timestamp >= executionTimes[proposalId], "Timelock not expired");
        
        GovernanceProposal.ProposalState state = governanceProposal.getProposalState(proposalId);
        require(state == GovernanceProposal.ProposalState.QUEUED, "Proposal not queued");

        (
            ,
            ,
            address recipient,
            uint256 amount,
            ,
            ,
            ,
            ,
            ,
            ,
        ) = governanceProposal.getProposal(proposalId);

        executed[proposalId] = true;
        
        // Mark as executed in governance contract
        governanceProposal.markExecuted(proposalId);
        
        // Execute transfer from treasury
        (bool success, ) = treasury.call(
            abi.encodeWithSignature("executeTransfer(uint256,address,uint256)", proposalId, recipient, amount)
        );
        require(success, "Treasury transfer failed");
        
        emit ProposalExecuted(proposalId, recipient, amount);
    }

    /**
     * @notice Cancel a queued proposal (guardian only)
     * @param proposalId ID of proposal to cancel
     */
    function cancelProposal(uint256 proposalId) external onlyRole(GUARDIAN_ROLE) {
        require(!executed[proposalId], "Proposal already executed");
        require(executionTimes[proposalId] > 0, "Proposal not queued");
        
        GovernanceProposal.ProposalState state = governanceProposal.getProposalState(proposalId);
        require(state == GovernanceProposal.ProposalState.QUEUED, "Proposal not queued");

        // Cancel in governance contract
        governanceProposal.cancelProposal(proposalId);
        
        // Clear execution time
        delete executionTimes[proposalId];
        
        emit ProposalCancelled(proposalId);
    }

    /**
     * @notice Check if proposal is ready for execution
     * @param proposalId ID of proposal
     * @return True if timelock expired and ready to execute
     */
    function isExecutable(uint256 proposalId) external view returns (bool) {
        if (executed[proposalId]) return false;
        if (executionTimes[proposalId] == 0) return false;
        if (block.timestamp < executionTimes[proposalId]) return false;
        
        GovernanceProposal.ProposalState state = governanceProposal.getProposalState(proposalId);
        return state == GovernanceProposal.ProposalState.QUEUED;
    }

    /**
     * @notice Get timelock delay for proposal type
     * @param proposalType Type of proposal
     * @return Delay in seconds
     */
    function getTimelockDelay(GovernanceProposal.ProposalType proposalType) external view returns (uint256) {
        return timelockDelays[proposalType];
    }

    /**
     * @notice Update timelock delay (admin only)
     * @param proposalType Type of proposal
     * @param newDelay New delay in seconds
     */
    function updateTimelockDelay(
        GovernanceProposal.ProposalType proposalType,
        uint256 newDelay
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newDelay >= 1 hours, "Delay too short");
        require(newDelay <= 30 days, "Delay too long");
        
        timelockDelays[proposalType] = newDelay;
        emit TimelockDelayUpdated(proposalType, newDelay);
    }

    /**
     * @notice Get execution time for a proposal
     * @param proposalId ID of proposal
     * @return Timestamp when proposal can be executed
     */
    function getExecutionTime(uint256 proposalId) external view returns (uint256) {
        return executionTimes[proposalId];
    }
}
