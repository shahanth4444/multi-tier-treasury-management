// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IGovernance
 * @notice Interface for governance interactions
 */
interface IGovernance {
    enum ProposalType {
        HIGH_CONVICTION,
        EXPERIMENTAL,
        OPERATIONAL
    }

    enum ProposalState {
        PENDING,
        ACTIVE,
        DEFEATED,
        QUEUED,
        EXECUTED,
        CANCELLED
    }

    enum VoteType {
        AGAINST,
        FOR,
        ABSTAIN
    }

    function createProposal(
        ProposalType proposalType,
        address recipient,
        uint256 amount,
        string memory description
    ) external returns (uint256);

    function vote(uint256 proposalId, VoteType voteType) external;
    
    function delegate(address delegatee) external;
    
    function revokeDelegate() external;
    
    function queueProposal(uint256 proposalId) external;
    
    function getProposalState(uint256 proposalId) external view returns (ProposalState);
}
