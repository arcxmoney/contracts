import { ethers } from 'hardhat';
import { loadContract } from '../../deployments/src/loadContracts';
import { DeploymentType } from '../../deployments/src/writeToDeployments';
import { generatedWallets } from '../helpers/generatedWallets';
import { expect } from 'chai';
import { MozartV1Factory, SyntheticTokenV1Factory } from '@src/typings';

/* eslint-disable @typescript-eslint/no-var-requires */
require('dotenv').config();

/* eslint-disable @typescript-eslint/no-var-requires */
const hre = require('hardhat');

const networks = ['mainnet', 'rinkeby'];

describe('Mozart.deployments', () => {
  networks.forEach((network) => {
    describe(network, () => testNetwork(network));
  });
});

function testNetwork(network: string) {
  const hreNetwork = hre.config.networks[network];
  const provider = new ethers.providers.JsonRpcProvider(hreNetwork.url);
  const signer = generatedWallets(provider)[0];
  const isOwnerSet = hreNetwork.users?.owner?.length > 0;
  const ultimateOwner = hreNetwork.users?.owner.toLowerCase();

  const synths = ['ETHX'];

  synths.forEach((synth) => {
    const coreProxyDetails = loadContract({
      network,
      type: DeploymentType.synth,
      group: synth,
      name: 'CoreProxy',
    });

    const syntheticProxyDetails = loadContract({
      network,
      type: DeploymentType.synth,
      group: synth,
      name: 'SyntheticProxy',
    });

    const oracleDetails = loadContract({
      network,
      type: DeploymentType.synth,
      group: synth,
      name: 'Oracle',
    });

    const mozartCore = MozartV1Factory.connect(coreProxyDetails.address, signer);
    const synthetic = SyntheticTokenV1Factory.connect(syntheticProxyDetails.address, signer);

    it('should have the core configured correctly', async () => {
      expect((await mozartCore.getAdmin()).toLowerCase()).to.equal(ultimateOwner.toLowerCase());
      expect((await mozartCore.getCurrentOracle()).toLowerCase()).to.equal(
        oracleDetails.address.toLowerCase(),
      );
      expect((await mozartCore.getSyntheticAsset()).toLowerCase()).to.equal(
        syntheticProxyDetails.address.toLowerCase(),
      );
    });

    it('should have the synthetic configured correctly', async () => {
      expect(await (await synthetic.getAdmin()).toLowerCase()).to.equal(ultimateOwner);
    });
  });
}
