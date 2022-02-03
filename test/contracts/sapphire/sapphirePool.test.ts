import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import {
  ArcProxyFactory,
  SapphirePool,
  SapphirePoolFactory,
  TestToken,
  TestTokenFactory,
} from '@src/typings';
import {
  ADMINABLE_ERROR,
  ARITHMETIC_ERROR,
} from '@test/helpers/contractErrors';
import { addSnapshotBeforeRestoreAfterEach } from '@test/helpers/testingUtils';
import { expect } from 'chai';
import { utils } from 'ethers';
import { generateContext, ITestContext } from '../context';
import { sapphireFixture } from '../fixtures';

const DEPOSIT_AMOUNT = utils.parseEther('100');

describe('SapphirePool', () => {
  let pool: SapphirePool;

  let stablecoin: TestToken;
  let creds: TestToken;

  let admin: SignerWithAddress;
  let depositor: SignerWithAddress;
  let ctx: ITestContext;

  before(async () => {
    ctx = await generateContext(sapphireFixture);
    admin = ctx.signers.admin;
    depositor = ctx.signers.unauthorized;
    stablecoin = ctx.contracts.stableCoin;

    creds = await new TestTokenFactory(admin).deploy('Creds', 'CREDS', 18);

    const sapphirePoolImpl = await new SapphirePoolFactory(admin).deploy();
    const proxy = await new ArcProxyFactory(admin).deploy(
      sapphirePoolImpl.address,
      admin.address,
      [],
    );
    pool = SapphirePoolFactory.connect(proxy.address, admin);

    await pool.init('Sapphire Pool', 'SAP', 18, creds.address);

    await stablecoin.mintShare(depositor.address, DEPOSIT_AMOUNT);
  });

  addSnapshotBeforeRestoreAfterEach();

  describe('Restricted functions', () => {
    describe('#init', () => {
      it('reverts if called by non-admin', async () => {
        const poolImpl = await new SapphirePoolFactory(admin).deploy();
        const proxy = await new ArcProxyFactory(admin).deploy(
          poolImpl.address,
          admin.address,
          [],
        );
        const _pool = SapphirePoolFactory.connect(proxy.address, depositor);

        await expect(
          _pool.init('Sapphire Pool', 'SAP', 18, creds.address),
        ).to.be.revertedWith(ADMINABLE_ERROR);
      });

      it('sets the name, symbol and decimals', async () => {
        expect(await pool.name()).to.equal('Sapphire Pool');
        expect(await pool.symbol()).to.equal('SAP');
        expect(await pool.decimals()).to.equal(18);
      });

      it('sets the address of the creds token', async () => {
        expect(await pool.credsToken()).to.equal(creds.address);
      });
    });

    describe('#setCoreSwapLimit', () => {
      it('reverts if set by non-admin', async () => {
        await expect(
          pool
            .connect(depositor)
            .setCoreSwapLimit(ctx.contracts.sapphire.core.address, 1000),
        ).to.be.revertedWith(ADMINABLE_ERROR);
      });

      it('sets the limit for how many CR can be swapped in for tokens', async () => {
        let utilization = await pool.coreSwapUtilization(
          ctx.contracts.sapphire.core.address,
        );
        expect(utilization.limit).to.eq(0);

        await pool.setCoreSwapLimit(ctx.contracts.sapphire.core.address, 1000);

        utilization = await pool.coreSwapUtilization(
          ctx.contracts.sapphire.core.address,
        );
        expect(utilization.limit).to.eq(1000);
        expect(utilization.amountUsed).to.eq(0);
      });
    });

    describe('#setDepositLimit', () => {
      it('reverts if called by non-admin', async () => {
        await expect(
          pool.connect(depositor).setDepositLimit(stablecoin.address, 1000),
        ).to.be.revertedWith(ADMINABLE_ERROR);
      });

      it('sets the limit for how many stablecoins can be deposited', async () => {
        let utilization = await pool.assetsUtilization(stablecoin.address);
        expect(utilization.amountUsed).to.deep.eq(0);
        expect(utilization.limit).to.deep.eq(0);

        await pool.setDepositLimit(stablecoin.address, 1000);

        utilization = await pool.assetsUtilization(stablecoin.address);
        expect(utilization.amountUsed).to.eq(0);
      });

      describe('#setDepositLimit', () => {
        it('reverts if called by non-admin', async () => {
          await expect(
            pool.connect(depositor).setDepositLimit(stablecoin.address, 1000),
          ).to.be.revertedWith(ADMINABLE_ERROR);
        });

        it('reverts if setting the limit to 0 and the token is not previously supported', async () => {
          await expect(
            pool.setDepositLimit(stablecoin.address, 0),
          ).to.be.revertedWith(
            'SapphirePool: cannot set the limit of an unsupported asset to 0',
          );
        });

        it('sets the limit for how many stablecoins can be deposited', async () => {
          let utilization = await pool.assetsUtilization(stablecoin.address);
          expect(utilization.amountUsed).to.deep.eq(0);
          expect(utilization.limit).to.deep.eq(0);

          await pool.setDepositLimit(stablecoin.address, 1000);

          utilization = await pool.assetsUtilization(stablecoin.address);
          expect(utilization.amountUsed).to.eq(0);
          expect(utilization.limit).to.eq(1000);
        });

        it('if limit is > 0, adds the token to the list of tokens that can be deposited', async () => {
          expect(await pool.getDepositAssets()).to.be.empty;

          await pool.setDepositLimit(stablecoin.address, 1000);

          expect(await pool.getDepositAssets()).to.deep.eq([
            stablecoin.address,
          ]);
        });

        it('if limit is 0, removes the token from the list of tokens that can be deposited', async () => {
          await pool.setDepositLimit(stablecoin.address, 1000);
          expect(await pool.getDepositAssets()).to.deep.eq([
            stablecoin.address,
          ]);

          await pool.setDepositLimit(stablecoin.address, 0);
          expect(await pool.getDepositAssets()).to.be.empty;
        });

        it('does not add a supported asset twice to the supported assets array', async () => {
          expect(await pool.getDepositAssets()).to.be.empty;

          await pool.setDepositLimit(stablecoin.address, 100);
          await pool.setDepositLimit(stablecoin.address, 420);

          expect(await pool.getDepositAssets()).to.deep.eq([
            stablecoin.address,
          ]);
        });

        it('adds 2 assets to the supported assets list', async () => {
          expect(await pool.getDepositAssets()).to.be.empty;

          const testUsdc = await new TestTokenFactory(admin).deploy(
            'TestUSDC',
            'TUSDC',
            6,
          );

          await pool.setDepositLimit(stablecoin.address, 100);
          await pool.setDepositLimit(testUsdc.address, 100);

          expect(await pool.getDepositAssets()).to.deep.eq([
            stablecoin.address,
            testUsdc.address,
          ]);
        });
      });
    });

    describe('#swap', () => {
      it('reverts if called by a non-approved core');

      it('reverts if there are not enough requested coins');

      it('reverts if core tries to swap more than its limit');

      it('swaps the correct amount of requested tokens in exchange of CR');

      it('correctly swaps assets that do not have the same decimals');

      it(
        'increases the token utilization borrow amount when swapping creds for tokens',
      );

      it(
        'decreases the token utilization borrow amount when swapping tokens for creds',
      );
    });
  });

  describe('View functions', () => {
    describe('#accumulatedRewardAmount', () => {
      it('returns the current reward amount for the given token');
    });
  });

  describe('Public functions', () => {
    describe.skip('#deposit', () => {
      beforeEach(async () => {
        await pool.setDepositLimit(stablecoin.address, DEPOSIT_AMOUNT.mul(2));
        await stablecoin
          .connect(depositor)
          .approve(pool.address, DEPOSIT_AMOUNT);
      });

      it('reverts user has not enough tokens', async () => {
        const utilization = await pool.assetsUtilization(stablecoin.address);
        expect(utilization.limit).to.eq(DEPOSIT_AMOUNT.mul(2));

        await expect(
          pool
            .connect(depositor)
            .deposit(stablecoin.address, DEPOSIT_AMOUNT.add(1)),
        ).to.be.revertedWith(ARITHMETIC_ERROR);
      });

      it('reverts if trying to deposit more than the limit', async () => {
        await pool.setDepositLimit(stablecoin.address, DEPOSIT_AMOUNT.sub(1));

        await expect(
          pool.connect(depositor).deposit(stablecoin.address, DEPOSIT_AMOUNT),
        ).to.be.revertedWith(
          'SapphirePool: cannot deposit more than the limit',
        );
      });

      it('deposits the correct amount of tokens and mints an equal amount amount of LP tokens', async () => {
        expect(await pool.balanceOf(depositor.address)).to.eq(0);

        await pool
          .connect(depositor)
          .deposit(stablecoin.address, DEPOSIT_AMOUNT);

        expect(await pool.balanceOf(depositor.address)).to.eq(DEPOSIT_AMOUNT);
        expect(await stablecoin.balanceOf(depositor.address)).to.eq(0);
      });

      it('mints an equal amount of LP tokens when the deposit token has 6 decimals', async () => {
        const testUsdc = await new TestTokenFactory(admin).deploy(
          'TestUSDC',
          'TUSDC',
          6,
        );
        const usdcDepositAmt = utils.parseUnits('100', 6);
        await testUsdc.mintShare(depositor.address, usdcDepositAmt);
        await testUsdc.connect(depositor).approve(pool.address, usdcDepositAmt);

        await pool.setDepositLimit(testUsdc.address, usdcDepositAmt.mul(2));

        expect(await pool.balanceOf(depositor.address)).to.eq(0);

        await pool.connect(depositor).deposit(testUsdc.address, usdcDepositAmt);

        expect(await pool.balanceOf(depositor.address)).to.eq(DEPOSIT_AMOUNT); // 100 * 10^18
        expect(await pool.totalSupply()).to.eq(DEPOSIT_AMOUNT);
        expect(await testUsdc.balanceOf(depositor.address)).to.eq(0);
      });

      it('increases the total supply of the LP token', async () => {
        expect(await pool.totalSupply()).to.eq(0);

        await pool
          .connect(depositor)
          .deposit(stablecoin.address, DEPOSIT_AMOUNT.div(2));
        expect(await pool.totalSupply()).to.eq(DEPOSIT_AMOUNT.div(2));

        await pool
          .connect(depositor)
          .deposit(stablecoin.address, DEPOSIT_AMOUNT.div(2));
        expect(await pool.totalSupply()).to.eq(DEPOSIT_AMOUNT);
      });
    });

    describe('#withdraw', () => {
      it(
        'reverts if trying to withdraw more than the amount available for the given token',
      );

      it('withdraws the correct amount of tokens');

      it(
        'decreases the reward amount for the given token in the core swap utilization mapping',
      );

      it(
        'withdraws the proportional amount of reward in the selected currency (1 currency available)',
      );

      it(
        'withdraws the proportional amount of reward in the selected currency (2 currencies available)',
      );

      it('decreases the total supply of the LP token');
    });

    describe('#transferRewards', () => {
      it(
        'reverts if the reward token is not in the core swap utilization mapping',
      );

      it(
        'increases the reward amount for the given token in the core swap utilization mapping',
      );

      it('does not mint LP tokens for the transferred rewards');
    });
  });

  describe('Scenarios', () => {
    it(
      '2 LPs deposit and withdraw at different times, while rewards are being added',
    );

    it('2 LPs with 2 cores interact with the pool');
  });
});
