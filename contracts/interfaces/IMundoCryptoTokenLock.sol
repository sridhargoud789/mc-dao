// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IMundoCryptoTokenLock {
    function getVotingPower(
        address _account
    ) external view returns (uint256 votingPower);
}
