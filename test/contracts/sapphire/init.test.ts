import { MockProvider } from '@ethereum-waffle/provider';
import { Wallet } from '@ethersproject/wallet';
import { MockSapphireCoreV1, MockSapphireCoreV1Factory, TestToken } from '@src/typings';
import { expect } from 'chai';
import { createFixtureLoader } from 'ethereum-waffle';
import { constants, utils } from 'ethers';
import { deployArcProxy, deployMockSapphireCoreV1, deployTestToken } from '../deployers';

export async function setup([deployer, unauthorized]: Wallet[]): Promise<any> {
  const coreImp = await deployMockSapphireCoreV1(deployer);
  const coreProxy = await deployArcProxy(deployer, coreImp.address, deployer.address, []);
  const sapphireCore = MockSapphireCoreV1Factory.connect(coreProxy.address, deployer);
  const collateral = await deployTestToken(deployer, 'Collateral Token Name', 'CTKN6', 6);
  const synthetic = await deployTestToken(deployer, 'Synthetic Token Name', 'STKN');

  return { sapphireCore, deployer, unauthorized, collateral, synthetic };
}

describe.only('SapphireCore.init', () => {
  let sapphireCore: MockSapphireCoreV1;
  let deployer: Wallet;
  let unauthorized: Wallet;
  let collateral: TestToken;
  let synthetic: TestToken;
  let init: Function;

  let defaultOptions;
  beforeEach(async () => {
    const provider = new MockProvider();
    ({ sapphireCore, deployer, unauthorized, collateral, synthetic } = await createFixtureLoader(
      provider.getWallets(),
    )(setup));

    defaultOptions = {
      collateralAddress: collateral.address,
      syntheticAddress: synthetic.address,
      oracle: Wallet.createRandom().address,
      interestSetter: Wallet.createRandom().address,
      assessor: Wallet.createRandom().address,
      highCollateralRatio: constants.WeiPerEther.mul(2),
      lowCollateralRation: constants.WeiPerEther,
      liquidationUserFee: constants.WeiPerEther,
      liquidationArcFee: constants.WeiPerEther,
      executor: deployer,
    };

    init = (overrides) => {
      const options = {
        ...defaultOptions,
        ...overrides,
      };
      return sapphireCore
        .connect(options.executor)
        .init(
          options.collateralAddress,
          options.syntheticAddress,
          options.oracle,
          options.interestSetter,
          options.assessor,
          options.highCollateralRatio,
          options.lowCollateralRation,
          options.liquidationUserFee,
          options.liquidationArcFee,
        );
    };
  });

  it('reverts if collateral address is 0', async () => {
    await expect(init({ collateralAddress: constants.AddressZero })).to.be.revertedWith(
      'SapphireCoreV1: collateral is required',
    );
  });

  it('reverts if synthetic address is 0', async () => {
    await expect(init({ syntheticAddress: constants.AddressZero })).to.be.revertedWith(
      'SapphireCoreV1: synthetic is required',
    );
  });

  it('reverts if low c-ratio is 0', async () => {
    await expect(init({ lowCollateralRatio: 0 })).to.be.revertedWith(
      'SapphireCoreV1: collateral ratio has to be greater than 0',
    );
  });

  it('reverts if high c-ratio is 0', async () => {
    await expect(init({ highCollateralRatio: 0 })).to.be.revertedWith(
      'SapphireCoreV1: collateral ratio has to be greater than 0',
    );
  });

  it('reverts high c-ratio is lower than the low c-ratio', async () => {
    await expect(
      init({
        highCollateralRatio: constants.WeiPerEther,
        lowCollateralRatio: constants.WeiPerEther.mul(2),
      }),
    ).to.be.revertedWith('SapphireCoreV1: high c-ratio is lower than the low c-ratio');
  });

  it('reverts if liquidation user fee is 0', async () => {
    await expect(init({ liquidationUserFee: utils.parseEther('101') })).to.be.revertedWith(
      'SapphireCoreV1: fee sum has to be no more than 100%',
    );
  });

  it('reverts if limits condition is unfulfilled ', async () => {
    await expect(init({ vaultBorrowMaximum: '0' })).to.be.revertedWith(
      'SapphireCoreV1: required condition is vaultMin <= vaultMax <= totalLimit',
    );
  });

  it('sets all the passed parameters', async () => {
    await expect(init()).to.not.be.reverted;

    const decimals = await collateral.decimals();
    expect(decimals).eq(6);

    expect(await sapphireCore.precisionScalar()).eq(utils.parseUnits('10', 18 - decimals));
    expect(await sapphireCore.paused()).to.be.true;
    expect(await sapphireCore.feeCollector()).eq(defaultOptions.feeCollector);
    expect(await sapphireCore.oracle()).eq(defaultOptions.oracle);
    expect(await sapphireCore.collateralAsset()).eq(defaultOptions.collateralAddress);
    expect(await sapphireCore.syntheticAsset()).eq(defaultOptions.syntheticAddress);
    expect(await sapphireCore.highCollateralRatio()).eq(defaultOptions.highCollateralRatio);
    expect(await sapphireCore.lowCollateralRatio()).eq(defaultOptions.lowCollateralRatio);
    expect(await sapphireCore.collateralRatioAssessor()).eq(defaultOptions.assessor);
    expect(await sapphireCore.liquidationUserFee()).eq(defaultOptions.liquidationUserFee);
    expect(await sapphireCore.liquidationArcFee()).eq(defaultOptions.liquidationArcFee);
  });

  it('revert if owner inits twice ', async () => {
    await init();
    await expect(init()).to.be.revertedWith('SapphireCoreV1: cannot re-initialize contract');
  });

  it('unauthorized cannot initialize', async () => {
    await expect(init({ executor: unauthorized })).to.be.revertedWith(
      'Ownable: caller is not the owner',
    );
  });
});
