pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Types} from "../lib/Types.sol";
import {Decimal} from "../lib/Decimal.sol";
import {Interest} from "../lib/Interest.sol";
import {Math} from "../lib/Math.sol";
import {Time} from "../lib/Time.sol";
import {SignedMath} from "../lib/SignedMath.sol";

import {ISyntheticToken} from "../interfaces/ISyntheticToken.sol";

contract StateV1 {

    using Types for Types.Par;
    using Types for Types.Wei;
    using Math for uint256;
    using SafeMath for uint256;

    // ============ Variables ============

    address core;

    Types.GlobalParams public params;

    Types.TotalPar public totalPar;
    Interest.Index public globalIndex;

    uint256 public positionCount;

    mapping (uint256 => Types.Position) public positions;
    mapping (address => Types.Par) public supplyBalances;

    constructor(
        address _core,
        Types.GlobalParams memory _globalParams
    )
        public
    {
        core = _core;
        params = _globalParams;
        globalIndex = Interest.newIndex();
    }

    modifier onlyCore() {
        require(
            msg.sender == core,
            "State: only core can call"
        );
        _;
    }

    // ============ Public Setters ============

    function updateIndex()
        public
        returns (Interest.Index memory)
    {
        if (globalIndex.lastUpdate == Time.currentTime()) {
            return globalIndex;
        }
        return globalIndex = fetchNewIndex(globalIndex);
    }

    // ============ Permissioned Setters ============

    function savePosition(
        Types.Position memory position
    )
        public
        onlyCore
        returns (uint256 id)
    {
        id = positionCount;
        positions[positionCount] = position;
        positionCount++;
    }

    function setAmount(
        uint256 id,
        Types.AssetType asset,
        Types.Par memory amount
    )
        public
        onlyCore
        returns (Types.Position memory)
    {
        Types.Position storage position = positions[id];

        if (position.collateralAsset == asset) {
            position.collateralAmount = amount;
        } else {
            position.borrowedAmount = amount;
        }

        return position;
    }

    function updatePositionAmount(
        uint256 id,
        Types.AssetType asset,
        Types.Par memory amount
    )
        public
        onlyCore
        returns (Types.Position memory)
    {
        Types.Position storage position = positions[id];

        if (position.collateralAsset == asset) {
            position.collateralAmount = position.collateralAmount.add(amount);
        } else {
            position.collateralAmount = position.borrowedAmount.add(amount);
        }

        return position;
    }

    function setSupplyBalance(
        address owner,
        Types.Par memory newPar
    )
        public
        onlyCore
    {
        supplyBalances[owner] = newPar;
    }

    function updateTotalPar(
        Types.Par memory existingPar,
        Types.Par memory newPar
    )
        public
        onlyCore
    {

        if (Types.equals(existingPar, newPar)) {
            return;
        }

        // roll-back oldPar
        if (existingPar.sign) {
            totalPar.supply = uint256(totalPar.supply).sub(existingPar.value).to128();
        } else {
            totalPar.borrow = uint256(totalPar.borrow).sub(existingPar.value).to128();
        }

        // roll-forward newPar
        if (newPar.sign) {
            totalPar.supply = uint256(totalPar.supply).add(newPar.value).to128();
        } else {
            totalPar.borrow = uint256(totalPar.borrow).add(newPar.value).to128();
        }
    }

    // ============ Getters ============

    function getNewParAndDeltaWei(
        Types.Par memory currentPar,
        Interest.Index memory index,
        Types.AssetAmount memory amount
    )
        public
        pure
        returns (Types.Par memory, Types.Wei memory)
    {
        if (amount.value == 0 && amount.ref == Types.AssetReference.Delta) {
            return (currentPar, Types.zeroWei());
        }

        Types.Wei memory oldWei = Interest.parToWei(currentPar, index);
        Types.Par memory newPar;
        Types.Wei memory deltaWei;

        if (amount.denomination == Types.AssetDenomination.Wei) {
            deltaWei = Types.Wei({
                sign: amount.sign,
                value: amount.value
            });
            if (amount.ref == Types.AssetReference.Target) {
                deltaWei = deltaWei.sub(oldWei);
            }
            newPar = Interest.weiToPar(oldWei.add(deltaWei), index);
        } else { // AssetDenomination.Par
            newPar = Types.Par({
                sign: amount.sign,
                value: amount.value.to128()
            });
            if (amount.ref == Types.AssetReference.Delta) {
                newPar = currentPar.add(newPar);
            }
            deltaWei = Interest.parToWei(newPar, index).sub(oldWei);
        }

        return (newPar, deltaWei);
    }

    function fetchNewIndex(
        Interest.Index memory index
    )
        public
        view
        returns (Interest.Index memory)
    {
        Interest.Rate memory rate = fetchInterestRate(index);

        return Interest.calculateNewIndex(
            index,
            rate,
            totalPar,
            params.earningsRate
        );
    }

    function fetchInterestRate(
        Interest.Index memory index
    )
        public
        view
        returns (Interest.Rate memory)
    {
        (
            Types.Wei memory supplyWei,
            Types.Wei memory borrowWei
        ) = Interest.totalParToWei(totalPar, index);

        Interest.Rate memory rate = params.interestSetter.getInterestRate(
            address(params.stableAsset),
            borrowWei.value,
            supplyWei.value
        );

        return rate;
    }

    function getAddress(
        Types.AssetType asset
    )
        public
        view
        returns (address)
    {
        return asset == Types.AssetType.Stable ?
            address(params.stableAsset) :
            address(params.syntheticAsset);
    }

    function getStableAsset()
        public
        view
        returns (IERC20)
    {
        return params.stableAsset;
    }

    function getSupplyBalance(
        address owner
    )
        public
        view
        returns (Types.Par memory)
    {
        return supplyBalances[owner];
    }

    function getIndex()
        public
        view
        returns (Interest.Index memory)
    {
        return globalIndex;
    }

    function getPosition(
        uint256 id
    )
        public
        view
        returns (Types.Position memory)
    {
        return positions[id];
    }

    function getCurrentPrice()
        public
        view
        returns (Decimal.D256 memory)
    {
        return params.oracle.fetchCurrentPrice();
    }

    function getBorrowIndex(
        Types.AssetType asset
    )
        public
        view
        returns (Interest.Index memory)
    {
        if (asset == Types.AssetType.Stable) {
            return globalIndex;
        } else {
            return Interest.newIndex();
        }
    }

    function isCollateralized(
        Types.Position memory position
    )
        public
        view
        returns (bool)
    {
        if (position.borrowedAmount.value == 0) {
            return true;
        }

        Decimal.D256 memory currentPrice = params.oracle.fetchCurrentPrice();

        (Types.Par memory collateralDelta) = calculateCollateralDelta(
            position.borrowedAsset,
            position.collateralAmount,
            position.borrowedAmount,
            getBorrowIndex(position.borrowedAsset),
            currentPrice
        );

        return collateralDelta.sign;
    }

    function calculateInverseAmount(
        Types.AssetType asset,
        uint256 amount,
        Decimal.D256 memory price
    )
        public
        pure
        returns (uint256)
    {
        uint256 borrowRequired;

        if (asset == Types.AssetType.Stable) {
            borrowRequired = Decimal.div(
                amount,
                price
            );
        } else if (asset == Types.AssetType.Synthetic) {
            borrowRequired = Decimal.mul(
                amount,
                price
            );
        }

        return borrowRequired;
    }

    function calculateInverseRequired(
        Types.AssetType asset,
        uint256 amount,
        Decimal.D256 memory price
    )
        public
        view
        returns (Types.Par memory)
    {
        uint256 collateralRequired = calculateInverseAmount(
            asset,
            amount,
            price
        );

        if (asset == Types.AssetType.Stable) {
            collateralRequired = Decimal.mul(
                collateralRequired,
                params.syntheticRatio
            );

        } else if (asset == Types.AssetType.Synthetic) {
            collateralRequired = Decimal.mul(
                collateralRequired,
                params.collateralRatio
            );
        }

        return Types.Par({
            sign: true,
            value: collateralRequired.to128()
        });
    }

    function calculateLiquidationPrice(
        Types.AssetType asset
    )
        public
        view
        returns (Decimal.D256 memory price)
    {
        Decimal.D256 memory result;
        Decimal.D256 memory currentPrice = params.oracle.fetchCurrentPrice();

        if (asset == Types.AssetType.Stable) {
            result = Decimal.add(
                Decimal.one(),
                params.liquidationSpread.value
            );
        } else if (asset == Types.AssetType.Synthetic) {
            result = Decimal.sub(
                Decimal.one(),
                params.liquidationSpread.value
            );
        }

        result = Decimal.mul(
            currentPrice,
            result
        );

        return result;
    }

    function calculateCollateralDelta(
        Types.AssetType borrowedAsset,
        Types.Par memory parSupply,
        Types.Par memory parBorrow,
        Interest.Index memory borrowIndex,
        Decimal.D256 memory price
    )
        public
        view
        returns (Types.Par memory)
    {
        Types.Par memory collateralDelta;

        Types.Par memory collateralRequired;

        Types.Wei memory weiBorrow = Types.getWei(
            parBorrow,
            borrowIndex
        );

        if (borrowedAsset == Types.AssetType.Stable) {
            collateralRequired = calculateInverseRequired(
                borrowedAsset,
                weiBorrow.value,
                price
            );
        } else if (borrowedAsset == Types.AssetType.Synthetic) {
            collateralRequired = calculateInverseRequired(
                borrowedAsset,
                weiBorrow.value,
                price
            );
        }

        collateralDelta = parSupply.sub(collateralRequired);

        return collateralDelta;
    }

    function availableLiquidity()
        public
        view
        returns (uint256)
    {
        return uint256(totalPar.supply).sub(uint256(totalPar.borrow));
    }

}