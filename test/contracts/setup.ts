import { BigNumber, BigNumberish, utils } from 'ethers';
import { ITestContext } from './context';
import { immediatelyUpdateMerkleRoot } from '../helpers/testingUtils';
import _ from 'lodash';
import {
  DEFAULT_HIGH_C_RATIO,
  DEFAULT_LOW_C_RATIO,
  DEFAULT_VAULT_BORROW_MAXIMUM,
  DEFAULT_VAULT_BORROW_MIN,
} from '@test/helpers/sapphireDefaults';
import { SapphireCoreV1 } from '@src/typings';

export interface SapphireSetupOptions {
  merkleRoot?: string;
  limits?: {
    lowCollateralRatio?: BigNumberish;
    highCollateralRatio?: BigNumberish;
    vaultBorrowMinimum?: BigNumber;
    vaultBorrowMaximum?: BigNumber;
    poolDepositBorrowLimit?: BigNumber;
  };
  fees?: {
    liquidationUserFee?: BigNumberish;
    liquidationArcFee?: BigNumberish;
  };
  interestRate?: BigNumberish;
  price?: BigNumberish;
  poolDepositSwapAmount?: BigNumber;
}

/**
 * Note: sapphire takes low an high collateral ratios, to use as boundaries
 * to determine the maximum borrow amount given the user's credit score
 */
export async function setupSapphire(
  ctx: ITestContext,
  {
    merkleRoot,
    limits,
    fees,
    price,
    interestRate,
    poolDepositSwapAmount,
  }: SapphireSetupOptions,
) {
  const arc = ctx.sdks.sapphire;

  // Update the collateral ratio if needed
  const core = arc.core();
  await _setCRatiosIfNeeded(
    core,
    limits?.lowCollateralRatio,
    limits?.highCollateralRatio,
  );

  // Set limits
  await core.setLimits(
    limits?.vaultBorrowMinimum || DEFAULT_VAULT_BORROW_MIN,
    limits?.vaultBorrowMaximum || DEFAULT_VAULT_BORROW_MAXIMUM,
  );

  if (!_.isEmpty(fees)) {
    await arc
      .core()
      .setFees(fees.liquidationUserFee || '0', fees.liquidationArcFee || '0');
  }

  if (price) {
    await ctx.contracts.sapphire.oracle.setPrice(price);
  }

  if (interestRate) {
    await core
      .connect(ctx.signers.interestSetter)
      .setInterestRate(interestRate);
  }

  // Set the merkle root
  if (merkleRoot) {
    await immediatelyUpdateMerkleRoot(
      ctx.contracts.sapphire.passportScores.connect(ctx.signers.interestSetter),
      merkleRoot,
    );
  }

  await setupPool(ctx, poolDepositSwapAmount ?? utils.parseEther('300'));
}

async function _setCRatiosIfNeeded(
  core: SapphireCoreV1,
  newLowCRatio?: BigNumberish,
  newHighCRatio?: BigNumberish,
) {
  const existingRatios = {
    lowCRatio: await core.lowCollateralRatio(),
    highcRatio: await core.highCollateralRatio(),
  };
  if (
    !existingRatios.lowCRatio.eq(newLowCRatio || DEFAULT_LOW_C_RATIO) ||
    !existingRatios.highcRatio.eq(newHighCRatio || DEFAULT_HIGH_C_RATIO)
  ) {
    await core.setCollateralRatios(
      newLowCRatio || DEFAULT_LOW_C_RATIO,
      newHighCRatio || DEFAULT_HIGH_C_RATIO,
    );
  }
}

/**
 * Sets the deposit and swap limit to BORROW_AMOUNT * 3
 * @param depositBorrowAmount The amount deposited in the pool and the core swap limit
 */
export async function setupPool(
  ctx: ITestContext,
  depositBorrowAmount: BigNumberish,
) {
  await ctx.contracts.sapphire.pool.setDepositLimit(
    ctx.contracts.stableCoin.address,
    depositBorrowAmount,
  );
  await ctx.contracts.sapphire.pool.setCoreSwapLimit(
    ctx.contracts.sapphire.core.address,
    depositBorrowAmount,
  );

  await ctx.contracts.stableCoin.mintShare(
    ctx.signers.admin.address,
    depositBorrowAmount,
  );
  await ctx.contracts.stableCoin.approve(
    ctx.contracts.sapphire.pool.address,
    depositBorrowAmount,
  );
  await ctx.contracts.sapphire.pool.deposit(
    ctx.contracts.stableCoin.address,
    depositBorrowAmount,
  );
}
