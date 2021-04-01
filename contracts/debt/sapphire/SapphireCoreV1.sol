// SPDX-License-Identifier: MIT
// prettier-ignore

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;
import {SafeMath} from "../../lib/SafeMath.sol";

import {Decimal} from "../../lib/Decimal.sol";

import {SapphireTypes} from "./SapphireTypes.sol";

contract SapphireCoreV1 {

    /* ========== Libraries ========== */

    using SafeMath for uint256;

    /* ========== Constants ========== */

    uint256 constant BASE = 10**18;

    /* ========== Types ========== */

    struct OperationParams {
        address owner;
        uint256 amountOne;
        uint256 amountTwo;
        SapphireTypes.ScoreProof _scoreProof;
    }

    /* ========== Events ========== */

    event ActionOperated(
        uint8 _operation,
        OperationParams _params,
        SapphireTypes.Vault _updatedVault
    );

    event LiquidationFeesUpdated(
        Decimal.D256 _liquidationUserFee,
        Decimal.D256 _liquidationArcRatio
    );

    event LimitsUpdated(
        uint256 _totalBorrowLimit,
        uint256 _valutCollateralMinimum,
        uint256 _vaultBorrowMaximum
    );

    event IndexUpdated(
        uint256 _newIndex,
        uint256 _lastUpdateTime
    );

    event RateUpdated(uint256 _value);

    event OracleUpdated(address _oracle);

    event CollateralRatioUpdated(Decimal.D256 _collateralRatio);

    event PauseStatusUpdated(bool _pauseStatus);

    event InterestSetterUpdated(address _newInterestSetter);

    event TokensWithdrawn(
        address _token,
        address _destination,
        uint256 _amount
    );

    /* ========== Admin Setters ========== */

    function setLimits(
        uint256 _totalBorrowLimit,
        uint256 _valutCollateralMinimum,
        uint256 _vaultBorrowMaximum
    )
        public
    {}

    /* ========== Public Functions ========== */

    function executeActions(
        SapphireTypes.Action[] memory actions,
        SapphireTypes.ScoreProof memory scoreProof
    )
        public
    {

    }

    function borrow(
        uint256 amount,
        SapphireTypes.ScoreProof memory scoreProof
    )
        public
    {

    }


    function repay(
        uint256 amount,
        SapphireTypes.ScoreProof memory scoreProof
    )
        public
    {

    }

    function deposit(
        uint256 amount,
        SapphireTypes.ScoreProof memory scoreProof
    )
        public
    {

    }

    function withdraw(
        uint256 amount,
        SapphireTypes.ScoreProof memory scoreProof
    )
        public
    {

    }

    function liquidate(
        address owner,
        SapphireTypes.ScoreProof memory scoreProof
    )
        public
    {

    }

    /* ========== Public Getters ========== */

    function getVault(
        address owner
    )
        external
        view
        returns (SapphireTypes.Vault memory)
    {

    }

    /* ========== Private Functions ========== */

    function _borrow(
        uint256 amount
    )
        private
    {

    }


    function _repay(
        uint256 amount
    )
        private
    {

    }

    function _deposit(
        uint256 amount
    )
        private
    {

    }

    function _withdraw(
        uint256 amount
    )
        private
    {

    }

    function _liqiuidate(
        address owner
    )
        private
    {

    }
}
