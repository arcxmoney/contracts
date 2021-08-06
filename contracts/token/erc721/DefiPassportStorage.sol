// SPDX-License-Identifier: MIT

pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import {Counters} from "@openzeppelin/contracts/drafts/Counters.sol";
import {ISapphireCreditScore} from "../../debt/sapphire/ISapphireCreditScore.sol";

contract DefiPassportStorage {

    /* ========== Structs ========== */

    struct SkinRecord {
        address owner;
        address skin;
        uint256 skinTokenId;
    }

    /* ========== Public Variables ========== */

    string public name;
    string public symbol;

    /**
     * @notice The credit score contract used by the passport
     */
    ISapphireCreditScore public creditScoreContract;

    /**
     * @notice Records the approved skins of the passport
     */
    mapping (address => mapping (uint256 => bool)) public approvedSkins;

    /**
     * @notice Records the default skins
     */
    mapping (address => bool) public defaultSkins;

    /**
     * @notice Records the default skins
     */
    address public defaultActiveSkin;

    /**
     * @notice The skin manager appointed by the admin, who can
     *         approve and revoke passport skins
     */
    address public skinManager;

    /* ========== Private Variables ========== */

    /**
     * @notice Maps a passport (tokenId) to its active skin NFT
     */
    mapping (uint256 => SkinRecord) internal _activeSkins;

    Counters.Counter internal _tokenIds;

}
