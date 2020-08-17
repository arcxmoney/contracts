import { Position, GlobalMarket, GlobalRisk } from '../generated/schema';
import { RiskParamsUpdated, MarketParamsUpdated } from '../generated/StateV1/StateV1';
import { log } from '@graphprotocol/graph-ts';
import { ActionOperated } from '../generated/CoreV1/CoreV1';

export function actionOperated(event: ActionOperated): void {
  if (
    !(
      event.params.updatedPosition.borrowedAsset == 0 &&
      event.params.updatedPosition.collateralAsset == 0
    )
  ) {
    let position = Position.load(event.params.params.id.toHex());

    if (position == null) {
      position = new Position(event.params.params.id.toHex());
      position.createdAt = event.block.timestamp;
    }

    position.owner = event.params.updatedPosition.owner;
    position.collateralAsset = event.params.updatedPosition.collateralAsset;
    position.borrowedAsset = event.params.updatedPosition.borrowedAsset;
    position.collateralAmountSign = event.params.updatedPosition.collateralAmount.sign;
    position.collateralAmountValue = event.params.updatedPosition.collateralAmount.value;
    position.borrowedAmountSign = event.params.updatedPosition.borrowedAmount.sign;
    position.borrowedAmountValue = event.params.updatedPosition.borrowedAmount.value;
    position.save();
  }
}

export function marketParamsUpdated(event: MarketParamsUpdated): void {
  let globalParams = new GlobalMarket(event.block.timestamp.toString());
  globalParams.collateralRatio = event.params.updatedMarket.collateralRatio.value;
  globalParams.liquidationArcFee = event.params.updatedMarket.liquidationArcFee.value;
  globalParams.liquidationUserFee = event.params.updatedMarket.liquidationUserFee.value;
  globalParams.save();
}

export function riskParamsUpdated(event: RiskParamsUpdated): void {
  let riskParams = new GlobalRisk(event.block.timestamp.toString());
  riskParams.collateralLimit = event.params.updatedParams.collateralLimit;
  riskParams.syntheticLimit = event.params.updatedParams.syntheticLimit;
  riskParams.positionCollateralMinimum = event.params.updatedParams.positionCollateralMinimum;
  riskParams.save();
}
