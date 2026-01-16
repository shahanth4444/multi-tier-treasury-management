// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITreasury
 * @notice Interface for treasury operations
 */
interface ITreasury {
    enum FundType {
        HIGH_CONVICTION,
        EXPERIMENTAL,
        OPERATIONAL
    }

    function allocateFunds(FundType fundType, uint256 amount) external;
    
    function executeTransfer(
        uint256 proposalId,
        address recipient,
        uint256 amount
    ) external;
    
    function getFundBalance(FundType fundType) external view returns (uint256);
    
    function getTotalTreasury() external view returns (uint256);
}
