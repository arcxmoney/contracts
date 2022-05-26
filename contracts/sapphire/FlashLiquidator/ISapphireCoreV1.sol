// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {SapphireTypes} from "../SapphireTypes.sol";

interface ISapphireCoreV1 {
    function liquidate(
        address _owner,
        address _borrowAssetAddress,
        SapphireTypes.ScoreProof[] memory _passportProofs
    ) external;

    function vaults(address _owner) external view returns (SapphireTypes.Vault memory);
}
