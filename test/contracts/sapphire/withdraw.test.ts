import { PassportScore } from '@arc-types/sapphireTypes';
import { TestingSigners } from '@test/testTypes';
import { BigNumber } from '@ethersproject/bignumber';
import { BASE } from '@src/constants';
import { PassportScoreTree } from '@src/MerkleTree';
import { SapphireTestArc } from '@test/helpers/SapphireTestArc';
import { SapphireAssessor, TestTokenFactory } from '@src/typings';
import { getScoreProof } from '@src/utils/getScoreProof';
import {
  DEFAULT_COLLATERAL_DECIMALS,
  DEFAULT_HIGH_C_RATIO,
  DEFAULT_LOW_C_RATIO,
  DEFAULT_PRICE,
  DEFAULT_STABLE_COIN_PRECISION_SCALAR,
} from '@test/helpers/sapphireDefaults';
import { CREDIT_PROOF_PROTOCOL } from '@src/constants';
import { setupBaseVault } from '@test/helpers/setupBaseVault';
import {
  addSnapshotBeforeRestoreAfterEach,
  immediatelyUpdateMerkleRoot,
} from '@test/helpers/testingUtils';
import { expect } from 'chai';
import { constants, utils } from 'ethers';
import { generateContext, ITestContext } from '../context';
import { sapphireFixture } from '../fixtures';
import { setupSapphire } from '../setup';
import { BORROW_LIMIT_PROOF_PROTOCOL } from '@test/constants';

const COLLATERAL_AMOUNT = utils.parseUnits('1000', DEFAULT_COLLATERAL_DECIMALS);
const SCALED_BORROW_AMOUNT = utils.parseEther('200');
const BORROW_AMOUNT = utils
  .parseEther('200')
  .div(DEFAULT_STABLE_COIN_PRECISION_SCALAR);
/**
 * Add +1 at the end to account for rounding.
 * When the contract computes the c-ratio, it will be slightly smaller to be on the
 * safe side.
 */
const COLLATERAL_LIMIT = SCALED_BORROW_AMOUNT.mul(DEFAULT_HIGH_C_RATIO)
  .div(DEFAULT_PRICE)
  .div(BASE)
  .mul(BigNumber.from(10).pow(DEFAULT_COLLATERAL_DECIMALS));

/**
 * The withdraw function allows a user to withdraw collateral from a vault, partially or completely.
 * It does not require a credit score proof, but if provided, the user can potentially withdraw
 * more, depending on the amount of debt they have.
 */
