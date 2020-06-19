pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import {console} from "@nomiclabs/buidler/console.sol";
import {SyntheticToken} from "../token/SyntheticToken.sol";

import {Types} from "../lib/Types.sol";

import {Admin} from "./Admin.sol";
import {Storage} from "./Storage.sol";
import {Actions} from "./Actions.sol";

contract Core is Admin, Storage, Actions {

    // ============ Constructor ============

    constructor(
        string memory name,
        string memory symbol,
        Types.GlobalParams memory _globalParams
    )
        public
    {
        console.log('** ARC Deployed **');

        params = _globalParams;
        synthetic = new SyntheticToken(name, symbol, address(this));

    }
}
