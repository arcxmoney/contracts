import { BigNumberish, BytesLike, Signer } from 'ethers';
import { ethers } from 'hardhat';

import { TestTokenFactory } from '@src/typings/TestTokenFactory';
import { ArcProxyFactory } from '@src/typings/ArcProxyFactory';
import {
  MockSapphireCoreV1Factory,
  MockSapphirePassportScoresFactory,
  SapphirePoolFactory,
} from '@src/typings';
import { MerkleDistributor } from '@src/typings/MerkleDistributor';
import { MockSapphireOracle } from '@src/typings/MockSapphireOracle';
import { DefiPassportFactory } from '@src/typings/DefiPassportFactory';

export async function deployMockSapphireOracle(deployer: Signer) {
  const Contract = await ethers.getContractFactory(
    'MockSapphireOracle',
    deployer,
  );
  const mockOracle = await Contract.deploy();
  return mockOracle as MockSapphireOracle;
}

export async function deployTestToken(
  deployer: Signer,
  name: string,
  symbol: string,
  decimals: BigNumberish = 18,
) {
  const testToken = await new TestTokenFactory(deployer).deploy(
    name,
    symbol,
    decimals,
  );
  return testToken;
}

export async function deployArcProxy(
  deployer: Signer,
  logic: string,
  admin: string,
  data: BytesLike,
) {
  const arcProxy = await new ArcProxyFactory(deployer).deploy(
    logic,
    admin,
    data,
  );
  return arcProxy;
}

export async function deployMerkleDistributor(
  deployer: Signer,
  token: string,
  merkleRoot: string,
) {
  const merkleDistributorFactory = await ethers.getContractFactory(
    'MerkleDistributor',
    deployer,
  );
  const distributor = await merkleDistributorFactory.deploy(token, merkleRoot);
  return distributor as MerkleDistributor;
}

export async function deployMockSapphirePassportScores(deployer: Signer) {
  const creditScoreImp = await new MockSapphirePassportScoresFactory(
    deployer,
  ).deploy();

  const proxy = await deployArcProxy(
    deployer,
    creditScoreImp.address,
    await deployer.getAddress(),
    [],
  );
  return MockSapphirePassportScoresFactory.connect(proxy.address, deployer);
}

export function deployMockSapphireCoreV1(deployer: Signer) {
  return new MockSapphireCoreV1Factory(deployer).deploy();
}

export async function deployDefiPassport(deployer: Signer) {
  const defiPassportImpl = await new DefiPassportFactory(deployer).deploy();

  const proxy = await deployArcProxy(
    deployer,
    defiPassportImpl.address,
    await deployer.getAddress(),
    [],
  );

  return DefiPassportFactory.connect(proxy.address, deployer);
}

export async function deploySapphirePool(deployer: Signer) {
  const poolImpl = await new SapphirePoolFactory(deployer).deploy();
  const poolProxy = await new ArcProxyFactory(deployer).deploy(
    poolImpl.address,
    await deployer.getAddress(),
    [],
  );
  return SapphirePoolFactory.connect(poolProxy.address, deployer);
}
