// SPDX-License-Identifier: MIT

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import { SapphireCreditScore } from "../debt/sapphire/SapphireCreditScore.sol";

contract MockSapphireCreditScore is SapphireCreditScore {
    uint256 private currentTimestamp;

    constructor(bytes32 merkleRoot, address _merkleRootUpdater)
        public
        SapphireCreditScore(merkleRoot, _merkleRootUpdater)
    { }

    function setCurrentTimestamp(uint256 _timestamp)
        public
    {
        currentTimestamp = _timestamp;
    }

    function getCurrentTimestamp()
        public
        view
        returns (uint256)
    {
        return currentTimestamp;
    }
}
