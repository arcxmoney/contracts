import { BigNumberish, Signer } from 'ethers';
import { ethers } from 'hardhat';

import ArcDecimal from '@src/utils/ArcDecimal';

import { TestTokenFactory } from '@src/typings/TestTokenFactory';
import { ArcProxyFactory } from '@src/typings/ArcProxyFactory';
import { MockMozartV1 } from '@src/typings/MockMozartV1';
import { SyntheticTokenV1 } from '@src/typings/SyntheticTokenV1';
import { MockMozartSavingsV1 } from '@src/typings/MockMozartSavingsV1';
import { CoreV4 } from '@src/typings/CoreV4';
import { StateV1 } from '@src/typings/StateV1';
import { StaticSyntheticToken } from '@src/typings/StaticSyntheticToken';
import { CoreV3 } from '@src/typings/CoreV3';
import { AddressAccrual } from '@src/typings/AddressAccrual';
import { MockRewardCampaign } from '@src/typings/MockRewardCampaign';
import { TokenStakingAccrual } from '@src/typings/TokenStakingAccrual';
import { KYFV2 } from '@src/typings/KYFV2';
import { MockOracle } from '@src/typings/MockOracle';

export async function deployMockMozartCoreV1(deployer: Signer) {
  const Contract = await ethers.getContractFactory('MockMozartV1', deployer);
  const mozartCoreV1 = await Contract.deploy();
  return mozartCoreV1 as MockMozartV1;
}

export async function deploySpritzCoreV3(deployer: Signer) {
  const Contract = await ethers.getContractFactory('CoreV3', deployer);
  const coreV3 = await Contract.deploy();
  return coreV3 as CoreV3;
}

export async function deploySpritzCoreV4(deployer: Signer) {
  const Contract = await ethers.getContractFactory('CoreV4', deployer);
  const coreV4 = await Contract.deploy();
  return coreV4 as CoreV4;
}

export async function deploySpritzStateV1(
  deployer: Signer,
  core: string,
  collateral: string,
  synthetic: string,
  oracle: string,
  collateralRatio: BigNumberish,
  liquidationArcFee: BigNumberish,
  liquidationUserFee: BigNumberish,
) {
  const Contract = await ethers.getContractFactory('StateV1', deployer);
  // new StateV1Factory().deploy()
  const coreV4 = await Contract.deploy(
    core,
    collateral,
    synthetic,
    oracle,
    {
      collateralRatio: { value: collateralRatio },
      liquidationArcFee: { value: liquidationArcFee },
      liquidationUserFee: { value: liquidationUserFee },
    },
    {
      collateralLimit: 0,
      syntheticLimit: 0,
      positionCollateralMinimum: 0,
    },
  );
  return coreV4 as StateV1;
}

export async function deploySyntheticTokenV1(deployer: Signer) {
  const Contract = await ethers.getContractFactory('SyntheticTokenV1', deployer);
  const syntheticTokenV1 = await Contract.deploy();
  return syntheticTokenV1 as SyntheticTokenV1;
}

export async function deployMockOracle(deployer: Signer) {
  const Contract = await ethers.getContractFactory('MockOracle', deployer);
  const mockOracle = await Contract.deploy();
  return mockOracle as MockOracle;
}

export async function deployTestToken(
  deployer: Signer,
  name: string,
  symbol: string,
  decimals: BigNumberish = 18,
) {
  const testToken = await new TestTokenFactory(deployer).deploy(name, symbol, decimals);
  return testToken;
}

export async function deployArcProxy(deployer: Signer, logic: string, admin: string, data: any[]) {
  const arcProxy = await new ArcProxyFactory(deployer).deploy(logic, admin, data);
  return arcProxy;
}

export async function deployMockSavingsV1(deployer: Signer, core: string, stakeToken: string) {
  const Contract = await ethers.getContractFactory('MockMozartSavingsV1', deployer);
  const savingsV1 = await Contract.deploy(
    core,
    stakeToken,
    await deployer.getAddress(),
    ArcDecimal.new(0),
  );
  return savingsV1 as MockMozartSavingsV1;
}

export async function deployStaticSynthetic(deployer: Signer) {
  const Contract = await ethers.getContractFactory('StaticSyntheticToken', deployer);
  const staticSyntheticToken = await Contract.deploy('Synth', 'SYNTHUS');
  return staticSyntheticToken as StaticSyntheticToken;
}

export async function deployAddressAccrual(deployer: Signer, rewardToken: string) {
  const Contract = await ethers.getContractFactory('AddressAccrual', deployer);
  const addressAccrual = await Contract.deploy(rewardToken);
  return addressAccrual as AddressAccrual;
}

export async function deployMockRewardCampaign(
  deployer: Signer,
  dao: string,
  distributor: string,
  rewardToken: string,
  stakingToken: string,
) {
  const Contract = await ethers.getContractFactory('MockRewardCampaign', deployer);
  const mockRewardCampaign = await Contract.deploy(dao, distributor, rewardToken, stakingToken);
  return mockRewardCampaign as MockRewardCampaign;
}

export async function deployTokenStakingAccrual(
  deployer: Signer,
  stakingToken: string,
  rewardToken: string,
) {
  const Contract = await ethers.getContractFactory('TokenStakingAccrual', deployer);
  const tokenStakingAccrual = await Contract.deploy(stakingToken, rewardToken);
  return tokenStakingAccrual as TokenStakingAccrual;
}

export async function deployKyfV2(deployer: Signer) {
  const KYFV2 = await ethers.getContractFactory('KYFV2', deployer);
  const kyfv2 = await KYFV2.deploy();
  return kyfv2 as KYFV2;
}
