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

    enum Operation {
        Open,
        Borrow,
        Repay,
        Liquidate,
        TransferOwnership
    }

    struct OperationParams {
        uint256 id;
        uint256 amountOne;
        uint256 amountTwo;
        address addressOne;
        SapphireTypes.ScoreProof _scoreProof;
    }

    /* ========== Events ========== */

    event ActionOperated(
        uint8 _operation,
        OperationParams _params,
        SapphireTypes.Position _updatedPosition
    );

    event OwnershipTransfered(
        uint256 _positionId,
        address _newOwner
    );

    event LiquidationFeesUpdated(
        Decimal.D256 _liquidationUserFee,
        Decimal.D256 _liquidationArcRatio
    );

    event LimitsUpdated(
        uint256 _collateralLimit,
        uint256 _collateralMinimum
    );

    event GlobalOperatorSet(
        address _operator,
        bool _status
    );

    event PositionOperatorSet(
        uint256 _positionId,
        address _operator,
        bool _status
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

    event StrategyUpdated(address _newStrategy);

    /* ========== Public Functions ========== */

    function executeActions(
        address owner,
        SapphireTypes.Action[] memory actions,
        SapphireTypes.ScoreProof memory scoreProof
    )
        public
    {

    }

    function borrow(
        address owner,
        uint256 amount,
        SapphireTypes.ScoreProof memory scoreProof
    )
        public
    {

    }


    function repay(
        address owner,
        uint256 amount,
        SapphireTypes.ScoreProof memory scoreProof
    )
        public
    {

    }

    function deposit(
        address owner,
        uint256 amount,
        SapphireTypes.ScoreProof memory scoreProof
    )
        public
    {

    }

    function withdraw(
        address owner,
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

    function getPosition(
        address owner
    )
        external
        view
        returns (SapphireTypes.Position memory)
    {

    }

    /* ========== Private Functions ========== */

    function _borrow(
        address owner,
        uint256 amount
    )
        private
    {

    }


    function _repay(
        address owner,
        uint256 amount
    )
        private
    {

    }

    function _deposit(
        address owner,
        uint256 amount
    )
        private
    {

    }

    function _withdraw(
        address owner,
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
