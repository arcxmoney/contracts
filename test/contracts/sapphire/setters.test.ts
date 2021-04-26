import { SapphireCoreV1 } from '@src/typings';
import { addSnapshotBeforeRestoreAfterEach } from '@test/helpers/testingUtils';
import { expect } from 'chai';
import { constants, utils, Wallet } from 'ethers';
import { generateContext, ITestContext } from '../context';
import { sapphireFixture } from '../fixtures';
import { setupSapphire } from '../setup';

describe('SapphireCore.setters', () => {
  let ctx: ITestContext;
  let sapphireCore: SapphireCoreV1;

  let randomAddress: string;

  before(async () => {
    ctx = await generateContext(sapphireFixture, (ctx) =>
      setupSapphire(ctx, {}),
    );
    sapphireCore = ctx.contracts.sapphire.core;
    randomAddress = Wallet.createRandom().address;
  });

  addSnapshotBeforeRestoreAfterEach();

  describe('#setCollateralRatios', () => {
    const lowRatio = constants.WeiPerEther.mul(3);
    const highRatio = constants.WeiPerEther.mul(5);

    it('reverts if called by non-owner', async () => {
      await expect(
        sapphireCore
          .connect(ctx.signers.unauthorised)
          .setCollateralRatios(lowRatio, highRatio),
      ).to.be.revertedWith('Adminable: caller is not admin');
    });

    it('reverts if low c-ratio is 0', async () => {
      await expect(
        sapphireCore.setCollateralRatios(0, highRatio),
      ).to.be.revertedWith(
        'SapphireCoreV1: collateral ratio has to be at least 1',
      );
    });

    it('reverts if low c-ratio is 0.999..99', async () => {
      await expect(
        sapphireCore.setCollateralRatios(
          constants.WeiPerEther.sub(1),
          highRatio,
        ),
      ).to.be.revertedWith(
        'SapphireCoreV1: collateral ratio has to be at least 1',
      );
    });

    it('reverts if high c-ratio is 0', async () => {
      await expect(
        sapphireCore.setCollateralRatios(lowRatio, 0),
      ).to.be.revertedWith(
        'SapphireCoreV1: collateral ratio has to be at least 1',
      );
    });

    it('reverts if high c-ratio is lower than the low c-ratio', async () => {
      await expect(
        sapphireCore.setCollateralRatios(highRatio, lowRatio),
      ).to.be.revertedWith(
        'SapphireCoreV1: high c-ratio is lower than the low c-ratio',
      );
    });

    it('sets the low and high collateral ratios', async () => {
      expect(await sapphireCore.highCollateralRatio()).not.eq(highRatio);
      expect(await sapphireCore.lowCollateralRatio()).not.eq(lowRatio);

      await expect(sapphireCore.setCollateralRatios(lowRatio, highRatio))
        .to.emit(sapphireCore, 'CollateralRatiosUpdated')
        .withArgs(lowRatio, highRatio);

      expect(await sapphireCore.highCollateralRatio()).eq(highRatio);
      expect(await sapphireCore.lowCollateralRatio()).eq(lowRatio);
    });
  });

  describe('#setAssessor', () => {
    it('reverts if called by non-owner', async () => {
      await expect(
        sapphireCore
          .connect(ctx.signers.unauthorised)
          .setAssessor(randomAddress),
      ).to.be.revertedWith('Adminable: caller is not admin');
    });

    it('sets the assessor address', async () => {
      await expect(sapphireCore.setAssessor(randomAddress))
        .to.emit(sapphireCore, 'AssessorUpdated')
        .withArgs(randomAddress);
      expect(await sapphireCore.assessor()).eq(randomAddress);
    });
  });

  describe('#setFeeCollector', () => {
    it('reverts if called by non-admin', async () => {
      await expect(
        sapphireCore
          .connect(ctx.signers.unauthorised)
          .setFeeCollector(randomAddress),
      ).to.be.revertedWith('Adminable: caller is not admin');
    });

    it('sets the fee collector address', async () => {
      await expect(sapphireCore.setFeeCollector(randomAddress))
        .to.emit(sapphireCore, 'FeeCollectorUpdated')
        .withArgs(randomAddress);
      expect(await sapphireCore.feeCollector()).eq(randomAddress);
    });
  });

  describe('#setPauseOperator', () => {
    it('reverts if called by non-admin', async () => {
      await expect(
        sapphireCore
          .connect(ctx.signers.unauthorised)
          .setPauseOperator(ctx.signers.unauthorised.address),
      ).to.be.revertedWith('Adminable: caller is not admin');
    });

    it('sets the pause operator', async () => {
      let pauseOperatorAddy = await sapphireCore.pauseOperator();
      expect(pauseOperatorAddy).to.eq(ctx.signers.pauseOperator.address);

      await expect(sapphireCore.setPauseOperator(ctx.signers.admin.address))
        .to.emit(sapphireCore, 'PauseOperatorUpdated')
        .withArgs(ctx.signers.admin.address);

      pauseOperatorAddy = await sapphireCore.pauseOperator();
      expect(pauseOperatorAddy).to.eq(ctx.signers.admin.address);
    });
  });

  describe('#setPause', () => {
    it('reverts if called by non-pauseOperator', async () => {
      await expect(
        sapphireCore.connect(ctx.signers.unauthorised).setPause(true),
      ).to.be.revertedWith('SapphireCoreV1: caller is not the pause operator');
    });

    it('pauses and un-pauses the contract', async () => {
      const initialPaused = await sapphireCore.paused();
      const pauseControllerCore = sapphireCore.connect(
        ctx.signers.pauseOperator,
      );

      await expect(pauseControllerCore.setPause(!initialPaused))
        .to.emit(pauseControllerCore, 'PauseStatusUpdated')
        .withArgs(!initialPaused);
      expect(await pauseControllerCore.paused()).eq(!initialPaused);

      await expect(pauseControllerCore.setPause(initialPaused))
        .to.emit(pauseControllerCore, 'PauseStatusUpdated')
        .withArgs(initialPaused);
      expect(await pauseControllerCore.paused()).eq(initialPaused);
    });
  });

  describe('#setOracle', () => {
    it('reverts if called by non-owner', async () => {
      await expect(
        sapphireCore.connect(ctx.signers.unauthorised).setOracle(randomAddress),
      ).to.be.revertedWith('Adminable: caller is not admin');
    });

    it('sets the oracle', async () => {
      await expect(sapphireCore.setOracle(randomAddress))
        .to.emit(sapphireCore, 'OracleUpdated')
        .withArgs(randomAddress);
      expect(await sapphireCore.oracle()).eq(randomAddress);
    });
  });

  describe('#setInterestSetter', () => {
    it('reverts if called by non-owner', async () => {
      await expect(
        sapphireCore
          .connect(ctx.signers.unauthorised)
          .setInterestSetter(randomAddress),
      ).to.be.revertedWith('Adminable: caller is not admin');
    });

    it('sets the interest setter', async () => {
      await expect(sapphireCore.setInterestSetter(randomAddress))
        .to.emit(sapphireCore, 'InterestSetterUpdated')
        .withArgs(randomAddress);
      expect(await sapphireCore.interestSetter()).eq(randomAddress);
    });
  });

  describe('#setInterestRate', () => {
    const maxInterestRate = 21820606488;

    it('reverts if called by unauthorized', async () => {
      await expect(
        sapphireCore.connect(ctx.signers.unauthorised).setInterestRate(1),
      ).to.be.revertedWith('SapphireCoreV1: caller is not interest setter');
    });

    it('reverts if called by owner', async () => {
      await expect(
        sapphireCore.connect(ctx.signers.admin).setInterestRate(1),
      ).to.be.revertedWith('SapphireCoreV1: caller is not interest setter');
    });

    it('sets the interest setter', async () => {
      await expect(
        sapphireCore
          .connect(ctx.signers.interestSetter)
          .setInterestRate(maxInterestRate + 1),
      ).to.be.revertedWith(
        'SapphireCoreV1: APY cannot be more than 99%, interest rate - 21820606489',
      );
    });

    it('sets the interest setter', async () => {
      await expect(
        sapphireCore
          .connect(ctx.signers.interestSetter)
          .setInterestRate(maxInterestRate),
      )
        .to.emit(sapphireCore, 'InterestRateUpdated')
        .withArgs(maxInterestRate);
      expect(await sapphireCore.interestRate()).eq(maxInterestRate);
    });
  });

  describe('#setFees', () => {
    const userFee = utils.parseEther('0.1');
    const arcFee = utils.parseEther('0.05');

    it('reverts if called by non-owner', async () => {
      await expect(
        sapphireCore.connect(ctx.signers.unauthorised).setFees(userFee, arcFee),
      ).to.be.revertedWith('Adminable: caller is not admin');
    });

    it('reverts if fee sum is over 100%', async () => {
      await expect(
        sapphireCore.setFees(
          utils.parseEther('0.6'),
          utils.parseEther('0.4').add(1),
        ),
      ).to.be.revertedWith(
        'SapphireCoreV1: fee sum has to be no more than 100%',
      );

      await expect(
        sapphireCore.setFees(utils.parseEther('1'), '1'),
      ).to.be.revertedWith(
        'SapphireCoreV1: fee sum has to be no more than 100%',
      );
    });

    it('sets the liquidation fee and the arc ratio', async () => {
      await expect(sapphireCore.setFees(userFee, arcFee))
        .to.emit(sapphireCore, 'LiquidationFeesUpdated')
        .withArgs(userFee, arcFee);
      expect(await sapphireCore.liquidationUserFee()).eq(userFee);
      expect(await sapphireCore.liquidationArcFee()).eq(arcFee);
    });
  });

  describe('#setLimits', () => {
    const totalBorrowLimit = utils.parseEther('1000000');
    const vaultBorrowMaximum = utils.parseEther('1000');
    const vaultBorrowMinimum = utils.parseEther('100');

    it('reverts if called by non-owner', async () => {
      await expect(
        sapphireCore
          .connect(ctx.signers.unauthorised)
          .setLimits(totalBorrowLimit, vaultBorrowMinimum, vaultBorrowMaximum),
      ).to.be.revertedWith('Adminable: caller is not admin');
    });

    it('reverts if max limit is lower than the min limit', async () => {
      await expect(
        sapphireCore.setLimits(
          totalBorrowLimit,
          vaultBorrowMaximum,
          vaultBorrowMinimum,
        ),
      ).to.be.revertedWith(
        'SapphireCoreV1: required condition is vaultMin <= vaultMax <= totalLimit',
      );
      await expect(
        sapphireCore.setLimits(
          vaultBorrowMinimum,
          totalBorrowLimit,
          vaultBorrowMaximum,
        ),
      ).to.be.revertedWith(
        'SapphireCoreV1: required condition is vaultMin <= vaultMax <= totalLimit',
      );
      await expect(
        sapphireCore.setLimits(
          vaultBorrowMaximum,
          vaultBorrowMinimum,
          totalBorrowLimit,
        ),
      ).to.be.revertedWith(
        'SapphireCoreV1: required condition is vaultMin <= vaultMax <= totalLimit',
      );
    });

    it('sets the borrow limits', async () => {
      await expect(
        sapphireCore.setLimits(
          totalBorrowLimit,
          vaultBorrowMinimum,
          vaultBorrowMaximum,
        ),
      )
        .to.emit(sapphireCore, 'LimitsUpdated')
        .withArgs(totalBorrowLimit, vaultBorrowMinimum, vaultBorrowMaximum);
      expect(await sapphireCore.totalBorrowLimit()).eq(totalBorrowLimit);
      expect(await sapphireCore.vaultBorrowMaximum()).eq(vaultBorrowMaximum);
      expect(await sapphireCore.vaultBorrowMinimum()).eq(vaultBorrowMinimum);
    });
  });
});
