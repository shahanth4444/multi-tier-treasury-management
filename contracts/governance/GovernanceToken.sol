// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../libraries/VotingMath.sol";

/**
 * @title GovernanceToken
 * @notice Manages stake-based governance with quadratic voting power
 * @dev Members deposit ETH to gain voting influence with anti-whale protection
 */
contract GovernanceToken is AccessControl, ReentrancyGuard {
    using VotingMath for uint256;

    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    
    /// @notice Minimum stake required to create proposals (0.1 ETH)
    uint256 public constant MIN_PROPOSAL_STAKE = 0.1 ether;
    
    /// @notice Member stake balances
    mapping(address => uint256) public stakes;
    
    /// @notice Total ETH staked in the system
    uint256 public totalStaked;
    
    /// @notice Track active votes to prevent withdrawal during voting
    mapping(address => uint256) public activeVotes;

    // Events
    event Staked(address indexed member, uint256 amount, uint256 newStake, uint256 votingPower);
    event Withdrawn(address indexed member, uint256 amount, uint256 remainingStake);
    event VotingPowerChanged(address indexed member, uint256 oldPower, uint256 newPower);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(GOVERNANCE_ROLE, msg.sender);
    }

    /**
     * @notice Deposit ETH to gain voting power
     * @dev Voting power calculated as sqrt(stake) to prevent whale dominance
     */
    function deposit() external payable nonReentrant {
        require(msg.value > 0, "Must deposit ETH");
        
        uint256 oldStake = stakes[msg.sender];
        uint256 oldPower = oldStake.calculateVotingPower();
        
        stakes[msg.sender] += msg.value;
        totalStaked += msg.value;
        
        uint256 newPower = stakes[msg.sender].calculateVotingPower();
        
        emit Staked(msg.sender, msg.value, stakes[msg.sender], newPower);
        emit VotingPowerChanged(msg.sender, oldPower, newPower);
    }

    /**
     * @notice Withdraw staked ETH
     * @param amount Amount to withdraw
     * @dev Cannot withdraw if member has active votes
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(stakes[msg.sender] >= amount, "Insufficient stake");
        require(activeVotes[msg.sender] == 0, "Cannot withdraw with active votes");
        
        uint256 oldPower = stakes[msg.sender].calculateVotingPower();
        
        stakes[msg.sender] -= amount;
        totalStaked -= amount;
        
        uint256 newPower = stakes[msg.sender].calculateVotingPower();
        
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");
        
        emit Withdrawn(msg.sender, amount, stakes[msg.sender]);
        emit VotingPowerChanged(msg.sender, oldPower, newPower);
    }

    /**
     * @notice Get voting power for a member
     * @param member Address to check
     * @return Quadratic voting power
     */
    function getVotingPower(address member) external view returns (uint256) {
        return stakes[member].calculateVotingPower();
    }

    /**
     * @notice Get total voting power in the system
     * @return Total quadratic voting power
     */
    function getTotalVotingPower() external view returns (uint256) {
        return totalStaked.calculateVotingPower();
    }

    /**
     * @notice Check if member can create proposals
     * @param member Address to check
     * @return True if member has minimum stake
     */
    function canCreateProposal(address member) external view returns (bool) {
        return stakes[member] >= MIN_PROPOSAL_STAKE;
    }

    /**
     * @notice Increment active vote count (called by governance contract)
     * @param member Member who voted
     */
    function incrementActiveVotes(address member) external onlyRole(GOVERNANCE_ROLE) {
        activeVotes[member]++;
    }

    /**
     * @notice Decrement active vote count (called by governance contract)
     * @param member Member whose proposal ended
     */
    function decrementActiveVotes(address member) external onlyRole(GOVERNANCE_ROLE) {
        if (activeVotes[member] > 0) {
            activeVotes[member]--;
        }
    }

    /**
     * @notice Get stake balance for a member
     * @param member Address to check
     * @return Stake amount in wei
     */
    function getStake(address member) external view returns (uint256) {
        return stakes[member];
    }
}
