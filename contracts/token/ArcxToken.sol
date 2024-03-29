// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Ownable} from "../lib/Ownable.sol";

import {IMintableToken} from "../token/IMintableToken.sol";

import {BaseERC20} from "./BaseERC20.sol";

contract ArcxToken is BaseERC20, IMintableToken, Ownable {

    // ============ Constructor ============

    constructor()
        BaseERC20("ARC Governance Token", "ARCX", 18)
    { } // solhint-disable-line

    // ============ Core Functions ============

    function mint(
        address to,
        uint256 value
    )
        external
        override
        onlyOwner
    {
        _mint(to, value);
    }

    function burn(
        address to,
        uint256 value
    )
        external
        override
        onlyOwner
    {
        _burn(to, value);
    }

}
