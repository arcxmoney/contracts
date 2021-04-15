import { CreditScore } from '@arc-types/sapphireCore';
import { TestingSigners } from '@arc-types/testing';
import { EventFragment } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber';
import { BASE } from '@src/constants';
import CreditScoreTree from '@src/MerkleTree/CreditScoreTree';
import { SapphireTestArc } from '@src/SapphireTestArc';
import { BaseERC20Factory, SapphireAssessor, TestTokenFactory } from '@src/typings';
import { getEvent } from '@src/utils/getEvent';
import { getScoreProof } from '@src/utils/getScoreProof';
import {
  DEFAULT_COLLATERAL_DECIMALS,
  DEFAULT_HiGH_C_RATIO,
  DEFAULT_LOW_C_RATIO,
  DEFAULT_PRICE,
} from '@test/helpers/sapphireDefaults';
import { setupBaseVault } from '@test/helpers/setupBaseVault';
import { addSnapshotBeforeRestoreAfterEach } from '@test/helpers/testingUtils';
import { expect } from 'chai';
import { utils } from 'ethers';
import { generateContext, ITestContext } from '../context';
import { sapphireFixture } from '../fixtures';
import { setupSapphire } from '../setup';

const NORMALIZED_COLLATERAL_AMOUNT = utils.parseEther('1000');
const COLLATERAL_AMOUNT = utils.parseUnits('1000', DEFAULT_COLLATERAL_DECIMALS);
const BORROW_AMOUNT = utils.parseEther('200');

/**
 * The withdraw function allows a user to withdraw collateral from a vault, partially or completely.
 * It does not require a credit score proof, but if provided, the user can potentially withdraw
 * more, depending on the amount of debt they have.
 */
