import {
  ArcProxy__factory,
  MockOracle__factory,
  SapphireAssessor__factory,
  SapphireCoreV1__factory,
  SapphireMapperLinear__factory,
  SapphirePassportScores__factory,
  SyntheticTokenV2__factory,
  TestToken__factory,
} from '@src/typings';
import { green, magenta, red, yellow } from 'chalk';
import {
  deployContract,
  DeploymentType,
  loadCollateralConfig,
  loadContract,
  loadDetails,
  NetworkParams,
  pruneDeployments,
} from '../deployments/src';
import { task } from 'hardhat/config';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import _ from 'lodash';
import { MAX_UINT256 } from '@src/constants';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import getUltimateOwner from './task-utils/getUltimateOwner';
import { DEFAULT_MAX_CREDIT_SCORE } from '@test/helpers/sapphireDefaults';
import { constants } from 'ethers';

task(
  'deploy-sapphire-synth',
  'Deploy the Sapphire synthetic token (SyntheticTokenV2)',
)
  .addParam('name', 'The name of the synthetic token')
  .addParam('symbol', 'The symbol of the synthetic token')
  .setAction(async (taskArgs, hre) => {
    const name = taskArgs.name;
    const symbol = taskArgs.symbol;

    const { network, signer, networkConfig } = await loadDetails(hre);

    await pruneDeployments(network, signer.provider);

    // Deploy implementation

    const syntheticAddress = await deployContract(
      {
        name: 'SyntheticToken',
        source: 'SyntheticTokenV2',
        data: new SyntheticTokenV2__factory(signer).getDeployTransaction(
          name,
          '2',
        ),
        version: 2,
        type: DeploymentType.synth,
      },
      networkConfig,
    );

    if (!syntheticAddress) {
      throw red('Synthetic Token has not been deployed!');
    }

    // Deploy proxy

    const syntheticProxyAddress = await deployContract(
      {
        name: 'SyntheticV2Proxy',
        source: 'ArcProxy',
        data: new ArcProxy__factory(signer).getDeployTransaction(
          syntheticAddress,
          signer.address,
          [],
        ),
        version: 2,
        type: DeploymentType.synth,
        group: symbol,
      },
      networkConfig,
    );

    const synthetic = SyntheticTokenV2__factory.connect(
      syntheticProxyAddress,
      signer,
    );

    // Call init()

    const synthName = await synthetic.name();
    if (synthName.length > 0) {
      console.log(
        magenta(`Synthetic init() function has already been called\n`),
      );
      return;
    }

    console.log(yellow(`Calling init() ...\n`));
    try {
      await synthetic.init(name, symbol, '2');
      console.log(green(`init() called successfully!\n`));
    } catch (e) {
      console.log(red(`Failed to call synthetic init().\nReason: ${e}\n`));
    }

    console.log(yellow(`Verifying contract...`));
    await hre.run('verify:verify', {
      address: syntheticAddress,
      constructorArguments: [name, '2'],
    });
    console.log(green(`Contract verified successfully!`));
  });

