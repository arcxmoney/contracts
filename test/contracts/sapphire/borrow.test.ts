import { BigNumber, utils } from 'ethers';
import { SapphireTestArc } from '@test/helpers/SapphireTestArc';
import {
  addSnapshotBeforeRestoreAfterEach,
  immediatelyUpdateMerkleRoot,
} from '@test/helpers/testingUtils';
import 'module-alias/register';
import { ITestContext, generateContext } from '../context';
import { sapphireFixture } from '../fixtures';
import { setupSapphire } from '../setup';
import { BaseERC20Factory, TestToken, TestTokenFactory } from '@src/typings';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { expect } from 'chai';
import { ONE_YEAR_IN_SECONDS } from '@src/constants';
import {
  DEFAULT_COLLATERAL_DECIMALS,
  DEFAULT_HIGH_C_RATIO,
  DEFAULT_LOW_C_RATIO,
  DEFAULT_PRICE,
  DEFAULT_VAULT_BORROW_MAXIMUM,
  DEFAULT_VAULT_BORROW_MIN,
  DEFAULT_STABLE_COIN_PRECISION_SCALAR,
  DEFAULT_STABLECOIN_DECIMALS,
} from '@test/helpers/sapphireDefaults';
import { CREDIT_PROOF_PROTOCOL } from '@src/constants';
import { getScoreProof, getEmptyScoreProof } from '@src/utils/getScoreProof';
import { roundUpDiv, roundUpMul } from '@test/helpers/roundUpOperations';
import { PassportScore, PassportScoreProof } from '@arc-types/sapphireTypes';
import { PassportScoreTree } from '@src/MerkleTree';
import { deployTestToken } from '../deployers';
import { BORROW_LIMIT_PROOF_PROTOCOL } from '@test/constants';

/**
 * This is the most crucial function of the system as it's how users actually borrow from a vault.
 * When borrowing, we won't let a user borrow without a credit proof if they're already being tracked
 * in the system. This means that if people can't obtain a credit proof then they can't borrow. The same
 * cannot be said for liquidate and repay since the credit proof is optional. When testing the borrow
 * function we need to make sure that every case of with a credit proof, without a credit proof, price changes
 * is tested.
 */

const SCALED_COLLATERAL_AMOUNT = utils.parseEther('100');

const COLLATERAL_AMOUNT = utils.parseUnits('100', DEFAULT_COLLATERAL_DECIMALS);

const BORROW_AMOUNT = SCALED_COLLATERAL_AMOUNT.mul(DEFAULT_PRICE)
  .div(DEFAULT_HIGH_C_RATIO)
  .div(DEFAULT_STABLE_COIN_PRECISION_SCALAR);

// for credit score equals 500 what is the a half of max credit score
const BORROW_AMOUNT_500_SCORE = SCALED_COLLATERAL_AMOUNT.mul(DEFAULT_PRICE)
  .div(DEFAULT_LOW_C_RATIO.add(DEFAULT_HIGH_C_RATIO).div(2))
  .div(DEFAULT_STABLE_COIN_PRECISION_SCALAR);

const SCALED_BORROW_AMOUNT = BORROW_AMOUNT.mul(
  DEFAULT_STABLE_COIN_PRECISION_SCALAR,
);

const BORROW_LIMIT = SCALED_BORROW_AMOUNT.mul(2);

