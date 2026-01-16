// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MultiTierTreasury
 * @notice Manages three-tier fund allocation with different approval requirements
 * @dev High-Conviction (60%), Experimental (30%), Operational (10%) fund caps
 */
contract MultiTierTreasury is AccessControl, ReentrancyGuard {
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant ALLOCATOR_ROLE = keccak256("ALLOCATOR_ROLE");

    /// @notice Fund types
    enum FundType {
        HIGH_CONVICTION,    // 60% cap, > 10 ETH proposals
        EXPERIMENTAL,       // 30% cap, 1-10 ETH proposals
        OPERATIONAL         // 10% cap, < 1 ETH proposals
    }

    /// @notice Fund balances
    mapping(FundType => uint256) public fundBalances;
    
    /// @notice Fund allocation caps (percentage of total treasury)
    mapping(FundType => uint256) public fundCaps;
    
    /// @notice Track executed proposals to prevent double execution
    mapping(uint256 => bool) public executedProposals;

    // Events
    event FundsDeposited(address indexed from, uint256 amount, uint256 newBalance);
    event FundsAllocated(FundType indexed fundType, uint256 amount, uint256 newBalance);
    event TransferExecuted(
        uint256 indexed proposalId,
        FundType indexed fundType,
        address indexed recipient,
        uint256 amount
    );
    event FundCapUpdated(FundType indexed fundType, uint256 newCap);
    event FundsRebalanced(uint256 highConviction, uint256 experimental, uint256 operational);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(EXECUTOR_ROLE, msg.sender);
        _grantRole(ALLOCATOR_ROLE, msg.sender);

        // Set default fund caps (percentages)
        fundCaps[FundType.HIGH_CONVICTION] = 60;
        fundCaps[FundType.EXPERIMENTAL] = 30;
        fundCaps[FundType.OPERATIONAL] = 10;
    }

    /**
     * @notice Receive ETH deposits
     */
    receive() external payable {
        emit FundsDeposited(msg.sender, msg.value, address(this).balance);
    }

    /**
     * @notice Allocate treasury funds to specific fund type
     * @param fundType Type of fund to allocate to
     * @param amount Amount to allocate
     */
    function allocateFunds(FundType fundType, uint256 amount) external onlyRole(ALLOCATOR_ROLE) {
        require(amount > 0, "Amount must be greater than 0");
        
        uint256 totalTreasury = address(this).balance;
        uint256 maxAllocation = (totalTreasury * fundCaps[fundType]) / 100;
        
        require(
            fundBalances[fundType] + amount <= maxAllocation,
            "Exceeds fund cap"
        );
        
        fundBalances[fundType] += amount;
        
        emit FundsAllocated(fundType, amount, fundBalances[fundType]);
    }

    /**
     * @notice Execute approved transfer from appropriate fund
     * @param proposalId ID of approved proposal
     * @param recipient Address to receive funds
     * @param amount Amount to transfer
     */
    function executeTransfer(
        uint256 proposalId,
        address recipient,
        uint256 amount
    ) external onlyRole(EXECUTOR_ROLE) nonReentrant {
        require(!executedProposals[proposalId], "Proposal already executed");
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        require(address(this).balance >= amount, "Insufficient treasury balance");

        // Determine fund type based on amount
        FundType fundType;
        if (amount > 10 ether) {
            fundType = FundType.HIGH_CONVICTION;
        } else if (amount >= 1 ether) {
            fundType = FundType.EXPERIMENTAL;
        } else {
            fundType = FundType.OPERATIONAL;
        }

        require(fundBalances[fundType] >= amount, "Insufficient fund balance");

        executedProposals[proposalId] = true;
        fundBalances[fundType] -= amount;

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "ETH transfer failed");

        emit TransferExecuted(proposalId, fundType, recipient, amount);
    }

    /**
     * @notice Rebalance funds to maintain caps
     * @dev Automatically redistributes funds according to caps
     */
    function rebalanceFunds() external onlyRole(ALLOCATOR_ROLE) {
        uint256 totalTreasury = address(this).balance;
        
        uint256 highConvictionTarget = (totalTreasury * fundCaps[FundType.HIGH_CONVICTION]) / 100;
        uint256 experimentalTarget = (totalTreasury * fundCaps[FundType.EXPERIMENTAL]) / 100;
        uint256 operationalTarget = (totalTreasury * fundCaps[FundType.OPERATIONAL]) / 100;

        fundBalances[FundType.HIGH_CONVICTION] = highConvictionTarget;
        fundBalances[FundType.EXPERIMENTAL] = experimentalTarget;
        fundBalances[FundType.OPERATIONAL] = operationalTarget;

        emit FundsRebalanced(highConvictionTarget, experimentalTarget, operationalTarget);
    }

    /**
     * @notice Get balance of specific fund
     * @param fundType Type of fund
     * @return Balance in wei
     */
    function getFundBalance(FundType fundType) external view returns (uint256) {
        return fundBalances[fundType];
    }

    /**
     * @notice Get total treasury balance
     * @return Balance in wei
     */
    function getTotalTreasury() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Get fund cap percentage
     * @param fundType Type of fund
     * @return Cap percentage
     */
    function getFundCap(FundType fundType) external view returns (uint256) {
        return fundCaps[fundType];
    }

    /**
     * @notice Update fund cap (admin only)
     * @param fundType Type of fund
     * @param newCap New cap percentage
     */
    function updateFundCap(FundType fundType, uint256 newCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newCap > 0 && newCap <= 100, "Invalid cap percentage");
        
        fundCaps[fundType] = newCap;
        emit FundCapUpdated(fundType, newCap);
    }

    /**
     * @notice Get all fund balances
     * @return highConviction Balance of high conviction fund
     * @return experimental Balance of experimental fund
     * @return operational Balance of operational fund
     */
    function getAllFundBalances() external view returns (
        uint256 highConviction,
        uint256 experimental,
        uint256 operational
    ) {
        return (
            fundBalances[FundType.HIGH_CONVICTION],
            fundBalances[FundType.EXPERIMENTAL],
            fundBalances[FundType.OPERATIONAL]
        );
    }
}
