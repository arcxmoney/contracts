// SPDX-License-Identifier: MIT

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import {Ownable} from "../../lib/Ownable.sol";
import {SapphireTypes} from "./SapphireTypes.sol";
import {ISapphireCreditScore} from "./ISapphireCreditScore.sol";

contract SapphireCreditScore is ISapphireCreditScore, Ownable {
    /* ========== Structs ========== */

    struct CreditScore {
        uint256 score;
        uint256 lastUpdated;
    }

    /* ========== Events ========== */

    event MerkleRootUpdated(
        address updater,
        bytes32 merkleRoot,
        uint256 updatedAt
    );

    event CreditScoreUpdated(
        address account,
        uint256 score,
        uint256 lastUpdated,
        bytes32 merkleProof
    );

    event PauseStatusUpdated(bool value);

    event DelayDurationUpdated(
        address account,
        uint256 value
    );

    /* ========== Variables ========== */

    bool public isPaused;

    uint256 public lastMerkleRootUpdate;

    uint256 public merkleRootDelayDuration;

    bytes32 public currentMerkleRoot;

    bytes32 public upcomingMerkleRoot;

    address public merkleRootUpdater;

    mapping(address => CreditScore) public userScores;

    /* ========== Modifiers ========== */

    modifier isMerkleRootUpdater() {
        require(
            merkleRootUpdater == msg.sender,
            "SapphireCreditScore: caller is not authorized to update merkle root"
        );
        _;
    }

    modifier isActive() {
        require(
            isPaused == false,
            "SapphireCreditScore: contract is not active"
        );
        _;
    }

    /* ========== Constructor ========== */

    constructor(bytes32 merkleRoot, address _merkleRootUpdater) public {
        currentMerkleRoot = merkleRoot;
        upcomingMerkleRoot = merkleRoot;
        merkleRootUpdater = _merkleRootUpdater;
        lastMerkleRootUpdate = 0;
        isPaused = true;
        merkleRootDelayDuration = 86400; // 24 * 60 * 60 sec
    }

  /* ========== Functions ========== */

    function getCurrentTimestamp()
        public
        view
        returns (uint256)
    {
        return block.timestamp;
    }

    function updateMerkleRoot(
        bytes32 newRoot
    ) 
    public
    {
        if (msg.sender == merkleRootUpdater) {
            updateMerkleRootAsUpdator(newRoot);
        } else {
            updateMerkleRootAsOwner(newRoot);
        }
    }

    function updateMerkleRootAsUpdator(
        bytes32 newRoot
    )
    public
    {
        // If not admin
        // - Ensure duration has been passed
        // - Set the upcoming merkle root to the current one
        // - Set the passed in merkle root to the upcoming one
        // If admin calls update merkle root
        // - Replace upcoming merkle root (avoid time delay)
        // - Keep existing merkle root as-is
    }

    function request(
        SapphireTypes.ScoreProof memory proof
    ) 
        public
        view
        returns (uint256)
    {
        // abi.decode(proof, (data structure))
        // Decode the score from the current merkle root === verify

        // Update the userScores mapping
        // Return the score
        return proof.score;
    }

    function getLastScore(
        address user
    )
        public
        view
        returns (uint256, uint256)
    {
        return (1, 1);
    }

    function setMerkleRootDelay(
        uint256 delay
    )
        public
        onlyOwner
    {
        merkleRootDelayDuration = delay;
        emit DelayDurationUpdated(msg.sender, delay);
    }

    function setPause(
        bool value
    )
        public
        onlyOwner
    {
        isPaused = value;
        emit PauseStatusUpdated(value);
    }

    function updateMerkleRootUpdater(
        address merkleRootUpdator
    )
        public
    {}
}
