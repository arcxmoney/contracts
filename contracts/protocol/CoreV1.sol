// SPDX-License-Identifier: MIT

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ISyntheticToken} from "../interfaces/ISyntheticToken.sol";
import {IMintableToken} from "../interfaces/IMintableToken.sol";

import {console} from "@nomiclabs/buidler/console.sol";

import {Types} from "../lib/Types.sol";
import {Decimal} from "../lib/Decimal.sol";
import {SignedMath} from "../lib/SignedMath.sol";
import {Storage} from "../lib/Storage.sol";
import {Math} from "../lib/Math.sol";
import {Adminable} from "../lib/Adminable.sol";

import {StateV1} from "./StateV1.sol";
import {V1Storage} from "./Storage.sol";

contract CoreV1 is V1Storage, Adminable {

    using SafeMath for uint256;
    using Math for uint256;
    using Types for Types.Par;
    using Types for Types.Wei;

    enum Operation {
        Open,
        Borrow,
        Repay,
        Liquidate
    }

    struct OperationParams {
        uint256 id;
        Types.AssetType assetOne;
        uint256 amountOne;
        Types.AssetType assetTwo;
        uint256 amountTwo;
    }

    event ActionOperated(
        uint8 operation,
        OperationParams params,
        Types.Position updatedPosition
    );

    event ExcessTokensWithdrawn(
        address token,
        uint256 amount,
        address destination
    );

    // ============ Constructor ============

    function init(address _state)
        public
    {
        require(
            address(state) == address(0),
            "CoreV1.init(): cannot recall init"
        );

        state = StateV1(_state);
    }

    function operateAction(
        Operation operation,
        OperationParams memory params
    )
        public
    {
        // @TODO: Need to check validity of assets and position

        Types.Position memory operatedPosition;

        if (operation == Operation.Open) {
            (operatedPosition, params.id) = openPosition(
                params.amountOne,
                params.amountTwo
            );
        } else if (operation == Operation.Borrow) {
            operatedPosition = borrow(
                params.id,
                params.amountOne,
                params.amountTwo
            );
        } else if (operation == Operation.Repay) {
            operatedPosition = repay(
                params.id,
                params.amountOne,
                params.amountTwo
            );
        } else if (operation == Operation.Liquidate) {
            operatedPosition = liquidate(
                params.id
            );
        }

        require(
            state.isCollateralized(operatedPosition) == true,
            "operateAction(): the operated position is undercollateralised"
        );

        state.updateIndex();

        emit ActionOperated(
            uint8(operation),
            params,
            operatedPosition
        );
    }

    function openPosition(
        uint256 collateralAmount,
        uint256 borrowAmount
    )
        internal
        returns (Types.Position memory returnedPosition, uint256 positionId)
    {
        // CHECKS:
        // 1. `collateralAsset` should be a valid asset
        // 2. Check the user has enough of the collateral asset
        // 3. Figure out `borrowAsset` based on collateral assset
        //    If stable shares are the collateral, synthetic are the borrow.
        //    If synthetics are the collateral, stable shares are the borrow

        // EFFECTS:
        // 1. Create a new Position struct with the basic fields filled out and save it to storage
        // 2. Call `borrowPosition()`

        Types.Position memory newPosition = Types.Position({
            owner: msg.sender,
            collateralAsset: Types.AssetType.Collateral,
            borrowedAsset: Types.AssetType.Synthetic,
            collateralAmount: Types.positiveZeroPar(),
            borrowedAmount: Types.zeroPar()
        });

        positionId = state.savePosition(newPosition);

        returnedPosition = borrow(
            positionId,
            collateralAmount,
            borrowAmount
        );
    }

    function borrow(
        uint256 positionId,
        uint256 collateralAmount,
        uint256 borrowAmount
    )
        internal
        returns (Types.Position memory)
    {
        // CHECKS:
        // 1. `borrowAmount` should be greater than 0
        // 2. Ensure that the position actually exists
        // 3. Ensure that msg.sender == owner of position
        // 4. Determine if there's enough liquidity of the `borrowAsset`
        // 5. Calculate the amount of collateral actually needed given the `collateralRatio`
        // 6. Ensure the user has provided enough of the

        // EFFECTS:
        // 1. If synthetics are being borrowed, update the position and skip to interactions.
        // 2. If stable shares are being borrowed, calculate the proportional
        //    new par value based on the borrow amount and set that as the borrow par value.
        // 3. Update the global index with the increased borrow amount

        // INTERACTIONS:
        // 1. If stable shares are being borrowed, transfer them to the user
        //    If synthetics are being borrowed, mint them and transfer collateral to synthetic contract

        // Get the current position
        Types.Position memory position = state.getPosition(positionId);

        // Ensure it's collateralized
        require(
            state.isCollateralized(position) == true,
            "borrowPosition(): position is not collateralised"
        );

        require(
            position.owner == msg.sender,
            "borrowPosition(): must be a valid position"
        );

        Decimal.D256 memory currentPrice = state.getCurrentPrice();

        // Increase the user's collateral amount
        position = state.updatePositionAmount(
            positionId,
            position.collateralAsset,
            Types.Par({
                sign: true,
                value: collateralAmount.to128()
            })
        );

        state.updateTotalSupplied(collateralAmount);

        // Only if they're borrowing
        if (borrowAmount > 0) {
            // Calculate the new borrow amount
            (Types.Par memory newPar, ) = state.getNewParAndDeltaWei(
                position.borrowedAmount,
                Types.AssetAmount({
                    sign: false,
                    denomination: Types.AssetDenomination.Wei,
                    ref: Types.AssetReference.Delta,
                    value: borrowAmount
                })
            );

            console.log("borrow new par: %s", newPar.value);

            // Update the position's borrow amount
            position = state.setAmount(
                positionId,
                position.borrowedAsset,
                newPar
            );

            // Check how much collateral they need based on their new position details
            Types.Par memory collateralRequired = state.calculateInverseRequired(
                position.borrowedAsset,
                position.borrowedAmount.value,
                currentPrice
            );

            // Ensure the user's collateral amount is greater than the collateral needed
            require(
                position.collateralAmount.value >= collateralRequired.value,
                "borrowPosition(): not enough collateral provided"
            );
        }

        IERC20 syntheticAsset = IERC20(state.syntheticAsset());
        IERC20 collateralAsset = IERC20(state.collateralAsset());

        // Transfer the stable asset to the synthetic contract
        SafeERC20.safeTransferFrom(
            collateralAsset,
            msg.sender,
            address(syntheticAsset),
            collateralAmount
        );

        // Mint the synthetic token to user opening the borrow position
        ISyntheticToken(address(syntheticAsset)).mint(
            msg.sender,
            borrowAmount
        );

        return position;
    }

    function repay(
        uint256 positionId,
        uint256 repayAmount,
        uint256 withdrawAmount
    )
        private
        returns (Types.Position memory)
    {
        // CHECKS:
        // 1. Ensure the position actually exists
        // 2. `depositAmount` is greater than 0
        // 3. Determine the asset being deposited based on the position
        // 4. Ensure user has enough balance of deposit asset
        // 5. Calculate the wei debt value of the position (assuming stable shares were borrowed)
        // 6. If the user has set the deposit amount more than or equal to the deposit amount
        //    then `canClose` should be set to true (assuming `shouldClose` == true)

        // EFFECTS:
        // 1. Calculate the new par value of the position based on the amount paid back
        // 2. Update the position's borrow amount based on the amount paid back
        // 3. Update the global par and wei values
        // 4. Update the global index

        // INTERACTIONS:
        // 1. If stable shares are being deposited, transfer the synthetic from them
        //    and take the stable coins back from them
        // 2. If synthetics are being deposited, burn the synthetic from them and
        //    transfer the stable coins back to them
        Types.Position memory position = state.getPosition(positionId);

        Decimal.D256 memory currentPrice = state.getCurrentPrice();

        // Ensure the user has a collateralised position when depositing
        require(
            state.isCollateralized(position) == true,
            "repay(): position is not collateralised"
        );

        require(
            position.owner == msg.sender,
            "repay(): must be a valid position"
        );

        // Calculate the user's new borrow requirements after decreasing their debt
        // An positive wei value will reduce the negative wei borrow value
        (Types.Par memory newPar, Types.Wei memory deltaWei) = state.getNewParAndDeltaWei(
            position.borrowedAmount,
            Types.AssetAmount({
                sign: true,
                denomination: Types.AssetDenomination.Wei,
                ref: Types.AssetReference.Delta,
                value: repayAmount
            })
        );

        // Update the position's new borrow amount
        position = state.setAmount(positionId, position.borrowedAsset, newPar);

        // Calculate how much the user is allowed to withdraw given their debt was repaid
        (Types.Par memory collateralDelta) = state.calculateCollateralDelta(
            position.borrowedAsset,
            position.collateralAmount,
            position.borrowedAmount,
            currentPrice
        );

        // Ensure that the amount they are trying to withdraw is less than their limit
        require(
            withdrawAmount <= collateralDelta.value,
            "repay(): cannot withdraw more than you're allowed"
        );

        // Decrease the collateral amount of the position
        position = state.updatePositionAmount(
            positionId,
            position.collateralAsset,
            Types.Par({
                sign: false,
                value: withdrawAmount.to128()
            })
        );

        ISyntheticToken synthetic = ISyntheticToken(state.syntheticAsset());
        IERC20 collateralAsset = IERC20(state.collateralAsset());

        // Burn the synthetic asset from the user
        synthetic.burn(
            msg.sender,
            deltaWei.value
        );

        // Transfer stable coin collateral back to the user
        synthetic.transferCollateral(
            address(collateralAsset),
            msg.sender,
            withdrawAmount
        );

        return position;
    }

    function liquidate(
        uint256 positionId
    )
        private
        returns (Types.Position memory)
    {
        // CHECKS:
        // 1. Ensure that the position id is valid
        // 2. Check the status of the position, only if it's in trouble
        //    can this function be called
        // 3. Determine which asset is the user under in
        // 4. Calculate how much the user is down by
        //    - If synthetics are being borrowed then they need to cover the user's synthetic position
        //    - If stable share are being borrowed, then they need to cover the user's stable position
        // 5. Ensure the liquidator (msg.sender) has enough of the asset they're attacking the user for

        // EFFECTS:
        // 1. Update the new par values of the position based on how much is liquidated
        // 2. Update the global par and wei values
        // 3. Update the global index based

        // INTERACTIONS:
        // 1. If stable shares were being borrowed, transfer the synthetic to the liquidator
        // 2. If synthetics were being borrowed, transfer stable shares to the liquidator
        Types.Position memory position = state.getPosition(positionId);

        console.log("*** liquidate ***");
        console.log("   starting collat: %s", position.collateralAmount.value);
        console.log("   starting borrow: %s", position.borrowedAmount.value);

        require(
            position.owner != address(0),
            "liquidatePosition(): must be a valid position"
        );

        // Ensure that the position is not collateralized
        require(
            state.isCollateralized(position) == false,
            "liquidatePosition(): position is collateralised"
        );

        // Get the liquidation price of the asset (discount for liquidator)
        Decimal.D256 memory liquidationPrice = state.calculateLiquidationPrice(
            position.collateralAsset
        );

        console.log("   liquidation price", liquidationPrice.value);

        // Calculate how much the user is in debt by to be whole again
        (Types.Par memory collateralDelta) = state.calculateCollateralDelta(
            position.borrowedAsset,
            position.collateralAmount,
            position.borrowedAmount,
            liquidationPrice
        );

        // Liquidate a slight bit more to ensure the user is guarded against futher price drops
        collateralDelta.value = Decimal.mul(
            collateralDelta.value,
            Decimal.add(
                state.totalLiquidationSpread(),
                Decimal.one().value
            )
        ).to128();

        console.log("   collateral delta: %s %s", collateralDelta.sign, collateralDelta.value);

        // If the maximum they're down by is greater than their collateral, bound to the maximum
        if (collateralDelta.value > position.collateralAmount.value) {
            collateralDelta.value = position.collateralAmount.value;
        }

        // Calculate how much borrowed assets to liquidate (at a discounted price)
        uint256 borrowToLiquidate = state.calculateInverseAmount(
            position.collateralAsset,
            collateralDelta.value,
            liquidationPrice
        );

        console.log("   borrow to liquidate: %s", borrowToLiquidate);

        // Decrease the user's debt obligation
        // This amount is denominated in par since collateralDelta uses the borrow index
        (Types.Par memory newPar, ) = state.getNewParAndDeltaWei(
            position.borrowedAmount,
            Types.AssetAmount({
                sign: true,
                denomination: Types.AssetDenomination.Par,
                ref: Types.AssetReference.Delta,
                value: borrowToLiquidate
            })
        );

        // Set the user's new borrow amount
        position = state.setAmount(positionId, position.borrowedAsset, newPar);

        // Decrease their collateral amount by the amount they were missing
        position = state.updatePositionAmount(positionId, position.collateralAsset, collateralDelta);

        address borrowAddress = state.getAddress(position.borrowedAsset);

        require(
            IERC20(borrowAddress).balanceOf(msg.sender) >= borrowToLiquidate,
            "liquidatePosition(): msg.sender not enough of borrowed asset to liquidate"
        );

        ISyntheticToken synthetic = ISyntheticToken(
            state.getAddress(Types.AssetType.Synthetic)
        );

        IERC20 collateralAsset = IERC20(state.collateralAsset());

        (
            Decimal.D256 memory userSplit,
            Decimal.D256 memory arcSplit
        ) = state.calculateLiquidationSplit();

        // Burn the synthetic asset from the liquidator
        synthetic.burn(
            msg.sender,
            borrowToLiquidate
        );

        // Transfer them the stable assets they acquired at a discount
        synthetic.transferCollateral(
            address(collateralAsset),
            msg.sender,
            Decimal.mul(
                collateralDelta.value,
                userSplit
            )
        );

        // Transfer them the stable assets they acquired at a discount
        synthetic.transferCollateral(
            address(collateralAsset),
            address(this),
            Decimal.mul(
                collateralDelta.value,
                arcSplit
            )
        );

        return position;
    }

    function withdrawExcessTokens(
        address token,
        uint256 amount,
        address destination
    )
        public
        onlyAdmin
    {

    }
}
