import { MAX_UINT256 } from '@src/constants';
import {
  ArcProxy__factory,
  MockSapphireCoreV1__factory,
  MockSapphireOracle__factory,
  MockSapphirePassportScores__factory,
  SapphireAssessor__factory,
  SapphireMapperLinear__factory,
  SyntheticTokenV2__factory,
  TestToken__factory,
} from '@src/typings';

import { Signer } from 'ethers';
import { ITestContext, ITestContextArgs } from './context';
import { SapphireTestArc } from '@src/SapphireTestArc';
import {
  DEFAULT_COLLATERAL_DECIMALS,
  DEFAULT_HIGH_C_RATIO,
  DEFAULT_LOW_C_RATIO,
  DEFAULT_MAX_CREDIT_SCORE,
} from '@test/helpers/sapphireDefaults';

export async function distributorFixture(ctx: ITestContext) {
  ctx.contracts.collateral = await new TestToken__factory(
    ctx.signers.admin,
  ).deploy('ARC GOVERNANCE', 'ARCX', 18);
}

export async function sapphireFixture(
  ctx: ITestContext,
  args?: ITestContextArgs,
) {
  const deployer: Signer = ctx.signers.admin;
  const deployerAddress = await deployer.getAddress();

  ctx.contracts.collateral = await new TestToken__factory(deployer).deploy(
    'Test collateral',
    'COLL',
    args?.decimals ?? DEFAULT_COLLATERAL_DECIMALS,
  );

  ctx.contracts.sapphire.oracle = await new MockSapphireOracle__factory(deployer).deploy();

  const coreImp = await new MockSapphireCoreV1__factory(deployer).deploy();
  const coreProxy = await new ArcProxy__factory(deployer).deploy(
    coreImp.address,
    deployerAddress,
    [],
  );

  const synthImp = await new SyntheticTokenV2__factory(deployer).deploy('STABLExV2', '1');
  const syntheticProxy = await new ArcProxy__factory(deployer).deploy(
    synthImp.address,
    deployerAddress,
    [],
  );
  const tokenV2 = SyntheticTokenV2__factory.connect(
    syntheticProxy.address,
    deployer,
  );
  await tokenV2.init('STABLExV2', 'STABLExV2', '1');

  ctx.contracts.synthetic.tokenV2 = tokenV2;

  ctx.contracts.sapphire.linearMapper = await new SapphireMapperLinear__factory(
    deployer,
  ).deploy();

  ctx.contracts.sapphire.passportScores = await new MockSapphirePassportScores__factory(
    deployer,
  ).deploy();

  await ctx.contracts.sapphire.passportScores.init(
    '0x1111111111111111111111111111111111111111111111111111111111111111',
    ctx.signers.merkleRootUpdater.address,
    ctx.signers.pauseOperator.address,
  );

  await ctx.contracts.sapphire.passportScores
    .connect(ctx.signers.pauseOperator)
    .setPause(false);

  ctx.contracts.sapphire.assessor = await new SapphireAssessor__factory(
    deployer,
  ).deploy(
    ctx.contracts.sapphire.linearMapper.address,
    ctx.contracts.sapphire.passportScores.address,
    DEFAULT_MAX_CREDIT_SCORE,
  );

  ctx.contracts.sapphire.core = MockSapphireCoreV1__factory.connect(
    coreProxy.address,
    deployer,
  );
  await ctx.contracts.sapphire.core.init(
    ctx.contracts.collateral.address,
    ctx.contracts.synthetic.tokenV2.address,
    ctx.contracts.sapphire.oracle.address,
    ctx.signers.interestSetter.address,
    ctx.signers.pauseOperator.address,
    ctx.contracts.sapphire.assessor.address,
    ctx.signers.feeCollector.address,
    DEFAULT_HIGH_C_RATIO,
    DEFAULT_LOW_C_RATIO,
    0,
    0,
  );

  await tokenV2.addMinter(ctx.contracts.sapphire.core.address, MAX_UINT256);

  // Add admin minter
  await tokenV2.addMinter(ctx.signers.admin.address, MAX_UINT256);

  await ctx.contracts.sapphire.core
    .connect(ctx.signers.pauseOperator)
    .setPause(false);

  ctx.sdks.sapphire = SapphireTestArc.new(deployer);
  await ctx.sdks.sapphire.addSynths({ sapphireSynth: coreProxy.address });
}