describe('SapphireCore.borrow()', () => {
  let ctx: ITestContext;
  let arc: SapphireTestArc;

  let stablecoin: TestToken;

  let creditScore1: PassportScore;
  let borrowLimitScore1: PassportScore;
  let borrowLimitScore2: PassportScore;
  let borrowerLimitScore: PassportScore;
  let scoredBorrowerOtherScore: PassportScore;
  let creditScore2: PassportScore;
  let creditScoreTree: PassportScoreTree;
  let creditScoreProof: PassportScoreProof;
  let borrowLimitProof: PassportScoreProof;

  let scoredBorrower: SignerWithAddress;
  let borrower: SignerWithAddress;

  /**
   * Mints `amount` of collateral tokens to the `caller` and approves it on the core
   */
  async function mintAndApproveCollateral(
    caller: SignerWithAddress,
    amount = COLLATERAL_AMOUNT,
  ) {
    const collateral = TestTokenFactory.connect(
      arc.collateral().address,
      borrower,
    );

    await collateral.mintShare(caller.address, amount);
    await collateral.approveOnBehalf(caller.address, arc.coreAddress(), amount);
  }

  async function init(ctx: ITestContext): Promise<void> {
    creditScore1 = {
      account: ctx.signers.scoredBorrower.address,
      protocol: utils.formatBytes32String(CREDIT_PROOF_PROTOCOL),
      score: BigNumber.from(500),
    };
    borrowLimitScore1 = {
      account: ctx.signers.scoredBorrower.address,
      protocol: utils.formatBytes32String(BORROW_LIMIT_PROOF_PROTOCOL),
      score: BORROW_LIMIT,
    };
    scoredBorrowerOtherScore = {
      ...creditScore1,
      protocol: utils.formatBytes32String('defi.other'),
    };
    creditScore2 = {
      account: ctx.signers.interestSetter.address,
      protocol: utils.formatBytes32String(CREDIT_PROOF_PROTOCOL),
      score: BigNumber.from(1000),
    };
    borrowLimitScore2 = {
      account: ctx.signers.interestSetter.address,
      protocol: utils.formatBytes32String(BORROW_LIMIT_PROOF_PROTOCOL),
      score: BORROW_LIMIT,
    };
    borrowerLimitScore = {
      account: ctx.signers.borrower.address,
      protocol: utils.formatBytes32String(BORROW_LIMIT_PROOF_PROTOCOL),
      score: BORROW_LIMIT,
    };
    creditScoreTree = new PassportScoreTree([
      creditScore1,
      scoredBorrowerOtherScore,
      creditScore2,
      borrowerLimitScore,
      borrowLimitScore1,
      borrowLimitScore2,
    ]);
    creditScoreProof = getScoreProof(creditScore1, creditScoreTree);
    borrowLimitProof = getScoreProof(borrowLimitScore1, creditScoreTree);
    return setupSapphire(ctx, {
      merkleRoot: creditScoreTree.getHexRoot(),
      poolDepositBorrowAmount: SCALED_BORROW_AMOUNT.mul(3),
    });
  }

  /**
   * Returns the converted principal, as calculated by the smart contract:
   * `principal * BASE / borrowIndex`
   * @param principal principal amount to convert
   */
  async function normalizeBorrowAmount(amount: BigNumber) {
    const borrowIndex = await arc.core().borrowIndex();
    return roundUpDiv(amount, borrowIndex);
  }

  /**
   * Returns `amount * borrowIndex`, as calculated by the contract
   */
  async function denormalizeBorrowAmount(amount: BigNumber) {
    const borrowIndex = await arc.core().borrowIndex();
    return roundUpMul(amount, borrowIndex);
  }

  before(async () => {
    ctx = await generateContext(sapphireFixture, init);
    arc = ctx.sdks.sapphire;
    scoredBorrower = ctx.signers.scoredBorrower;
    borrower = ctx.signers.borrower;
    stablecoin = ctx.contracts.stablecoin;

    // mint and approve token
    await mintAndApproveCollateral(borrower, COLLATERAL_AMOUNT.mul(3));
    await mintAndApproveCollateral(scoredBorrower, COLLATERAL_AMOUNT.mul(3));

    await arc.deposit(
      COLLATERAL_AMOUNT,
      creditScoreProof,
      undefined,
      scoredBorrower,
    );
    await arc.deposit(COLLATERAL_AMOUNT, undefined, undefined, borrower);
  });

  addSnapshotBeforeRestoreAfterEach();

  it('borrows the correct amount of the given stablecoin, having collateral tokens that have other than 18 decimal places', async () => {
    const collateralAddress = await arc.core().collateralAsset();
    const collateralContract = BaseERC20Factory.connect(
      collateralAddress,
      ctx.signers.borrower,
    );
    const collateralDecimals = await collateralContract.decimals();

    expect(await stablecoin.balanceOf(scoredBorrower.address)).eq(0);

    expect(collateralDecimals).not.eq(18);
    await arc.borrow(
      BORROW_AMOUNT_500_SCORE,
      stablecoin.address,
      creditScoreProof,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );

    const {
      collateralAmount,
      normalizedBorrowedAmount,
      principal,
    } = await arc.getVault(scoredBorrower.address);

    expect(collateralAmount, 'collateral amt').eq(COLLATERAL_AMOUNT);
    expect(normalizedBorrowedAmount, 'borrow amt').eq(
      BORROW_AMOUNT_500_SCORE.mul(DEFAULT_STABLE_COIN_PRECISION_SCALAR),
    );
    expect(principal, 'principal').eq(
      BORROW_AMOUNT_500_SCORE.mul(DEFAULT_STABLE_COIN_PRECISION_SCALAR),
    );
    expect(
      await stablecoin.balanceOf(scoredBorrower.address),
      'stablecoin balance',
    ).eq(BORROW_AMOUNT_500_SCORE);
  });

  it('increases stablesLent in the pool of equivalent amount of what is borrowed', async () => {
    expect(await arc.pool().stablesLent()).eq(0);

    await arc.borrow(
      BORROW_AMOUNT,
      stablecoin.address,
      undefined,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );

    expect(await arc.pool().stablesLent()).eq(SCALED_BORROW_AMOUNT);
    expect(await stablecoin.balanceOf(scoredBorrower.address)).eq(
      BORROW_AMOUNT,
    );
  });

  it('triggers a TokensBorrowed event on the pool', async () => {
    await expect(
      arc.borrow(
        BORROW_AMOUNT,
        stablecoin.address,
        undefined,
        borrowLimitProof,
        undefined,
        scoredBorrower,
      ),
    )
      .to.emit(arc.pool(), 'TokensBorrowed')
      .withArgs(
        arc.core().address,
        stablecoin.address,
        BORROW_AMOUNT,
        scoredBorrower.address,
      );
  });

  it('transfers the stables from the pool to the user', async () => {
    const balanceBefore = await stablecoin.balanceOf(arc.pool().address);

    await arc.borrow(
      BORROW_AMOUNT,
      stablecoin.address,
      undefined,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );

    expect(await stablecoin.balanceOf(arc.pool().address)).eq(
      balanceBefore.sub(BORROW_AMOUNT),
    );
  });

  it('borrows twice with two different stablecoins', async () => {
    const anotherStablecoin = await deployTestToken(
      borrower,
      'Another Stablecoin',
      'ASTABLE',
      18,
    );
    await anotherStablecoin.mintShare(
      arc.pool().address,
      SCALED_BORROW_AMOUNT.div(2),
    );
    await ctx.contracts.sapphire.pool.setDepositLimit(
      anotherStablecoin.address,
      utils.parseEther('1000'),
    );

    expect(await stablecoin.balanceOf(scoredBorrower.address)).eq(0);
    expect(await anotherStablecoin.balanceOf(scoredBorrower.address)).eq(0);

    await arc.borrow(
      BORROW_AMOUNT.div(2),
      stablecoin.address,
      creditScoreProof,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );
    await arc.borrow(
      SCALED_BORROW_AMOUNT.div(2),
      anotherStablecoin.address,
      creditScoreProof,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );
    const {
      collateralAmount,
      normalizedBorrowedAmount,
      principal,
    } = await arc.getVault(scoredBorrower.address);

    expect(collateralAmount, 'collateral amt').eq(COLLATERAL_AMOUNT);
    expect(normalizedBorrowedAmount, 'borrow amt').eq(SCALED_BORROW_AMOUNT);
    expect(principal, 'principal').eq(SCALED_BORROW_AMOUNT);
    expect(
      await stablecoin.balanceOf(scoredBorrower.address),
      'stablecoin balance',
    ).eq(BORROW_AMOUNT.div(2));
    expect(await anotherStablecoin.balanceOf(scoredBorrower.address)).eq(
      SCALED_BORROW_AMOUNT.div(2),
    );
  });

  it('adds the borrow fee to an initial borrow amount', async () => {
    const borrowFee = utils.parseEther('0.1');
    await arc.core().setFees(0, 0, borrowFee, 0);

    let vault = await arc.getVault(scoredBorrower.address);
    expect(vault.normalizedBorrowedAmount).eq(0);
    expect(await stablecoin.balanceOf(scoredBorrower.address)).eq(0);

    await arc.borrow(
      BORROW_AMOUNT,
      stablecoin.address,
      undefined,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );

    vault = await arc.getVault(scoredBorrower.address);
    expect(vault.normalizedBorrowedAmount).eq(
      SCALED_BORROW_AMOUNT.add(roundUpMul(SCALED_BORROW_AMOUNT, borrowFee)),
    );
    expect(await stablecoin.balanceOf(scoredBorrower.address)).eq(
      BORROW_AMOUNT,
    );
  });

  it('adds the borrow fee to an existing borrow amount', async () => {
    const borrowAmt = BORROW_AMOUNT.div(4);
    await arc.borrow(
      borrowAmt,
      stablecoin.address,
      undefined,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );

    let vault = await arc.getVault(scoredBorrower.address);
    expect(vault.normalizedBorrowedAmount).eq(
      borrowAmt.mul(DEFAULT_STABLE_COIN_PRECISION_SCALAR),
    );
    expect(await stablecoin.balanceOf(scoredBorrower.address)).eq(borrowAmt);

    const borrowFee = utils.parseEther('0.1');
    await arc.core().setFees(0, 0, borrowFee, 0);

    await arc.borrow(
      borrowAmt,
      stablecoin.address,
      undefined,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );

    vault = await arc.getVault(scoredBorrower.address);
    expect(vault.normalizedBorrowedAmount).eq(
      borrowAmt
        .mul(DEFAULT_STABLE_COIN_PRECISION_SCALAR)
        .mul(2)
        .add(
          roundUpMul(
            borrowAmt.mul(DEFAULT_STABLE_COIN_PRECISION_SCALAR),
            borrowFee,
          ),
        ),
    );
    expect(await stablecoin.balanceOf(scoredBorrower.address)).eq(
      borrowAmt.mul(2),
    );
  });

  it('increases the user principal by the borrowed amount (18 decimal borrow asset)', async () => {
    const anotherStablecoin = await deployTestToken(
      borrower,
      'Another Stablecoin',
      'ASTABLE',
      18,
    );
    await anotherStablecoin.mintShare(arc.pool().address, SCALED_BORROW_AMOUNT);
    await ctx.contracts.sapphire.pool.setDepositLimit(
      anotherStablecoin.address,
      utils.parseEther('1000'),
    );

    expect(await anotherStablecoin.balanceOf(scoredBorrower.address)).eq(0);

    await arc.borrow(
      SCALED_BORROW_AMOUNT,
      anotherStablecoin.address,
      creditScoreProof,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );
    const {
      collateralAmount,
      normalizedBorrowedAmount,
      principal,
    } = await arc.getVault(scoredBorrower.address);

    expect(collateralAmount, 'collateral amt').eq(COLLATERAL_AMOUNT);
    expect(normalizedBorrowedAmount, 'borrow amt').eq(SCALED_BORROW_AMOUNT);
    expect(principal, 'principal').eq(SCALED_BORROW_AMOUNT);
    expect(await anotherStablecoin.balanceOf(scoredBorrower.address)).eq(
      SCALED_BORROW_AMOUNT,
    );
  });

  it('borrows with the highest c-ratio if proof is not provided', async () => {
    let vault = await arc.getVault(scoredBorrower.address);
    expect(vault.normalizedBorrowedAmount).to.eq(0);
    expect(vault.principal).to.eq(0);

    await arc.borrow(
      BORROW_AMOUNT,
      stablecoin.address,
      undefined,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );

    vault = await arc.getVault(scoredBorrower.address);
    expect(vault.normalizedBorrowedAmount).to.eq(SCALED_BORROW_AMOUNT);
    expect(vault.principal).to.eq(SCALED_BORROW_AMOUNT);

    await expect(
      arc.borrow(
        BigNumber.from(1),
        stablecoin.address,
        undefined,
        borrowLimitProof,
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith(
      'SapphireCoreV1: the vault will become undercollateralized',
    );
  });

  it('does not revert if borrowing <= the default borrow limit, if limit proof is passed and it is smaller than the default default limit', async () => {
    await arc
      .core()
      .setLimits(
        DEFAULT_VAULT_BORROW_MIN,
        DEFAULT_VAULT_BORROW_MAXIMUM,
        SCALED_BORROW_AMOUNT.mul(3),
      );
    expect(await arc.core().defaultBorrowLimit()).to.eq(
      SCALED_BORROW_AMOUNT.mul(3),
    );
    expect(borrowLimitProof.score).lt(SCALED_BORROW_AMOUNT.mul(3));

    await arc.deposit(
      COLLATERAL_AMOUNT.mul(2),
      creditScoreProof,
      undefined,
      scoredBorrower,
    );

    await arc.borrow(
      BORROW_AMOUNT.mul(3),
      stablecoin.address,
      undefined,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );

    expect(await stablecoin.balanceOf(scoredBorrower.address)).to.eq(
      BORROW_AMOUNT.mul(3),
    );
  });

  it('reverts if borrowing more than the default borrow limit, if limit proof is not passed', async () => {
    await arc
      .core()
      .setLimits(
        DEFAULT_VAULT_BORROW_MIN,
        DEFAULT_VAULT_BORROW_MAXIMUM,
        SCALED_BORROW_AMOUNT,
      );

    await arc.deposit(COLLATERAL_AMOUNT, undefined, undefined, scoredBorrower);

    await arc.borrow(
      BORROW_AMOUNT,
      stablecoin.address,
      undefined,
      getEmptyScoreProof(
        undefined,
        utils.formatBytes32String(BORROW_LIMIT_PROOF_PROTOCOL),
      ),
      undefined,
      scoredBorrower,
    );

    await expect(
      arc.borrow(
        utils.parseUnits('0.01', DEFAULT_STABLECOIN_DECIMALS),
        stablecoin.address,
        undefined,
        getEmptyScoreProof(
          undefined,
          utils.formatBytes32String(BORROW_LIMIT_PROOF_PROTOCOL),
        ),
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith('SapphirePassportScores: account cannot be address 0');
  });

  it('reverts if borrow limit proof is not passed and default borrow limit is 0', async () => {
    expect(await arc.core().defaultBorrowLimit()).to.eq(0);

    await expect(
      arc.borrow(
        BORROW_AMOUNT,
        stablecoin.address,
        undefined,
        getEmptyScoreProof(
          undefined,
          utils.formatBytes32String(BORROW_LIMIT_PROOF_PROTOCOL),
        ),
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith('SapphirePassportScores: account cannot be address 0');

    await expect(
      arc.borrow(
        BORROW_AMOUNT,
        stablecoin.address,
        undefined,
        getEmptyScoreProof(
          scoredBorrower.address,
          utils.formatBytes32String(BORROW_LIMIT_PROOF_PROTOCOL),
        ),
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith('SapphirePassportScores: invalid proof');
  });

  it('reverts if borrowing more than the borrow limit', async () => {
    await arc
      .pool()
      .setCoreBorrowLimit(arc.core().address, BORROW_AMOUNT.sub(1));

    await expect(
      arc.borrow(
        BORROW_AMOUNT,
        stablecoin.address,
        undefined,
        borrowLimitProof,
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith('SapphirePool: core borrow limit exceeded');
  });

  it('reverts if trying to borrow for an unsupported stablecoin', async () => {
    const testDai = await new TestTokenFactory(ctx.signers.admin).deploy(
      'Test Dai',
      'TDAI',
      18,
    );
    await testDai.mintShare(arc.pool().address, BORROW_AMOUNT);

    await expect(
      arc.borrow(
        BORROW_AMOUNT,
        testDai.address,
        undefined,
        borrowLimitProof,
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith('SapphirePool: unknown token');
  });

  it('reverts if borrow limit proof account is not msg.sender', async () => {
    await expect(
      arc.borrow(
        BORROW_AMOUNT,
        stablecoin.address,
        undefined,
        getScoreProof(borrowLimitScore1, creditScoreTree),
        undefined,
        borrower,
      ),
    ).to.be.revertedWith('SapphireCoreV1: proof.account must match msg.sender');
  });

  it('borrows with exact c-ratio', async () => {
    await arc.borrow(
      BORROW_AMOUNT,
      stablecoin.address,
      undefined,
      getScoreProof(borrowerLimitScore, creditScoreTree),
      undefined,
      borrower,
    );
    const { normalizedBorrowedAmount, principal } = await arc.getVault(
      borrower.address,
    );
    expect(normalizedBorrowedAmount).eq(SCALED_BORROW_AMOUNT);
    expect(principal).eq(SCALED_BORROW_AMOUNT);
  });

  it('borrows more if borrow limit is increased', async () => {
    await mintAndApproveCollateral(scoredBorrower, COLLATERAL_AMOUNT.mul(2));
    await arc.deposit(
      COLLATERAL_AMOUNT.mul(2),
      undefined,
      undefined,
      scoredBorrower,
    );
    await arc.borrow(
      BigNumber.from(borrowLimitScore1.score).div(
        DEFAULT_STABLE_COIN_PRECISION_SCALAR,
      ),
      stablecoin.address,
      creditScoreProof,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );

    const additionalBorrowAmount = utils.parseUnits(
      '0.01',
      DEFAULT_STABLECOIN_DECIMALS,
    );

    await expect(
      arc.borrow(
        additionalBorrowAmount,
        stablecoin.address,
        creditScoreProof,
        borrowLimitProof,
        undefined,
        scoredBorrower,
      ),
      'User should not be able to borrow more',
    ).to.be.revertedWith(
      'SapphireCoreV1: total borrow amount should not exceed borrow limit',
    );

    const borrowLimitScore = {
      ...borrowLimitScore1,
      score: BigNumber.from(borrowLimitScore1.score).add(
        additionalBorrowAmount.mul(DEFAULT_STABLE_COIN_PRECISION_SCALAR),
      ),
    };
    const newPassportScoreTree = new PassportScoreTree([
      creditScore1,
      creditScore2,
      borrowLimitScore,
    ]);

    await immediatelyUpdateMerkleRoot(
      ctx.contracts.sapphire.passportScores.connect(ctx.signers.interestSetter),
      newPassportScoreTree.getHexRoot(),
    );

    await arc.borrow(
      additionalBorrowAmount,
      stablecoin.address,
      getScoreProof(creditScore1, newPassportScoreTree),
      getScoreProof(borrowLimitScore, newPassportScoreTree),
      undefined,
      scoredBorrower,
    );

    await expect(
      arc.borrow(
        additionalBorrowAmount,
        stablecoin.address,
        getScoreProof(creditScore1, newPassportScoreTree),
        getScoreProof(borrowLimitScore, newPassportScoreTree),
        undefined,
        scoredBorrower,
      ),
      'User should not be able to borrow more',
    ).to.be.revertedWith(
      'SapphireCoreV1: total borrow amount should not exceed borrow limit',
    );
  });

  it('reverts if the credit proof protocol does not match the one registered', async () => {
    await expect(
      arc.borrow(
        BORROW_AMOUNT,
        stablecoin.address,
        getScoreProof(scoredBorrowerOtherScore, creditScoreTree),
        borrowLimitProof,
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith('SapphireCoreV1: incorrect credit score protocol');
  });

  it('reverts if the borrow limit proof protocol does not match the one registered', async () => {
    await expect(
      arc.borrow(
        BORROW_AMOUNT,
        stablecoin.address,
        getScoreProof(creditScore1, creditScoreTree),
        getScoreProof(creditScore1, creditScoreTree),
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith(
      'SapphireCoreV1: incorrect borrow limit proof protocol',
    );
  });

  it('reverts if borrower cross the c-ratio', async () => {
    const {
      normalizedBorrowedAmount,
      collateralAmount,
      principal,
    } = await arc.getVault(borrower.address);

    expect(normalizedBorrowedAmount).eq(0);
    expect(principal).eq(0);
    expect(collateralAmount).eq(COLLATERAL_AMOUNT);

    await expect(
      arc.borrow(
        BORROW_AMOUNT.mul(10),
        stablecoin.address,
        undefined,
        getScoreProof(borrowerLimitScore, creditScoreTree),
        undefined,
        borrower,
      ),
    ).to.be.revertedWith(
      'SapphireCoreV1: the vault will become undercollateralized',
    );
  });

  it('borrows more if more collateral is provided', async () => {
    await arc.borrow(
      BORROW_AMOUNT,
      stablecoin.address,
      undefined,
      getScoreProof(borrowerLimitScore, creditScoreTree),
      undefined,
      borrower,
    );
    const { normalizedBorrowedAmount, principal } = await arc.getVault(
      borrower.address,
    );

    expect(principal).eq(SCALED_BORROW_AMOUNT);
    expect(normalizedBorrowedAmount).eq(SCALED_BORROW_AMOUNT);
    await expect(
      arc.borrow(
        BORROW_AMOUNT,
        stablecoin.address,
        undefined,
        getScoreProof(borrowerLimitScore, creditScoreTree),
        undefined,
        borrower,
      ),
    ).to.be.reverted;

    await mintAndApproveCollateral(borrower);

    await arc.deposit(COLLATERAL_AMOUNT, undefined, undefined, borrower);
    /**
     * -1 because of rounding.
     * The contract will calculate the c-ratio to 199.99..% otherwise and the tx will
     * be reverted
     */
    await arc.borrow(
      BORROW_AMOUNT,
      stablecoin.address,
      undefined,
      getScoreProof(borrowerLimitScore, creditScoreTree),
      undefined,
      borrower,
    );
    const {
      normalizedBorrowedAmount: updatedBorrowedAmount,
      principal: updatedPrincipal,
    } = await arc.getVault(borrower.address);

    expect(updatedBorrowedAmount).eq(SCALED_BORROW_AMOUNT.mul(2));
    expect(updatedPrincipal).eq(SCALED_BORROW_AMOUNT.mul(2));
  });

  it('borrows more if a valid score proof is provided', async () => {
    // With the credit score user can borrow more than amount based default collateral ratio
    await arc.borrow(
      BORROW_AMOUNT_500_SCORE,
      stablecoin.address,
      creditScoreProof,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );

    const { normalizedBorrowedAmount, principal } = await arc.getVault(
      scoredBorrower.address,
    );

    expect(normalizedBorrowedAmount).eq(
      BORROW_AMOUNT_500_SCORE.mul(DEFAULT_STABLE_COIN_PRECISION_SCALAR),
    );
    expect(principal).eq(
      BORROW_AMOUNT_500_SCORE.mul(DEFAULT_STABLE_COIN_PRECISION_SCALAR),
    );
  });

  it('borrows more if the credit score increases', async () => {
    // The user's existing credit score is updated and increases letting them borrow more
    await arc.borrow(
      BORROW_AMOUNT_500_SCORE,
      stablecoin.address,
      creditScoreProof,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );

    const additionalBorrowAmount = utils.parseUnits(
      '0.01',
      DEFAULT_STABLECOIN_DECIMALS,
    );

    // Borrowing BASE rather than BigNumber.from(1), because that number is too small adn won't cause a reversal
    // due to rounding margins
    await expect(
      arc.borrow(
        additionalBorrowAmount,
        stablecoin.address,
        creditScoreProof,
        borrowLimitProof,
        undefined,
        scoredBorrower,
      ),
      'User should not be able to borrow more',
    ).to.be.revertedWith(
      'SapphireCoreV1: the vault will become undercollateralized',
    );

    // Prepare the new root hash with the increased credit score for borrower
    const creditScore = {
      account: scoredBorrower.address,
      protocol: utils.formatBytes32String(CREDIT_PROOF_PROTOCOL),
      score: BigNumber.from(800),
    };
    const newPassportScoreTree = new PassportScoreTree([
      creditScore,
      creditScore2,
      borrowLimitScore1,
    ]);

    await immediatelyUpdateMerkleRoot(
      ctx.contracts.sapphire.passportScores.connect(ctx.signers.interestSetter),
      newPassportScoreTree.getHexRoot(),
    );

    await arc.borrow(
      additionalBorrowAmount,
      stablecoin.address,
      getScoreProof(creditScore, newPassportScoreTree),
      getScoreProof(borrowLimitScore1, newPassportScoreTree),
      undefined,
      scoredBorrower,
    );

    const {
      normalizedBorrowedAmount: vaultBorrowAmount,
      principal,
    } = await arc.getVault(scoredBorrower.address);
    const expectedVaultBorrowAmt = await normalizeBorrowAmount(
      (await denormalizeBorrowAmount(BORROW_AMOUNT_500_SCORE))
        .mul(DEFAULT_STABLE_COIN_PRECISION_SCALAR)
        .add(additionalBorrowAmount.mul(DEFAULT_STABLE_COIN_PRECISION_SCALAR)),
    );
    expect(vaultBorrowAmount).eq(expectedVaultBorrowAmt);
    expect(principal).eq(
      BORROW_AMOUNT_500_SCORE.mul(DEFAULT_STABLE_COIN_PRECISION_SCALAR).add(
        additionalBorrowAmount.mul(DEFAULT_STABLE_COIN_PRECISION_SCALAR),
      ),
    );
  });

  it('borrows less if the credit score decreases', async () => {
    // The user's existing credit score is updated and decreases letting them borrow less

    // Prepare the new root hash with the decreased credit score for borrower
    const creditScore = {
      account: scoredBorrower.address,
      protocol: utils.formatBytes32String(CREDIT_PROOF_PROTOCOL),
      score: BigNumber.from(100),
    };
    const newPassportScoreTree = new PassportScoreTree([
      creditScore,
      creditScore2,
    ]);
    await immediatelyUpdateMerkleRoot(
      ctx.contracts.sapphire.passportScores.connect(ctx.signers.interestSetter),
      newPassportScoreTree.getHexRoot(),
    );

    // Shouldn't be able to borrow the same as with credit score equals 500
    await expect(
      arc.borrow(
        BORROW_AMOUNT_500_SCORE,
        stablecoin.address,
        getScoreProof(creditScore, newPassportScoreTree),
        borrowLimitProof,
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith(
      'SapphireCoreV1: the vault will become undercollateralized',
    );
  });

  it('updates the total borrowed amount correctly', async () => {
    await arc.borrow(
      BORROW_AMOUNT_500_SCORE,
      stablecoin.address,
      creditScoreProof,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );

    const { normalizedBorrowedAmount } = await arc.getVault(
      scoredBorrower.address,
    );

    expect(normalizedBorrowedAmount).eq(
      BORROW_AMOUNT_500_SCORE.mul(DEFAULT_STABLE_COIN_PRECISION_SCALAR),
    );
    expect(await ctx.contracts.sapphire.core.normalizedTotalBorrowed()).eq(
      BORROW_AMOUNT_500_SCORE.mul(DEFAULT_STABLE_COIN_PRECISION_SCALAR),
    );

    await arc.deposit(
      COLLATERAL_AMOUNT,
      undefined,
      undefined,
      ctx.signers.borrower,
    );

    await arc.borrow(
      BORROW_AMOUNT,
      stablecoin.address,
      undefined,
      getScoreProof(borrowerLimitScore, creditScoreTree),
      undefined,
      ctx.signers.borrower,
    );
    expect(await ctx.contracts.sapphire.core.normalizedTotalBorrowed()).eq(
      BORROW_AMOUNT_500_SCORE.mul(DEFAULT_STABLE_COIN_PRECISION_SCALAR).add(
        SCALED_BORROW_AMOUNT,
      ),
    );
  });

  it(`should not borrow if the price from the oracle is 0`, async () => {
    await ctx.contracts.sapphire.oracle.setPrice(0);
    await expect(
      arc.borrow(
        BORROW_AMOUNT,
        stablecoin.address,
        creditScoreProof,
        borrowLimitProof,
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith('SapphireCoreV1: the oracle returned a price of 0');
  });

  it('should not borrow more if the c-ratio is at the minimum', async () => {
    await arc.borrow(
      BORROW_AMOUNT,
      stablecoin.address,
      undefined,
      getScoreProof(borrowerLimitScore, creditScoreTree),
      undefined,
      borrower,
    );
    const { normalizedBorrowedAmount } = await arc.getVault(borrower.address);
    expect(normalizedBorrowedAmount).eq(SCALED_BORROW_AMOUNT);
    await expect(
      arc.borrow(
        utils.parseUnits('0.01', DEFAULT_STABLECOIN_DECIMALS),
        stablecoin.address,
        undefined,
        getScoreProof(borrowerLimitScore, creditScoreTree),
        undefined,
        borrower,
      ),
    ).to.be.revertedWith(
      'SapphireCoreV1: the vault will become undercollateralized',
    );
  });

  it('should not borrow more if the price decreases', async () => {
    await arc.borrow(
      BORROW_AMOUNT_500_SCORE.div(2),
      stablecoin.address,
      creditScoreProof,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );
    await arc.borrow(
      BORROW_AMOUNT_500_SCORE.div(4),
      stablecoin.address,
      creditScoreProof,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );
    await arc.updatePrice(utils.parseEther('0.99'));
    await expect(
      arc.borrow(
        BORROW_AMOUNT_500_SCORE.div(4),
        stablecoin.address,
        creditScoreProof,
        borrowLimitProof,
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith(
      'SapphireCoreV1: the vault will become undercollateralized',
    );
  });

  it(`should not borrow if using someone else's score proof`, async () => {
    await arc.borrow(
      BORROW_AMOUNT_500_SCORE,
      stablecoin.address,
      creditScoreProof,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );

    const interestSetterScoreProof = getScoreProof(
      creditScore2,
      creditScoreTree,
    );
    expect(interestSetterScoreProof.score).to.eq(1000);

    await expect(
      arc.borrow(
        utils.parseUnits('1', DEFAULT_STABLECOIN_DECIMALS),
        stablecoin.address,
        interestSetterScoreProof,
        undefined,
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith('SapphireCoreV1: proof.account must match msg.sender');
  });

  it('should not borrow more if more interest has accrued', async () => {
    const secondBorrowAmount = BigNumber.from(10);
    const firstBorrowAmount = BORROW_AMOUNT.sub(secondBorrowAmount);

    await arc.borrow(
      firstBorrowAmount,
      stablecoin.address,
      creditScoreProof,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );
    const { normalizedBorrowedAmount, principal } = await arc.getVault(
      scoredBorrower.address,
    );
    expect(normalizedBorrowedAmount).eq(
      firstBorrowAmount.mul(DEFAULT_STABLE_COIN_PRECISION_SCALAR),
    );
    expect(principal).eq(
      firstBorrowAmount.mul(DEFAULT_STABLE_COIN_PRECISION_SCALAR),
    );

    const currentTimeStamp = await arc.core().currentTimestamp();
    await arc
      .core()
      .connect(ctx.signers.interestSetter)
      .setInterestRate('21820606488');
    await arc.updateTime(currentTimeStamp.add(ONE_YEAR_IN_SECONDS));

    await expect(
      arc.borrow(
        BORROW_AMOUNT,
        stablecoin.address,
        creditScoreProof,
        borrowLimitProof,
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith(
      'SapphireCoreV1: the vault will become undercollateralized',
    );
  });

  it('should not borrow more than the proof borrow limit', async () => {
    await mintAndApproveCollateral(scoredBorrower, COLLATERAL_AMOUNT);
    await arc.deposit(COLLATERAL_AMOUNT, undefined, undefined, scoredBorrower);
    const borrowAmount = BigNumber.from(borrowLimitProof.score)
      .div(DEFAULT_STABLE_COIN_PRECISION_SCALAR)
      .add(1);
    await expect(
      arc.borrow(
        borrowAmount,
        stablecoin.address,
        creditScoreProof,
        borrowLimitProof,
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith(
      'SapphireCoreV1: total borrow amount should not exceed borrow limit',
    );
  });

  it('should not borrow less than the minimum borrow limit', async () => {
    const vaultBorrowMaximum = await arc.core().vaultBorrowMaximum();
    await arc.core().setLimits(SCALED_BORROW_AMOUNT, vaultBorrowMaximum, 0);
    await expect(
      arc.borrow(
        BORROW_AMOUNT.sub(10),
        stablecoin.address,
        creditScoreProof,
        borrowLimitProof,
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith(
      'SapphireCoreV1: borrowed amount cannot be less than limit',
    );
  });

  it('should not borrow more than the maximum amount', async () => {
    const vaultBorrowMinimum = await arc.core().vaultBorrowMinimum();
    // Only update the vault borrow maximum
    await arc.core().setLimits(vaultBorrowMinimum, SCALED_BORROW_AMOUNT, 0);

    await arc.borrow(
      BORROW_AMOUNT.div(2),
      stablecoin.address,
      creditScoreProof,
      borrowLimitProof,
      undefined,
      scoredBorrower,
    );
    await expect(
      arc.borrow(
        BORROW_AMOUNT.div(2).add(1),
        stablecoin.address,
        creditScoreProof,
        borrowLimitProof,
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith(
      'SapphireCoreV1: borrowed amount cannot be greater than vault limit',
    );
  });

  it('should not borrow if contract is paused', async () => {
    await arc.core().connect(ctx.signers.pauseOperator).setPause(true);
    await expect(
      arc.borrow(
        BORROW_AMOUNT,
        stablecoin.address,
        creditScoreProof,
        borrowLimitProof,
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith('SapphireCoreV1: the contract is paused');
  });

  it('should not borrow if the collateral price is stale', async () => {
    const now = BigNumber.from(Date.now());

    // Set the core timestamp to now
    await arc.updateTime(now);

    // Set the oracle timestamp to > half a day
    await arc.setOracleTimestamp(now.sub(60 * 60 * 12 + 1));

    await expect(
      arc.borrow(
        BORROW_AMOUNT,
        stablecoin.address,
        creditScoreProof,
        borrowLimitProof,
        undefined,
        scoredBorrower,
      ),
    ).to.be.revertedWith('SapphireCoreV1: the oracle has stale prices');
  });

  it('emits Borrowed event when a borrow occurs', async () => {
    await expect(
      arc.borrow(
        BORROW_AMOUNT,
        stablecoin.address,
        creditScoreProof,
        borrowLimitProof,
        undefined,
        scoredBorrower,
      ),
    )
      .to.emit(arc.core(), 'Borrowed')
      .withArgs(
        scoredBorrower.address,
        BORROW_AMOUNT,
        stablecoin.address,
        COLLATERAL_AMOUNT,
        SCALED_BORROW_AMOUNT,
        SCALED_BORROW_AMOUNT,
      );
  });
});