describe.only('SapphireCore.withdraw()', () => {
  let arc: SapphireTestArc;
  let signers: TestingSigners;
  let minterCreditScore: CreditScore;
  let creditScoreTree: CreditScoreTree;
  let assessor: SapphireAssessor;

  async function init(ctx: ITestContext) {
    minterCreditScore = {
      account: ctx.signers.scoredMinter.address,
      amount: BigNumber.from(500),
    };
    const creditScore2 = {
      account: ctx.signers.interestSetter.address,
      amount: BigNumber.from(20),
    };
    creditScoreTree = new CreditScoreTree([minterCreditScore, creditScore2]);

    await setupSapphire(ctx, {
      merkleRoot: creditScoreTree.getHexRoot(),
      price: DEFAULT_PRICE,
    });
  }

  before(async () => {
    const ctx = await generateContext(sapphireFixture, init);
    signers = ctx.signers;
    arc = ctx.sdks.sapphire;
    assessor = ctx.contracts.sapphire.assessor;
  });

  addSnapshotBeforeRestoreAfterEach();

  it('withdraws the entire collateral amount if no debt is minted', async () => {
    await setupBaseVault(arc, signers.scoredMinter, COLLATERAL_AMOUNT, BigNumber.from(0));
    let vault = await arc.getVault(signers.scoredMinter.address);
    expect(vault.collateralAmount).to.eq(COLLATERAL_AMOUNT);
    expect(vault.borrowedAmount).to.eq(0);

    const preBalance = await arc.collateral().balanceOf(signers.scoredMinter.address);
    const { wait } = await arc.withdraw(
      COLLATERAL_AMOUNT,
      undefined,
      undefined,
      signers.scoredMinter,
    );
    await wait();

    const postBalance = await arc.collateral().balanceOf(signers.scoredMinter.address);
    vault = await arc.getVault(signers.scoredMinter.address);

    expect(vault.collateralAmount).to.eq(BigNumber.from(0));
    expect(postBalance).to.eq(preBalance.add(COLLATERAL_AMOUNT));
  });

  it('withdraws to the limit', async () => {
    await setupBaseVault(arc, signers.minter, COLLATERAL_AMOUNT, BORROW_AMOUNT);

    // Withdraw the max collateral to respect the c-ratio set by DEFAULT_HiGH_C_RATIO
    const remainingAmount = BORROW_AMOUNT.mul(DEFAULT_HiGH_C_RATIO)
      .div(DEFAULT_PRICE)
      .mul(BigNumber.from(10).pow(DEFAULT_COLLATERAL_DECIMALS))
      .div(BASE);
    const withdrawAmt = COLLATERAL_AMOUNT.sub(remainingAmount);
    const preBalance = await arc.collateral().balanceOf(signers.minter.address);

    await arc.withdraw(withdrawAmt, undefined, undefined, signers.minter);

    const postBalance = await arc.collateral().balanceOf(signers.minter.address);
    const vault = await arc.getVault(signers.minter.address);

    expect(vault.collateralAmount).to.eq(remainingAmount);
    expect(postBalance).to.eq(preBalance.add(withdrawAmt));

    await expect(
      arc.withdraw(BigNumber.from(1), undefined, undefined, signers.minter),
    ).to.be.revertedWith('SapphireCoreV1: the vault will become undercollateralized');
  });

  it('withdraws more collateral with a valid score proof', async () => {
    await setupBaseVault(arc, signers.scoredMinter, COLLATERAL_AMOUNT, BORROW_AMOUNT, undefined);
    /**
     * Since the credit score is higher, the user can withdraw more because the minimum
     * c-ratio is lower
     */

    // Withdraw the max collateral to respect the c-ratio set by DEFAULT_HiGH_C_RATIO
    let remainingAmount = BORROW_AMOUNT.mul(DEFAULT_HiGH_C_RATIO)
      .div(DEFAULT_PRICE)
      .div(BASE)
      .mul(BigNumber.from(10).pow(DEFAULT_COLLATERAL_DECIMALS));
    const withdrawAmt1 = COLLATERAL_AMOUNT.sub(remainingAmount);

    const preBalance = await arc.collateral().balanceOf(signers.scoredMinter.address);

    // Withdraw the same amount as permitted without a credit score
    await arc.withdraw(
      withdrawAmt1,
      getScoreProof(minterCreditScore, creditScoreTree),
      undefined,
      signers.scoredMinter,
    );

    let assessmentTx = await assessor.assess(
      DEFAULT_LOW_C_RATIO,
      DEFAULT_HiGH_C_RATIO,
      getScoreProof(minterCreditScore, creditScoreTree),
      true,
    );
    const event = await getEvent(assessmentTx, assessor, 'Assessed');
    const scoredCRatio = event.args[0];

    const remainingAmount2 = BORROW_AMOUNT.mul(scoredCRatio)
      .mul(BigNumber.from(10).pow(DEFAULT_COLLATERAL_DECIMALS))
      .div(DEFAULT_PRICE)
      .div(BASE);
    const withdrawAmt2 = remainingAmount.sub(remainingAmount2);

    // Withdraw more amount - to the limit permitted by the credit score
    await arc.withdraw(
      withdrawAmt2,
      getScoreProof(minterCreditScore, creditScoreTree),
      undefined,
      signers.scoredMinter,
    );

    const postBalance = await arc.collateral().balanceOf(signers.scoredMinter.address);
    const vault = await arc.getVault(signers.scoredMinter.address);

    expect(postBalance).to.eq(preBalance.add(withdrawAmt1).add(withdrawAmt2));
    expect(vault.collateralAmount).to.eq(remainingAmount2);
  });

  it('withdraws the correct amount of collateral, given that collateral has a different number of decimals than 18', async () => {
    const collateralAddress = await arc.core().collateralAsset();
    const collateralContract = TestTokenFactory.connect(collateralAddress, signers.scoredMinter);

    const collateralDecimals = await collateralContract.decimals();
    expect(collateralDecimals).not.eq(18);

    await collateralContract.mintShare(signers.scoredMinter.address, COLLATERAL_AMOUNT);
    await collateralContract.approve(arc.core().address, COLLATERAL_AMOUNT);

    expect(await collateralContract.balanceOf(signers.scoredMinter.address)).eq(COLLATERAL_AMOUNT);

    await arc.deposit(COLLATERAL_AMOUNT, undefined, undefined, signers.scoredMinter);

    const { collateralAmount } = await arc.getVault(signers.scoredMinter.address);
    expect(collateralAmount).to.eq(COLLATERAL_AMOUNT);
    expect(await collateralContract.balanceOf(arc.coreAddress())).eq(COLLATERAL_AMOUNT);

    await arc.withdraw(COLLATERAL_AMOUNT, undefined, undefined, signers.scoredMinter);

    expect(await collateralContract.balanceOf(signers.scoredMinter.address)).eq(COLLATERAL_AMOUNT);
  });

  it('updates the totalCollateral amount after a withdraw', async () => {
    await setupBaseVault(
      arc,
      signers.scoredMinter,
      COLLATERAL_AMOUNT,
      BORROW_AMOUNT,
      getScoreProof(minterCreditScore, creditScoreTree),
    );

    const preTotalSupply = await arc.core().totalCollateral();

    await arc.withdraw(COLLATERAL_AMOUNT, undefined, undefined, signers.scoredMinter);

    const postTotalSupply = await arc.core().totalCollateral();

    expect(postTotalSupply).to.eq(preTotalSupply.sub(COLLATERAL_AMOUNT));
  });

  it('reverts if the resulting vault ends up below the minimum c-ratio', async () => {
    await setupBaseVault(arc, signers.scoredMinter, COLLATERAL_AMOUNT, BORROW_AMOUNT);

    const minCollateral = DEFAULT_HiGH_C_RATIO.mul(BORROW_AMOUNT).div(BASE);
    const maxWithdrawAmt = COLLATERAL_AMOUNT.sub(minCollateral);

    await arc.withdraw(maxWithdrawAmt, undefined, undefined, signers.scoredMinter);

    await expect(
      arc.withdraw(BigNumber.from(1), undefined, undefined, signers.scoredMinter),
    ).to.be.revertedWith('SapphireArcV1: cannot withdraw more than allowed');
  });

  it('reverts if vault is undercollateralized', async () => {
    await setupBaseVault(
      arc,
      signers.scoredMinter,
      COLLATERAL_AMOUNT,
      BORROW_AMOUNT,
      getScoreProof(minterCreditScore, creditScoreTree),
    );

    // Drop price to make position undercollateralized
    await arc.updatePrice(utils.parseEther('0.15'));

    await expect(
      arc.withdraw(BigNumber.from(1), undefined, undefined, signers.scoredMinter),
    ).to.be.revertedWith('SapphireArcV1: cannot withdraw more than allowed');
  });

  it('reverts if withdrawing more collateral than the amount in the vault', async () => {
    await arc.deposit(COLLATERAL_AMOUNT, undefined, undefined, signers.scoredMinter);

    await expect(
      arc.withdraw(COLLATERAL_AMOUNT.add(1), undefined, undefined, signers.scoredMinter),
    ).to.be.revertedWith('SapphireArcV1: cannot withdraw more than allowed');
  });

  it('reverts if contract is paused', async () => {
    await setupBaseVault(
      arc,
      signers.scoredMinter,
      COLLATERAL_AMOUNT,
      BORROW_AMOUNT,
      getScoreProof(minterCreditScore, creditScoreTree),
    );

    await arc.core().setPause(true);

    await expect(
      arc.withdraw(BigNumber.from(1), undefined, undefined, signers.scoredMinter),
    ).to.be.revertedWith('SapphireCoreV1: the contract is paused');
  });
});
