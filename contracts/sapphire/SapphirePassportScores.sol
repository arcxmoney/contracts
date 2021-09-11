// SPDX-License-Identifier: MIT

pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;
import "@openzeppelin/contracts/cryptography/MerkleProof.sol";

import {Adminable} from "../lib/Adminable.sol";
import {SafeMath} from "../lib/SafeMath.sol";
import {Initializable} from "../lib/Initializable.sol";
import {SapphireTypes} from "./SapphireTypes.sol";
import {ISapphirePassportScores} from "./ISapphirePassportScores.sol";

contract SapphirePassportScores is Adminable, Initializable, ISapphirePassportScores {

    /* ========== Libraries ========== */

    using SafeMath for uint256;

    /* ========== Events ========== */

    event MerkleRootUpdated(
        address indexed updater,
        bytes32 merkleRoot,
        uint256 updatedAt
    );

    event PauseStatusUpdated(bool value);

    event DelayDurationUpdated(
        address indexed account,
        uint256 value
    );

    event PauseOperatorUpdated(
        address pauseOperator
    );

    event MerkleRootUpdaterUpdated(
        address merkleRootUpdater
    );

    event DocumentIdUpdated(
        string newDocumentId
    );

    /* ========== Variables ========== */

    uint16 public maxScore;

    bool public isPaused;

    uint256 public lastMerkleRootUpdate;

    uint256 public merkleRootDelayDuration;

    bytes32 public currentMerkleRoot;

    bytes32 public upcomingMerkleRoot;

    address public merkleRootUpdater;

    address public pauseOperator;

    // The document ID of the IPFS document containing the current Merkle Tree
    string public documentId;

    uint256 public currentEpoch;

    /* ========== Modifiers ========== */

    modifier onlyMerkleRootUpdater() {
        require(
            merkleRootUpdater == msg.sender,
            "SapphirePassportScores: caller is not authorized to update merkle root"
        );
        _;
    }

    modifier onlyWhenActive() {
        require(
            !isPaused,
            "SapphirePassportScores: contract is not active"
        );
        _;
    }

    /* ========== Init ========== */

    function init(
        bytes32 _merkleRoot,
        address _merkleRootUpdater,
        address _pauseOperator,
        uint16 _maxScore
    )
        public
        onlyAdmin
        initializer()
    {
        require(
            _maxScore > 0,
            "SapphirePassportScores: max score cannot be zero"
        );

        currentMerkleRoot = _merkleRoot;
        upcomingMerkleRoot = _merkleRoot;
        merkleRootUpdater = _merkleRootUpdater;
        pauseOperator = _pauseOperator;
        lastMerkleRootUpdate = 0;
        isPaused = true;
        merkleRootDelayDuration = 86400; // 24 * 60 * 60 sec
        maxScore = _maxScore;
    }

    /* ========== View Functions ========== */

    /**
     * @dev Returns current block's timestamp
     *
     * @notice This function is introduced in order to properly test time delays in this contract
     */
    function currentTimestamp()
        public
        view
        returns (uint256)
    {
        return block.timestamp;
    }

    /* ========== Mutative Functions ========== */

    /**
     * @dev Update upcoming merkle root
     *
     * @notice Can be called by:
     *      - the admin:
     *          1. Check if contract is paused
     *          2. Replace upcoming merkle root
     *      - merkle root updater:
     *          1. Check if contract is active
     *          2. Replace current merkle root with upcoming merkle root
     *          3. Update upcoming one with passed Merkle root.
     *          4. Update the last merkle root update with the current timestamp
     *          5. Increment the `currentEpoch`
     *
     * @param _newRoot New upcoming merkle root
     */
    function updateMerkleRoot(
        bytes32 _newRoot
    )
        external
    {
        require(
            _newRoot != 0x0000000000000000000000000000000000000000000000000000000000000000,
            "SapphirePassportScores: root is empty"
        );

        if (msg.sender == getAdmin()) {
            updateMerkleRootAsAdmin(_newRoot);
        } else {
            updateMerkleRootAsUpdater(_newRoot);
        }
        emit MerkleRootUpdated(msg.sender, _newRoot, currentTimestamp());
    }

    /**
     * @notice Verifies the user's score proof. Reverts if the proof is invalid.
     *
     * @param _proof Data required to verify if score is correct for the current merkle root
     */
    function verify(
        SapphireTypes.ScoreProof calldata _proof
    )
        external
        view
        returns (bool)
    {
        require(
            _proof.account != address(0),
            "SapphirePassportScores: account cannot be address 0"
        );

        bytes32 node = keccak256(abi.encodePacked(_proof.account, _proof.protocol, _proof.score));

        require(
            MerkleProof.verify(_proof.merkleProof, currentMerkleRoot, node),
            "SapphirePassportScores: invalid proof"
        );

        // Return true to improve experience when interacting with this contract (ex. Etherscan)
        return true;
    }

     /* ========== Private Functions ========== */

    /**
     * @dev Merkle root updating strategy for merkle root updater
    **/
    function updateMerkleRootAsUpdater(
        bytes32 _newRoot
    )
        private
        onlyMerkleRootUpdater
        onlyWhenActive
    {
        require(
            currentTimestamp() >= merkleRootDelayDuration.add(lastMerkleRootUpdate),
            "SapphirePassportScores: cannot update merkle root before delay period"
        );

        currentMerkleRoot = upcomingMerkleRoot;
        upcomingMerkleRoot = _newRoot;
        currentEpoch++;
        lastMerkleRootUpdate = currentTimestamp();
    }

    /**
     * @dev Merkle root updating strategy for the admin
    **/
    function updateMerkleRootAsAdmin(
        bytes32 _newRoot
    )
        private
        onlyAdmin
    {
        require(
            isPaused,
            "SapphirePassportScores: only admin can update merkle root if paused"
        );

        upcomingMerkleRoot = _newRoot;
    }

    /* ========== Admin Functions ========== */

    /**
     * @dev Update merkle root delay duration
    */
    function setMerkleRootDelay(
        uint256 _delay
    )
        external
        onlyAdmin
    {
        require(
            _delay > 0,
            "SapphirePassportScores: the delay must be greater than 0"
        );

        require(
            _delay != merkleRootDelayDuration,
            "SapphirePassportScores: the same delay is already set"
        );

        merkleRootDelayDuration = _delay;
        emit DelayDurationUpdated(msg.sender, _delay);
    }

    /**
     * @dev Pause or unpause contract, which cause the merkle root updater
     *      to not be able to update the merkle root
     */
    function setPause(
        bool _value
    )
        external
    {
        require(
            msg.sender == pauseOperator,
            "SapphirePassportScores: caller is not the pause operator"
        );

        require(
            _value != isPaused,
            "SapphirePassportScores: cannot set the same pause value"
        );

        isPaused = _value;
        emit PauseStatusUpdated(_value);
    }

    /**
     * @dev Sets the merkle root updater
    */
    function setMerkleRootUpdater(
        address _merkleRootUpdater
    )
        external
        onlyAdmin
    {
        require(
            _merkleRootUpdater != merkleRootUpdater,
            "SapphirePassportScores: cannot set the same merkle root updater"
        );

        merkleRootUpdater = _merkleRootUpdater;
        emit MerkleRootUpdaterUpdated(merkleRootUpdater);
    }

    /**
     * @dev Sets the pause operator
    */
    function setPauseOperator(
        address _pauseOperator
    )
        external
        onlyAdmin
    {
        require(
            _pauseOperator != pauseOperator,
            "SapphirePassportScores: cannot set the same pause operator"
        );

        pauseOperator = _pauseOperator;
        emit PauseOperatorUpdated(pauseOperator);
    }

    /**
     * @dev Sets the document ID of the IPFS document containing the current Merkle Tree.
     */
    function setDocumentId(
        string memory _documentId
    )
        public
        onlyAdmin
    {
        documentId = _documentId;

        emit DocumentIdUpdated(documentId);
    }
}