describe('SapphireCore.withdraw()', () => {
  let ctx: ITestContext;
  let arc: SapphireTestArc;
  let signers: TestingSigners;
  let borrowerCreditScore: PassportScore;
  let scoredBorrowerBorrowLimitScore: PassportScore;
  let borrowerBorrowLimitScore: PassportScore;
  let creditScoreTree: PassportScoreTree;
  let assessor: SapphireAssessor;

  async function init(ctx: ITestContext) {
    borrowerCreditScore = {
      account: ctx.signers.scoredBorrower.address,
      protocol: utils.formatBytes32String(CREDIT_PROOF_PROTOCOL),
      score: BigNumber.from(500),
    };
    const creditScore2 = {
      account: ctx.signers.interestSetter.address,
      protocol: utils.formatBytes32String(CREDIT_PROOF_PROTOCOL),
      score: BigNumber.from(20),
    };
    scoredBorrowerBorrowLimitScore = {
      account: ctx.signers.scoredBorrower.address,
      protocol: utils.formatBytes32String(BORROW_LIMIT_PROOF_PROTOCOL),
      score: SCALED_BORROW_AMOUNT,
    };
    borrowerBorrowLimitScore = {
      account: ctx.signers.borrower.address,
      protocol: utils.formatBytes32String(BORROW_LIMIT_PROOF_PROTOCOL),
      score: SCALED_BORROW_AMOUNT,
    };
    creditScoreTree = new PassportScoreTree([
      borrowerCreditScore,
      creditScore2,
      borrowerBorrowLimitScore,
      scoredBorrowerBorrowLimitScore,
    ]);

    await setupSapphire(ctx, {
      merkleRoot: creditScoreTree.getHexRoot(),
      poolDepositBorrowAmount: SCALED_BORROW_AMOUNT.mul(3),
    });
  }

  before(async () => {
    ctx = await generateContext(sapphireFixture, init);
    signers = ctx.signers;
    arc = ctx.sdks.sapphire;
    assessor = ctx.contracts.sapphire.assessor;
  });

  addSnapshotBeforeRestoreAfterEach();

  it('withdraws the entire collateral amount if no debt is minted', async () => {
    await setupBaseVault(
      arc,
      signers.scoredBorrower,
      getScoreProof(scoredBorrowerBorrowLimitScore, creditScoreTree),
      COLLATERAL_AMOUNT,
      constants.Zero,
    );
    let vault = await arc.getVault(signers.scoredBorrower.address);
    expect(vault.collateralAmount).to.eq(COLLATERAL_AMOUNT);
    expect(vault.normalizedBorrowedAmount).to.eq(0);

    const preBalance = await arc
      .collateral()
      .balanceOf(signers.scoredBorrower.address);
    const { wait } = await arc.withdraw(
      COLLATERAL_AMOUNT,
      undefined,
      undefined,
      signers.scoredBorrower,
    );
    await wait();

    const postBalance = await arc
      .collateral()
      .balanceOf(signers.scoredBorrower.address);
    vault = await arc.getVault(signers.scoredBorrower.address);

    expect(vault.collateralAmount).to.eq(BigNumber.from(0));
    expect(postBalance).to.eq(preBalance.add(COLLATERAL_AMOUNT));
  });

  it('withdraws to the limit', async () => {
    await setupBaseVault(
      arc,
      signers.borrower,
      getScoreProof(borrowerBorrowLimitScore, creditScoreTree),
      COLLATERAL_AMOUNT,
      BORROW_AMOUNT,
    );

    // Withdraw the max collateral to respect the c-ratio set by DEFAULT_HIGH_C_RATIO
    const withdrawAmt = COLLATERAL_AMOUNT.sub(COLLATERAL_LIMIT);
    const preBalance = await arc
      .collateral()
      .balanceOf(signers.borrower.address);

    await arc.withdraw(withdrawAmt, undefined, undefined, signers.borrower);

    const postBalance = await arc
      .collateral()
      .balanceOf(signers.borrower.address);
    const vault = await arc.getVault(signers.borrower.address);

    expect(vault.collateralAmount).to.eq(COLLATERAL_LIMIT);
    expect(postBalance).to.eq(preBalance.add(withdrawAmt));

    await expect(
      arc.withdraw(BigNumber.from(1), undefined, undefined, signers.borrower),
    ).to.be.revertedWith(
      'SapphireCoreV1: the vault will become undercollateralized',
    );
  });

  it('withdraws more collateral with a valid score proof', async () => {
    await setupBaseVault(
      arc,
      signers.scoredBorrower,
      getScoreProof(scoredBorrowerBorrowLimitScore, creditScoreTree),
      COLLATERAL_AMOUNT,
      BORROW_AMOUNT,
      undefined,
    );
    /**
     * Since the credit score is higher, the user can withdraw more because the minimum
     * c-ratio is lower
     */

    // Withdraw the max collateral to respect the c-ratio set by DEFAULT_HIGH_C_RATIO
    const withdrawAmt1 = COLLATERAL_AMOUNT.sub(COLLATERAL_LIMIT);

    const preBalance = await arc
      .collateral()
      .balanceOf(signers.scoredBorrower.address);

    // Withdraw the same amount as permitted without a credit score
    await arc.withdraw(
      withdrawAmt1,
      getScoreProof(borrowerCreditScore, creditScoreTree),
      undefined,
      signers.scoredBorrower,
    );

    const scoredCRatio = await assessor.assess(
      DEFAULT_LOW_C_RATIO,
      DEFAULT_HIGH_C_RATIO,
      getScoreProof(borrowerCreditScore, creditScoreTree),
      true,
    );

    const remainingAmount2 = SCALED_BORROW_AMOUNT.mul(scoredCRatio)
      .mul(BigNumber.from(10).pow(DEFAULT_COLLATERAL_DECIMALS))
      .div(DEFAULT_PRICE)
      .div(BASE)
      .add(1); // Account for rounding up
    const withdrawAmt2 = COLLATERAL_LIMIT.sub(remainingAmount2);

    // Withdraw more - to the limit permitted by the credit score
    await arc.withdraw(
      withdrawAmt2,
      getScoreProof(borrowerCreditScore, creditScoreTree),
      undefined,
      signers.scoredBorrower,
    );

    const postBalance = await arc
      .collateral()
      .balanceOf(signers.scoredBorrower.address);
    const vault = await arc.getVault(signers.scoredBorrower.address);

    expect(postBalance).to.eq(preBalance.add(withdrawAmt1).add(withdrawAmt2));
    expect(vault.collateralAmount).to.eq(remainingAmount2);
  });

  it('withdraws the correct amount of collateral, given that collateral has a different number of decimals than 18', async () => {
    const collateralAddress = await arc.core().collateralAsset();
    const collateralContract = TestTokenFactory.connect(
      collateralAddress,
      signers.scoredBorrower,
    );

    const collateralDecimals = await collateralContract.decimals();
    expect(collateralDecimals).not.eq(18);

    await collateralContract.mintShare(
      signers.scoredBorrower.address,
      COLLATERAL_AMOUNT,
    );
    await collateralContract.approve(arc.core().address, COLLATERAL_AMOUNT);

    expect(
      await collateralContract.balanceOf(signers.scoredBorrower.address),
    ).eq(COLLATERAL_AMOUNT);

    await arc.deposit(
      COLLATERAL_AMOUNT,
      undefined,
      undefined,
      signers.scoredBorrower,
    );

    const { collateralAmount } = await arc.getVault(
      signers.scoredBorrower.address,
    );
    expect(collateralAmount).to.eq(COLLATERAL_AMOUNT);
    expect(await collateralContract.balanceOf(arc.coreAddress())).eq(
      COLLATERAL_AMOUNT,
    );

    await arc.withdraw(
      COLLATERAL_AMOUNT,
      undefined,
      undefined,
      signers.scoredBorrower,
    );

    expect(
      await collateralContract.balanceOf(signers.scoredBorrower.address),
    ).eq(COLLATERAL_AMOUNT);
  });

  it('reverts if the resulting vault ends up below the minimum c-ratio', async () => {
    await setupBaseVault(
      arc,
      signers.scoredBorrower,
      getScoreProof(scoredBorrowerBorrowLimitScore, creditScoreTree),
      COLLATERAL_AMOUNT,
      BORROW_AMOUNT,
    );

    const maxWithdrawAmt = COLLATERAL_AMOUNT.sub(COLLATERAL_LIMIT);

    await arc.withdraw(
      maxWithdrawAmt,
      undefined,
      undefined,
      signers.scoredBorrower,
    );

    await expect(
      arc.withdraw(
        BigNumber.from(1),
        undefined,
        undefined,
        signers.scoredBorrower,
      ),
    ).to.be.revertedWith(
      'SapphireCoreV1: the vault will become undercollateralized',
    );
  });

  it(`reverts if the score proof is not the caller's`, async () => {
    await setupBaseVault(
      arc,
      signers.scoredBorrower,
      getScoreProof(scoredBorrowerBorrowLimitScore, creditScoreTree),
      COLLATERAL_AMOUNT,
      BORROW_AMOUNT,
    );

    const maxWithdrawAmt = COLLATERAL_AMOUNT.sub(COLLATERAL_LIMIT);

    await arc.withdraw(
      maxWithdrawAmt,
      undefined,
      undefined,
      signers.scoredBorrower,
    );

    // A new user with credit score 1000 is added to the tree
    const maxCreditScore = {
      account: signers.staker.address,
      protocol: utils.formatBytes32String(CREDIT_PROOF_PROTOCOL),
      score: BigNumber.from(1000),
    };
    const newCreditTree = new PassportScoreTree([
      borrowerCreditScore,
      maxCreditScore,
    ]);

    await immediatelyUpdateMerkleRoot(
      ctx.contracts.sapphire.passportScores.connect(signers.interestSetter),
      newCreditTree.getHexRoot(),
    );

    await expect(
      arc.withdraw(
        BigNumber.from(1),
        getScoreProof(maxCreditScore, newCreditTree),
        undefined,
        signers.scoredBorrower,
      ),
    ).to.be.revertedWith(`SapphireCoreV1: proof.account must match msg.sender`);
  });

  it('reverts if vault is undercollateralized', async () => {
    await setupBaseVault(
      arc,
      signers.scoredBorrower,
      getScoreProof(scoredBorrowerBorrowLimitScore, creditScoreTree),
      COLLATERAL_AMOUNT,
      BORROW_AMOUNT,
      getScoreProof(borrowerCreditScore, creditScoreTree),
    );

    // Drop price to make position undercollateralized
    await arc.updatePrice(utils.parseEther('0.15'));

    await expect(
      arc.withdraw(
        BigNumber.from(1),
        undefined,
        undefined,
        signers.scoredBorrower,
      ),
    ).to.be.revertedWith(
      'SapphireCoreV1: the vault will become undercollateralized',
    );
  });

  it('reverts if withdrawing more collateral than the amount in the vault', async () => {
    await setupBaseVault(
      arc,
      signers.scoredBorrower,
      getScoreProof(scoredBorrowerBorrowLimitScore, creditScoreTree),
      COLLATERAL_AMOUNT,
      BigNumber.from('0'),
    );
    await expect(
      arc.withdraw(
        COLLATERAL_AMOUNT.add(1),
        undefined,
        undefined,
        signers.scoredBorrower,
      ),
    ).to.be.revertedWith(
      'SapphireCoreV1: cannot withdraw more collateral than the vault balance',
    );
  });

  it('reverts if contract is paused', async () => {
    await setupBaseVault(
      arc,
      signers.scoredBorrower,
      getScoreProof(scoredBorrowerBorrowLimitScore, creditScoreTree),
      COLLATERAL_AMOUNT,
      BORROW_AMOUNT,
      getScoreProof(borrowerCreditScore, creditScoreTree),
    );

    await arc.core().connect(signers.pauseOperator).setPause(true);

    await expect(
      arc.withdraw(
        BigNumber.from(1),
        undefined,
        undefined,
        signers.scoredBorrower,
      ),
    ).to.be.revertedWith('SapphireCoreV1: the contract is paused');
  });

  it('emits the Withdrawn event', async () => {
    const scoreProof = getScoreProof(
      scoredBorrowerBorrowLimitScore,
      creditScoreTree,
    );
    await setupBaseVault(
      arc,
      signers.scoredBorrower,
      scoreProof,
      COLLATERAL_AMOUNT,
      constants.Zero,
    );

    await expect(
      arc.withdraw(
        COLLATERAL_AMOUNT,
        undefined,
        undefined,
        signers.scoredBorrower,
      ),
    )
      .to.emit(arc.core(), 'Withdrawn')
      .withArgs(signers.scoredBorrower.address, COLLATERAL_AMOUNT, 0, 0, 0);
  });
});
