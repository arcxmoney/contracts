import D1Arc from './D1Arc';

import { Wallet, Signer } from 'ethers';
import { MockOracle } from './typings/MockOracle';
import Token from './utils/Token';
import { BigNumberish, BigNumber } from 'ethers/utils';
import { AssetType, DeploymentConfig } from './types';

import { TestToken } from './typings';
import ArcDecimal from './utils/ArcDecimal';

export class D1TestArc extends D1Arc {
  static async init(signer: Signer): Promise<D1TestArc> {
    let arc = new D1TestArc();
    arc.signer = signer;
    return arc;
  }

  async deployTestArc() {
    this.collateralAsset = await TestToken.deploy(this.signer, 'TEST', 'TEST');
    this.oracle = await MockOracle.deploy(this.signer);

    const testConfig: DeploymentConfig = {
      owner: await this.signer.getAddress(),
      name: 'LINKUSD',
      symbol: 'LINKUSD',
      collateralAsset: this.collateralAsset.address,
      oracle: this.oracle.address,
      collateralRatio: ArcDecimal.new(2).value,
      liquidationArcFee: ArcDecimal.new(0.1).value,
      liquidationUserFee: ArcDecimal.new(0.05).value,
      chainlinkAggregator: '',
      collateralLimit: '',
      syntheticAssetLimit: '',
      positionCollateralMinimum: '',
    };

    await this.deployArc(testConfig);
  }

  async _borrowSynthetic(
    amount: BigNumberish,
    collateral: BigNumberish,
    from: Signer,
    positionId?: BigNumberish,
  ) {
    await Token.approve(this.collateralAsset.address, from, this.core.address, collateral, {});
    await this.collateralAsset.mintShare(await from.getAddress(), collateral, {});

    if (!positionId) {
      return await this.openPosition(collateral, amount, from, {});
    } else {
      return await this.borrow(positionId!, collateral, amount, from, {});
    }
  }

  async _repay(
    positionId: BigNumberish,
    repayAmount: BigNumberish,
    withdrawAmount: BigNumberish,
    from: Signer,
  ) {
    const position = await this.state.getPosition(positionId);

    if (position.borrowedAsset == AssetType.Collateral) {
      await this.collateralAsset.mintShare(await from.getAddress(), repayAmount, {});
      await Token.approve(this.collateralAsset.address, from, this.core.address, repayAmount, {});
    } else if (position.borrowedAsset == AssetType.Synthetic) {
      const price = await this.oracle.fetchCurrentPrice();
      const market = await this.state.market();
      await this._borrowSynthetic(
        repayAmount,
        price.value
          .mul(repayAmount)
          .div(new BigNumber(10).pow(18))
          .mul(market.collateralRatio.value)
          .div(new BigNumber(10).pow(18)),
        from,
      );
      await Token.approve(this.syntheticAsset.address, from, this.core.address, repayAmount, {});
    }

    return await this.repay(positionId, repayAmount, withdrawAmount, from, {});
  }
}
