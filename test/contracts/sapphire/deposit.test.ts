import { PassportScore } from '@arc-types/sapphireCore';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { PassportScoreTree } from '@src/MerkleTree';
import { SapphireTestArc } from '@src/SapphireTestArc';
import { TestToken, TestTokenFactory } from '@src/typings';
import { getScoreProof, getEmptyScoreProof } from '@src/utils/getScoreProof';
import { DEFAULT_COLLATERAL_DECIMALS } from '@test/helpers/sapphireDefaults';
import { CREDIT_PROOF_PROTOCOL } from '@src/constants';
import { addSnapshotBeforeRestoreAfterEach } from '@test/helpers/testingUtils';
import { expect } from 'chai';
import { BigNumber, utils } from 'ethers';
import { generateContext, ITestContext } from '../context';
import { sapphireFixture } from '../fixtures';
import { setupSapphire } from '../setup';

const COLLATERAL_AMOUNT = utils.parseUnits('100', DEFAULT_COLLATERAL_DECIMALS);

describe('SapphireCore.deposit()', () => {
  let ctx: ITestContext;
  let arc: SapphireTestArc;
  let creditScoreTree: PassportScoreTree;
  let creditScore1: PassportScore;
  let creditScore2: PassportScore;
  let scoredMinter: SignerWithAddress;
  let minter: SignerWithAddress;
  let collateral: TestToken;

  function init(ctx: ITestContext): Promise<void> {
    creditScore1 = {
      account: ctx.signers.scoredMinter.address,
      protocol: utils.formatBytes32String(CREDIT_PROOF_PROTOCOL),
      score: BigNumber.from(500),
    };
    creditScore2 = {
      account: ctx.signers.interestSetter.address,
      protocol: utils.formatBytes32String(CREDIT_PROOF_PROTOCOL),
      score: BigNumber.from(20),
    };
    creditScoreTree = new PassportScoreTree([creditScore1, creditScore2]);

    return setupSapphire(ctx, {
      merkleRoot: creditScoreTree.getHexRoot(),
    });
  }

  before(async () => {
    ctx = await generateContext(sapphireFixture, init);
    arc = ctx.sdks.sapphire;
    scoredMinter = ctx.signers.scoredMinter;
    minter = ctx.signers.minter;
    collateral = TestTokenFactory.connect(arc.collateral().address, minter);

    // mint and approve token
    await collateral.mintShare(minter.address, COLLATERAL_AMOUNT);
    await collateral.mintShare(scoredMinter.address, COLLATERAL_AMOUNT);

    await collateral.approveOnBehalf(
      minter.address,
      arc.coreAddress(),
      COLLATERAL_AMOUNT,
    );
    await collateral.approveOnBehalf(
      scoredMinter.address,
      arc.coreAddress(),
      COLLATERAL_AMOUNT,
    );
  });

  addSnapshotBeforeRestoreAfterEach();

  it('reverts if the contract is paused', async () => {
    await arc.core().connect(ctx.signers.pauseOperator).setPause(true);

    await expect(
      arc.deposit(COLLATERAL_AMOUNT, undefined, undefined, minter),
    ).revertedWith('SapphireCoreV1: the contract is paused');
  });

  it(`reverts if the user doesn't have enough funds`, async () => {
    const preMinterBalance = await collateral.balanceOf(minter.address);

    await expect(
      arc.deposit(preMinterBalance.add(1), undefined, undefined, minter),
    ).revertedWith('SafeERC20: TRANSFER_FROM_FAILED');
  });

  it('deposit without credit score', async () => {
    const preMinterBalance = await collateral.balanceOf(minter.address);
    const preCoreBalance = await collateral.balanceOf(arc.coreAddress());

    await arc.deposit(COLLATERAL_AMOUNT, undefined, undefined, minter);

    expect(await collateral.balanceOf(minter.address)).eq(
      preMinterBalance.sub(COLLATERAL_AMOUNT),
    );
    expect(await collateral.balanceOf(arc.coreAddress())).eq(
      preCoreBalance.add(COLLATERAL_AMOUNT),
    );
  });

  it('deposit with credit score', async () => {
    const preMinterBalance = await collateral.balanceOf(scoredMinter.address);
    const preCoreBalance = await collateral.balanceOf(arc.coreAddress());

    await arc.deposit(
      COLLATERAL_AMOUNT,
      getScoreProof(creditScore1, creditScoreTree),
      undefined,
      scoredMinter,
    );

    expect(
      await collateral.balanceOf(scoredMinter.address),
      'scored minter balance',
    ).eq(preMinterBalance.sub(COLLATERAL_AMOUNT));
    expect(await collateral.balanceOf(arc.coreAddress()), 'core balance').eq(
      preCoreBalance.add(COLLATERAL_AMOUNT),
    );

    const { collateralAmount } = await arc.getVault(scoredMinter.address);
    expect(collateralAmount).to.eq(COLLATERAL_AMOUNT);
  });

  it('emits the Deposited event', async () => {
    const scoreProof = getScoreProof(creditScore1, creditScoreTree);
    await expect(
      arc.deposit(COLLATERAL_AMOUNT, scoreProof, undefined, scoredMinter),
    )
      .to.emit(arc.core(), 'Deposited')
      .withArgs(
        scoredMinter.address,
        COLLATERAL_AMOUNT,
        COLLATERAL_AMOUNT,
        0,
        0,
      );
  });

  it('sets the effective epoch of the sender to epoch + 2 if NO proof was passed', async () => {
    expect(await arc.core().effectiveEpoch(scoredMinter.address)).to.eq(0);

    const currentEpoch = await ctx.contracts.sapphire.passportScores.currentEpoch();
    await arc.deposit(
      COLLATERAL_AMOUNT,
      getEmptyScoreProof(
        scoredMinter.address,
        utils.formatBytes32String('arcx.credit'),
      ),
      undefined,
      scoredMinter,
    );

    expect(await arc.core().effectiveEpoch(scoredMinter.address)).to.eq(
      currentEpoch.add(2),
    );
  });

  it('sets the effective epoch of the sender to the current epoch if a proof was passed', async () => {
    expect(await arc.core().effectiveEpoch(scoredMinter.address)).to.eq(0);

    const scoreProof = getScoreProof(creditScore1, creditScoreTree);
    const currentEpoch = await ctx.contracts.sapphire.passportScores.currentEpoch();
    await arc.deposit(COLLATERAL_AMOUNT, scoreProof, undefined, scoredMinter);

    expect(await arc.core().effectiveEpoch(scoredMinter.address)).to.eq(
      currentEpoch,
    );
  });
});