task(
  'deploy-passport-scores',
  'Deploy the SapphirePassportScores with zero hash as the root',
)
  .addOptionalParam('rootupdater', 'The merkle root updater')
  .addOptionalParam('pauseoperator', 'The pause operator')
  .addFlag('implementationonly', 'Deploy only the implementation contract')
  .setAction(async (taskArgs, hre) => {
    const {
      rootupdater: rootUpdater,
      pauseoperator: pauseOperator,
      implementationonly: implementationOnly,
    } = taskArgs;
    const {
      network,
      signer,
      networkConfig,
      networkDetails,
    } = await loadDetails(hre);

    await pruneDeployments(network, signer.provider);

    const ultimateOwner = getUltimateOwner(signer, networkDetails);

    let version = 1;
    try {
      const existingPassportScoresImpl = loadContract({
        name: 'SapphirePassportScores',
        source: 'SapphirePassportScores',
        network: network,
      });
      version = existingPassportScoresImpl.version + 1;
      console.log(
        yellow(
          `SapphireCreditScore implementation found. Deploying a new version ${version}`,
        ),
      );
    } catch (err) {
      // Nothing to do
    }

    const passportScoresImpAddress = await deployContract(
      {
        name: 'SapphirePassportScores',
        source: 'SapphirePassportScores',
        data: new SapphirePassportScores__factory(
          signer,
        ).getDeployTransaction(),
        version,
        type: DeploymentType.global,
      },
      networkConfig,
    );

    if (implementationOnly) {
      console.log(yellow(`Verifying contract...`));
      await hre.run('verify:verify', {
        address: passportScoresImpAddress,
        constructorArguments: [],
      });
      console.log(green(`Contract verified successfully!`));
      return;
    }

    const passportScoresProxyAddress = await deployContract(
      {
        name: 'SapphirePassportScoresProxy',
        source: 'ArcProxy',
        data: new ArcProxy__factory(signer).getDeployTransaction(
          passportScoresImpAddress,
          await signer.getAddress(),
          [],
        ),
        version: 1,
        type: DeploymentType.global,
      },
      networkConfig,
    );
    const passportScoresContract = SapphirePassportScores__factory.connect(
      passportScoresProxyAddress,
      signer,
    );

    if (!passportScoresProxyAddress) {
      throw red(`SapphirePassportScores could not be deployed :(`);
    }

    console.log(
      green(
        `SapphirePassportScores was successfully deployed at ${passportScoresProxyAddress}`,
      ),
    );

    console.log(yellow(`Calling init()...`));
    await passportScoresContract.init(
      constants.HashZero,
      rootUpdater || ultimateOwner,
      pauseOperator || ultimateOwner,
    );
    console.log(green(`init() called successfully!`));
  });

task('deploy-mapper', 'Deploy the Sapphire Mapper').setAction(
  async (taskArgs, hre) => {
    const { network, signer, networkConfig } = await loadDetails(hre);

    await pruneDeployments(network, signer.provider);

    // Deploy the mapper
    const mapperAddress = await deployContract(
      {
        name: 'SapphireMapperLinear',
        source: 'SapphireMapperLinear',
        data: new SapphireMapperLinear__factory(signer).getDeployTransaction(),
        version: 1,
        type: DeploymentType.global,
      },
      networkConfig,
    );

    console.log(
      green(`Sapphire Mapper Linear successfully deployed at ${mapperAddress}`),
    );

    console.log(yellow(`Verifying contract...`));
    await hre.run('verify:verify', {
      address: mapperAddress,
      constructorArguments: [],
    });
    console.log(green(`Contract verified successfully!`));
  },
);

task('deploy-assessor', 'Deploy the Sapphire Assessor').setAction(
  async (taskArgs, hre) => {
    const { network, signer, networkConfig } = await loadDetails(hre);

    await pruneDeployments(network, signer.provider);

    const creditScoreAddress = loadContract({
      network,
      type: DeploymentType.global,
      name: 'SapphireCreditScore',
    }).address;

    if (!creditScoreAddress) {
      throw red(`The Sapphire Credit Score must be deployed first`);
    }

    const mapperAddress = loadContract({
      network,
      type: DeploymentType.global,
      name: 'SapphireMapperLinear',
    }).address;

    if (!mapperAddress) {
      throw red(`The Sapphire Mapper must be deployed first`);
    }

    // Deploy the mapper
    const assessorAddress = await deployContract(
      {
        name: 'SapphireAssessor',
        source: 'SapphireAssessor',
        data: new SapphireAssessor__factory(signer).getDeployTransaction(
          mapperAddress,
          creditScoreAddress,
          DEFAULT_MAX_CREDIT_SCORE,
        ),
        version: 1,
        type: DeploymentType.global,
      },
      networkConfig,
    );

    console.log(
      green(`Sapphire Assessor successfully deployed at ${assessorAddress}`),
    );

    console.log(yellow(`Verifying contract...`));
    await hre.run('verify:verify', {
      address: assessorAddress,
      constructorArguments: [mapperAddress, creditScoreAddress],
    });
    console.log(green(`Contract verified successfully!`));
  },
);

