import BalanceTree from '@src/MerkleTree/BalanceTree';
import { MerkleDistributorFactory } from '@src/typings';
import { readCsv } from '@src/utils/readCsv';
import { green, yellow } from 'chalk';
import { BigNumber } from 'ethers';
import { task } from 'hardhat/config';
import path from 'path';
import { deployContract, DeploymentType, loadDetails, pruneDeployments } from '../deployments/src';

task('distributor-deploy', 'Deploy merkle token distributor')
  .addParam('token', 'The address of the distributed token')
  .addParam('csv', 'The path to csv with distribution data')
  .setAction(async (taskArgs, hre) => {
    const { network, signer, networkConfig } = await loadDetails(hre);
    await pruneDeployments(network, signer.provider);
    const data = readCsv(path.resolve(taskArgs.csv), '\r\n');
    const distributorTree = new BalanceTree(
      data.map((row) => {
        return {
          account: row[0],
          amount: BigNumber.from(row[1]),
        };
      }),
    );
    const distributorAddress = await deployContract(
      {
        name: 'MerkleDistributor',
        source: 'MerkleDistributor',
        data: new MerkleDistributorFactory(signer).getDeployTransaction(
          taskArgs.token,
          distributorTree.getHexRoot(),
        ),
        version: 1,
        type: DeploymentType.global,
      },
      networkConfig,
      5,
    );

    console.log(green(`Contract MerkleDistributor is at ${distributorAddress}`));

    console.log(yellow(`Verifying contract...`));
    await hre.run('verify:verify', {
      address: distributorAddress,
      constructorArguments: [taskArgs.token, distributorTree.getHexRoot()],
    });
    console.log(green(`Contract verified successfully!`));
  });

task('distributor-toggle-activity', 'Switch activity of distributor')
  .addParam('address', 'The address of the distributor contract')
  .setAction(async (taskArgs, hre) => {
    const { signer } = await loadDetails(hre);
    const distributorContract = MerkleDistributorFactory.connect(taskArgs.address, signer);
    const { wait } = await distributorContract.switchActive();
    await wait();
    console.log(
      green(
        `MerkleDistributor is ${
          (await distributorContract.active()) ? 'active ' : 'not active'
        } now`,
      ),
    );
  });