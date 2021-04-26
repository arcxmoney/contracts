import { BigNumber, BigNumberish, constants } from 'ethers';
import { BASE } from '@src/constants';
import ArcNumber from '@src/utils/ArcNumber';
import { ITestContext } from './context';
import {
  immediatelyUpdateMerkleRoot,
  setStartingBalances,
} from '../helpers/testingUtils';
import _ from 'lodash';
import {
  DEFAULT_HiGH_C_RATIO,
  DEFAULT_LOW_C_RATIO,
  DEFAULT_PRICE,
  DEFAULT_TOTAL_BORROW_LIMIT,
  DEFAULT_VAULT_BORROW_MAXIMUM,
  DEFAULT_VAULT_BORROW_MIN,
} from '@test/helpers/sapphireDefaults';

export interface MozartSetupOptions {
  oraclePrice: BigNumberish;
  collateralRatio: BigNumberish;
  interestRate?: BigNumberish;
  startingTime?: BigNumberish;
  fees?: {
    liquidationUserFee?: BigNumberish;
    liquidationArcRatio?: BigNumberish;
  };
  initialCollateralBalances?: [Account, BigNumber][];
}

export interface SapphireSetupOptions {
  merkleRoot?: string;
  limits?: {
    lowCollateralRatio?: BigNumberish;
    highCollateralRatio?: BigNumberish;
    borrowLimit?: BigNumber;
    vaultBorrowMinimum?: BigNumber;
    vaultBorrowMaximum?: BigNumber;
  };
  fees?: {
    liquidationUserFee?: BigNumberish;
    liquidationArcFee?: BigNumberish;
  };
  interestRate?: BigNumberish;
  price?: BigNumberish;
}

export async function setupMozart(
  ctx: ITestContext,
  options: MozartSetupOptions,
) {
  const arc = ctx.sdks.mozart;

  // Set the starting timestamp
  await arc.updateTime(options.startingTime || 0);

  // Set the price of the oracle
  await arc.updatePrice(options.oraclePrice);

  // Update the collateral ratio
  await arc.synth().core.setCollateralRatio({ value: options.collateralRatio });

  // Set a starting balance and approval for each user we're going to be using
  await setStartingBalances(
    arc.collateral().address,
    arc.core().address,
    Object.values(ctx.signers),
    ArcNumber.new(1000000),
  );

  // Set the interest rate
  await arc.synth().core.setInterestRate(options.interestRate || BASE);

  // Set ARC's fees
  await arc
    .synth()
    .core.setFees(
      { value: options.fees?.liquidationUserFee || 0 },
      { value: options.fees?.liquidationArcRatio || 0 },
    );
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
    price = DEFAULT_PRICE,
    interestRate,
  }: SapphireSetupOptions,
) {
  const arc = ctx.sdks.sapphire;

  // Update the collateral ratio
  const core = await arc.synth().core;
  await core.setCollateralRatios(
    limits?.lowCollateralRatio || DEFAULT_LOW_C_RATIO,
    limits?.highCollateralRatio || DEFAULT_HiGH_C_RATIO,
  );

  // Set limits
  await core.setLimits(
    limits?.borrowLimit || DEFAULT_TOTAL_BORROW_LIMIT,
    limits?.vaultBorrowMinimum || DEFAULT_VAULT_BORROW_MIN,
    limits?.vaultBorrowMaximum || DEFAULT_VAULT_BORROW_MAXIMUM,
  );

  if (!_.isEmpty(fees)) {
    await arc
      .synth()
      .core.setFees(
        fees.liquidationUserFee || '0',
        fees.liquidationArcFee || '0',
      );
  }

  if (price) {
    await ctx.contracts.oracle.setPrice({ value: price });
  }

  if (interestRate) {
    await core
      .connect(ctx.signers.interestSetter)
      .setInterestRate(interestRate);
  }

  // Set the merkle root
  if (merkleRoot) {
    await immediatelyUpdateMerkleRoot(
      ctx.contracts.sapphire.creditScore.connect(ctx.signers.interestSetter),
      merkleRoot,
    );
  }
}