task('deploy-sapphire', 'Deploy a Sapphire core')
  .addParam('collateral', 'The collateral name to register the core with')
  .setAction(async (taskArgs, hre) => {
    const collatName = taskArgs.collateral;

    const {
      network,
      signer,
      networkConfig,
      networkDetails,
    } = await loadDetails(hre);

    await pruneDeployments(network, signer.provider);

    const collatConfig = await loadCollateralConfig({
      network,
      key: collatName,
    });

    if (!collatConfig) {
      throw red(
        `No configuration has been found for collateral: ${collatName}`,
      );
    }

    const coreAddress = await deployContract(
      {
        name: 'SapphireCore',
        source: 'SapphireCoreV1',
        data: new SapphireCoreV1__factory(signer).getDeployTransaction(),
        version: 1,
        type: DeploymentType.synth,
      },
      networkConfig,
    );

    console.log(
      green(`Sapphire Core implementation deployed at ${coreAddress}`),
    );

    const collateralAddress =
      collatConfig.collateral_address ||
      (await _deployTestCollateral(networkConfig, collatName, signer));

    const oracleAddress = await _deployOracle(
      collatName,
      collatConfig,
      networkConfig,
      signer,
      hre,
    );

    if (!oracleAddress) {
      throw red(`The oracle was not deployed!`);
    }

    const coreProxyAddress = await deployContract(
      {
        name: 'SapphireCoreProxy',
        source: 'ArcProxy',
        data: new ArcProxy__factory(signer).getDeployTransaction(
          coreAddress,
          await signer.getAddress(),
          [],
        ),
        version: 1,
        type: DeploymentType.synth,
        group: collatName,
      },
      networkConfig,
    );

    console.log(green(`Sapphire core proxy deployed at ${coreProxyAddress}`));

    // Initialize core

    const syntheticProxyAddress = loadContract({
      network,
      type: DeploymentType.synth,
      name: 'SyntheticV2Proxy',
    }).address;

    if (!syntheticProxyAddress) {
      throw red(
        `SyntheticTokenV2 was not deployed! Deploy it first, then try again.`,
      );
    }

    const assessorAddress = loadContract({
      network,
      type: DeploymentType.global,
      name: 'SapphireAssessor',
    }).address;

    if (!assessorAddress) {
      throw red(
        `SapphireAssessor was not deployed! Deploy it first, then try again.`,
      );
    }

    const core = SapphireCoreV1__factory.connect(coreProxyAddress, signer);
    const synthetic = SyntheticTokenV2__factory.connect(
      syntheticProxyAddress,
      signer,
    );

    const ultimateOwner = getUltimateOwner(signer, networkDetails);

    console.log(
      red(
        `Please ensure the following details are correct:\n
          Collateral Address: ${collateralAddress}\n
          Synthetic Address: ${syntheticProxyAddress}\n
          Oracle Address: ${oracleAddress}\n
          Interest Rate Setter: ${
            collatConfig.params.interestSetter || ultimateOwner
          }\n
          Pause operator: ${
            collatConfig.params.pauseOperator || ultimateOwner
          }\n,
          Assessor address: ${assessorAddress}\n,
          Fee collector: ${collatConfig.params.feeCollector || ultimateOwner}\n
          High c-ratio: ${collatConfig.params.highCRatio}\n
          Low c-ratio: ${collatConfig.params.lowCRatio}\n
          Liquidation user fee: ${collatConfig.params.liquidationUserFee}\n
          Liquidation ARC fee: ${collatConfig.params.liquidationArcFee}\n`,
      ),
    );

    console.log(yellow(`Calling core.init() ...\n`));

    await core.init(
      collateralAddress,
      syntheticProxyAddress,
      oracleAddress,
      collatConfig.params.interestSetter || ultimateOwner,
      collatConfig.params.pauseOperator || ultimateOwner,
      assessorAddress,
      collatConfig.params.feeCollector || ultimateOwner,
      collatConfig.params.highCRatio,
      collatConfig.params.lowCRatio,
      collatConfig.params.liquidationUserFee,
      collatConfig.params.liquidationArcFee,
      { gasLimit: 150000 },
    );

    console.log(green(`core.init() called successfully!\n`));

    // Set borrow limits if needed. Skip if all zeros
    if (
      !_.isNil(collatConfig.limits) &&
      (collatConfig.limits.totalBorrowLimit ||
        collatConfig.limits.vaultBorrowMin ||
        collatConfig.limits.vaultBorrowMax)
    ) {
      console.log(yellow(`Calling core.setLimits() ...\n`));

      await core.setLimits(
        collatConfig.limits.totalBorrowLimit || 0,
        collatConfig.limits.vaultBorrowMin || 0,
        collatConfig.limits.vaultBorrowMax || 0,
      );

      console.log(yellow(`Limits successfully set!\n`));
    }

    // Add minter to synth
    console.log(yellow(`Adding minter to synthetic...\n`));
    // We already enforce limits at the synthetic level.
    await synthetic.addMinter(
      core.address,
      collatConfig.limits.totalBorrowLimit || MAX_UINT256,
    );
    console.log(green(`Minter successfully added to synthetic\n`));

    // Change admin to ultimate owner
    if (network === 'mainnet') {
      console.log(yellow(`Chaingin admin...`));

      const proxy = ArcProxy__factory.connect(coreProxyAddress, signer);
      await proxy.changeAdmin(ultimateOwner);

      console.log(green(`Admin successfully set to ${ultimateOwner}`));
    }

    console.log(yellow(`Verifying contract...`));
    await hre.run('verify:verify', {
      address: coreAddress,
      constructorArguments: [],
    });
    console.log(green(`Contract verified successfully!`));
  });

