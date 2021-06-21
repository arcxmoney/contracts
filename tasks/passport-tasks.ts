import { ArcProxyFactory, DefiPassportFactory } from '@src/typings';
import { green, red, yellow } from 'chalk';
import {
  pruneDeployments,
  loadDetails,
  DeploymentType,
  deployContract,
} from '../deployments/src';
import { task } from 'hardhat/config';

task('deploy-defi-passport', 'Deploy the Defi Passport NFT contract')
  .addParam('name', 'Name of the defi passport NFT')
  .addParam('symbol', 'Symbol of the defi passport NFT')
  .addParam('creditscore', 'Address of the SapphireCreditScore contract to use')
  .addOptionalParam(
    'skinmanager',
    'Address of the skin manager. Default is deployer',
  )
  .setAction(async (taskArgs, hre) => {
    const {
      name,
      symbol,
      creditscore: creditScoreContractAddress,
      skinManager,
    } = taskArgs;

    const { network, signer, networkConfig } = await loadDetails(taskArgs, hre);

    await pruneDeployments(network, signer.provider);

    const defiPassportImpl = await deployContract(
      {
        name: 'DefiPassport',
        source: 'DefiPassport',
        data: new DefiPassportFactory(signer).getDeployTransaction(),
        version: 1,
        type: DeploymentType.global,
        group: 'DefiPassport',
      },
      networkConfig,
    );

    if (defiPassportImpl) {
      console.log(
        green(`DefiPassport implementation deployed at ${defiPassportImpl}`),
      );
    } else {
      throw red(`DefiPassport implementation was not deployed!`);
    }

    const defiPassportProxy = await deployContract(
      {
        name: 'DefiPassportProxy',
        source: 'ArcProxy',
        data: new ArcProxyFactory(signer).getDeployTransaction(
          defiPassportImpl,
          await signer.getAddress(),
          [],
        ),
        version: 1,
        type: DeploymentType.global,
        group: 'DefiPassport',
      },
      networkConfig,
    );

    if (defiPassportProxy) {
      console.log(
        green(
          `DefiPassportProxy successfully deployed at ${defiPassportProxy}`,
        ),
      );
    } else {
      throw red(`DefiPassportProxy was not deployed!`);
    }

    const defiPassportProxyContract = DefiPassportFactory.connect(
      defiPassportProxy,
      signer,
    );

    console.log(
      yellow(`Calling init({
      name: ${name},
      symbol: ${symbol},
      creditScoreContractAddress: ${creditScoreContractAddress},
      skinManager: ${skinManager || (await signer.getAddress())}
    })...`),
    );
    await defiPassportProxyContract.init(
      name,
      symbol,
      creditScoreContractAddress,
      skinManager || (await signer.getAddress()),
    );
    console.log(green(`Init successfully called`));

    console.log(yellow('Verifying contracts...'));
    await hre.run('verify:verify', {
      address: defiPassportImpl,
      constructorArguments: [],
    });
    await hre.run('verify:verify', {
      address: defiPassportProxy,
      constructorArguments: [defiPassportImpl, await signer.getAddress(), []],
    });
  });
