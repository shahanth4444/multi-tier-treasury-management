// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VotingMath
 * @notice Library for voting power calculations and validation
 * @dev Implements quadratic voting to prevent whale dominance
 */
library VotingMath {
    /**
     * @notice Calculate quadratic voting power from stake amount
     * @dev Uses Babylonian method for gas-efficient square root
     * @param stake The amount of ETH staked
     * @return Voting power as sqrt(stake)
     */
    function calculateVotingPower(uint256 stake) internal pure returns (uint256) {
        if (stake == 0) return 0;
        return sqrt(stake);
    }

    /**
     * @notice Check if quorum is met for a proposal
     * @param votingPower Total voting power that participated
     * @param totalVotingPower Total voting power in the system
     * @param quorumPercentage Required quorum percentage (e.g., 30 for 30%)
     * @return True if quorum is met
     */
    function isQuorumMet(
        uint256 votingPower,
        uint256 totalVotingPower,
        uint256 quorumPercentage
    ) internal pure returns (bool) {
        if (totalVotingPower == 0) return false;
        return (votingPower * 100) >= (totalVotingPower * quorumPercentage);
    }

    /**
     * @notice Check if approval threshold is met
     * @param forVotes Voting power voting FOR
     * @param againstVotes Voting power voting AGAINST
     * @param thresholdPercentage Required approval percentage (e.g., 66 for 66%)
     * @return True if threshold is met
     */
    function isThresholdMet(
        uint256 forVotes,
        uint256 againstVotes,
        uint256 thresholdPercentage
    ) internal pure returns (bool) {
        uint256 totalVotes = forVotes + againstVotes;
        if (totalVotes == 0) return false;
        return (forVotes * 100) >= (totalVotes * thresholdPercentage);
    }

    /**
     * @notice Gas-efficient square root using Babylonian method
     * @param x Input value
     * @return y Square root of x
     */
    function sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        if (x <= 3) return 1;
        
        uint256 z = (x + 1) / 2;
        y = x;
        
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