function _deployTestCollateral(
  networkConfig: NetworkParams,
  collatName: string,
  signer: SignerWithAddress,
): Promise<string> {
  const { network } = networkConfig;

  if (network === 'mainnet') {
    throw red(
      `"collateral_address" was not set in the collateral config. Please set it and try again.`,
    );
  } else {
    console.log(yellow(`Deploying test collateral...`));

    // On a test net. Deploy test token
    return deployContract(
      {
        name: 'CollateralToken',
        source: 'TestToken',
        data: new TestToken__factory(signer).getDeployTransaction(
          collatName,
          collatName,
          18,
        ),
        version: 1,
        type: DeploymentType.synth,
        group: collatName,
      },
      networkConfig,
    );
  }
}

async function _deployOracle(
  collatName: string,
  collatConfig: any,
  networkConfig: NetworkParams,
  signer: SignerWithAddress,
  hre: HardhatRuntimeEnvironment,
): Promise<string> {
  const { network } = networkConfig;

  if (_.isNil(collatConfig.oracle)) {
    if (network === 'mainnet') {
      throw red(
        `The oracle was not set in the collateral config file. Please set it and try again.`,
      );
    }

    console.log(yellow(`Deploying mock oracle...`));
    const mockOracleAddress = await deployContract(
      {
        name: 'Oracle',
        source: 'MockOracle',
        data: new MockOracle__factory(signer).getDeployTransaction(),
        version: 1,
        type: DeploymentType.synth,
        group: collatName,
      },
      networkConfig,
    );

    console.log(yellow(`Verifying mock oracle...`));
    await hre.run('verify:verify', {
      address: mockOracleAddress,
      constructorArguments: [],
    });
    console.log(green(`Mock Oracle verified successfully!`));
  } else {
    // Oracle is found, deploy it
    const { source, getDeployTx, constructorArguments } = collatConfig.oracle;

    if (!source || !getDeployTx) {
      throw red(
        'No valid oracle was found! Check the "source" and "getDeployTx" fields of the "oracle" key in the collateral config file.',
      );
    }

    console.log(yellow(`Deploying oracle...`));
    const oracleAddress = await deployContract(
      {
        name: 'Oracle',
        source,
        data: getDeployTx(signer),
        version: 1,
        type: DeploymentType.synth,
        group: collatName,
      },
      networkConfig,
    );
    console.log(
      green(`Oracle successfully deployed (or found) at ${oracleAddress}`),
    );

    try {
      console.log(yellow(`Verifying oracle...`));
      await hre.run('verify:verify', {
        address: oracleAddress,
        constructorArguments,
      });
      console.log(green(`Oracle verified successfully!`));
    } catch (err) {
      console.log(
        red(
          `Error verifying oracle. It could be because it was already deployed. ${err}`,
        ),
      );
    }

    return oracleAddress;
  }
}
