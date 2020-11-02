import { Position, GlobalMarket, GlobalRisk, ActionOperated, UserSlashed } from '../generated/schema';
import { RiskParamsUpdated, MarketParamsUpdated } from '../generated/StateV1/StateV1';
import { ActionOperated as ActionOperatedEvent } from '../generated/CoreV1/CoreV1';
import { UserSlashed as UserSlashedEvent } from '../generated/StakingRewards-Pool-4/RewardCampaign';

export function userSlashed(event: UserSlashedEvent, contractAddress: string): void {
  let userSlashed = new UserSlashed(event.transaction.hash.toHexString());
  userSlashed.contractAddress = contractAddress;
  userSlashed.slasher = event.params._slasher;
  userSlashed.user = event.params._user;
  userSlashed.amount = event.params._amount;
  userSlashed.save();
}

export function userSlashedPool3(event: UserSlashedEvent): void {
  userSlashed(event, '0x38b25c0A9e61E226023B700ce4a6A4134eCAEeDF');
}

export function userSlashedPool4(event: UserSlashedEvent): void {
  userSlashed(event, '0x8016F490D76346EBEC91707fD4Fb56A7fe64f694');
}

export function actionOperated(event: ActionOperatedEvent): void {
  handlePosition(event);
  let positionId = event.params.params.id.toHexString();
  let actionOperated = new ActionOperated(event.transaction.hash.toHexString().concat('-').concat(positionId));
  actionOperated.sender = event.transaction.from;
  actionOperated.position = positionId;
  actionOperated.amountOne = event.params.params.amountOne;
  actionOperated.amountTwo = event.params.params.amountTwo;
  actionOperated.operation = event.params.operation;
  actionOperated.createdAt = event.block.timestamp.toI32();
  actionOperated.save();
}

function handlePosition(event: ActionOperatedEvent): void {
  if (!(
    event.params.updatedPosition.borrowedAsset == 0 &&
    event.params.updatedPosition.collateralAsset == 0
  )) {
    let position = Position.load(event.params.params.id.toHex());

    if (position == null) {
      position = new Position(event.params.params.id.toHex());
      position.createdAt = event.block.timestamp.toI32();
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
