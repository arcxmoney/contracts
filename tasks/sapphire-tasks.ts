import {
  ArcProxyFactory,
  CredsERC20Factory,
  MockOracleFactory,
  SapphireAssessorFactory,
  SapphireCoreV1Factory,
  SapphireMapperLinearFactory,
  SapphirePassportScoresFactory,
  SapphirePoolFactory,
  TestTokenFactory,
} from '@src/typings';
import { green, magenta, red, yellow } from 'chalk';
import {
  deployContract,
  loadCollateralConfig,
  loadContract,
  loadDetails,
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
import { verifyContract } from './task-utils';
import { DeploymentCategory, NetworkParams } from '../deployments/types';
import { TransactionRequest } from '@ethersproject/providers';

task('deploy-creds', 'Deploy the CredsERC20 token')
  .addParam('name', 'The name of the token')
  .addParam('symbol', 'The symbol of the token')
  .setAction(async (taskArgs, hre) => {
    const name = taskArgs.name;
    const symbol = taskArgs.symbol;

    const { network, signer, networkConfig } = await loadDetails(hre);

    await pruneDeployments(network, signer.provider);

    // Deploy implementation

    const credsAddress = await deployContract(
      {
        name: 'CredsERC20',
        source: 'CredsERC20',
        data: new CredsERC20Factory(signer).getDeployTransaction(),
        version: 2,
        type: DeploymentCategory.borrowing,
        group: symbol,
      },
      networkConfig,
    );

    if (!credsAddress) {
      throw red(`${name} has not been deployed!`);
    }

    await verifyContract(hre, credsAddress);

    // Deploy proxy
    const credsProxyAddress = await deployContract(
      {
        name: 'CredsERC20',
        source: 'ArcProxy',
        data: new ArcProxyFactory(signer).getDeployTransaction(
          credsAddress,
          signer.address,
          [],
        ),
        version: 2,
        type: DeploymentCategory.borrowing,
        group: symbol,
      },
      networkConfig,
    );

    await verifyContract(
      hre,
      credsProxyAddress,
      credsAddress,
      signer.address,
      [],
    );

    const creds = CredsERC20Factory.connect(credsProxyAddress, signer);

    // Call init()
    const credsName = await creds.name();
    if (credsName.length > 0) {
      console.log(magenta(`Creds init() function has already been called\n`));
      return;
    }

    console.log(yellow(`Calling init() ...\n`));
    try {
      await creds.init(name, symbol);
      console.log(green(`init() called successfully!\n`));
    } catch (e) {
      console.log(red(`Failed to call creds init().\nReason: ${e}\n`));
    }
  });

task(
  'deploy-passport-scores',
  'Deploy the SapphirePassportScores with zero hash as the root',
)
  .addOptionalParam('rootupdater', 'The merkle root updater')
  .addOptionalParam('pauseoperator', 'The pause operator')
  .addOptionalParam('initialEpoch', 'The initial epoch number')
  .addFlag('implementationonly', 'Deploy only the implementation contract')
  .setAction(async (taskArgs, hre) => {
    const {
      rootupdater: rootUpdater,
      pauseoperator: pauseOperator,
      implementationonly: implementationOnly,
      initialEpoch,
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
      version = existingPassportScoresImpl.version;
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
        data: new SapphirePassportScoresFactory(signer).getDeployTransaction(),
        version,
        type: DeploymentCategory.global,
      },
      networkConfig,
    );
    await verifyContract(hre, passportScoresImpAddress);

    if (implementationOnly) {
      return;
    }

    const passportScoresProxyAddress = await deployContract(
      {
        name: 'SapphirePassportScoresProxy',
        source: 'ArcProxy',
        data: new ArcProxyFactory(signer).getDeployTransaction(
          passportScoresImpAddress,
          await signer.getAddress(),
          [],
        ),
        version: 1,
        type: DeploymentCategory.global,
      },
      networkConfig,
    );
    const passportScoresContract = SapphirePassportScoresFactory.connect(
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
      initialEpoch || 0,
    );
    console.log(green(`init() called successfully!`));

    console.log(yellow('Verifying proxy..'));
    await verifyContract(
      hre,
      passportScoresProxyAddress,
      passportScoresImpAddress,
      await signer.getAddress(),
      [],
    );
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
        data: new SapphireMapperLinearFactory(signer).getDeployTransaction(),
        version: 1,
        type: DeploymentCategory.global,
      },
      networkConfig,
    );

    console.log(
      green(`Sapphire Mapper Linear successfully deployed at ${mapperAddress}`),
    );

    await verifyContract(hre, mapperAddress);
  },
);

task('deploy-assessor', 'Deploy the Sapphire Assessor').setAction(
  async (taskArgs, hre) => {
    const { network, signer, networkConfig } = await loadDetails(hre);

    await pruneDeployments(network, signer.provider);

    const passportScoresAddress = loadContract({
      network,
      type: DeploymentCategory.global,
      name: 'SapphirePassportScores',
    }).address;

    if (!passportScoresAddress) {
      throw red(`The Sapphire Credit Score must be deployed first`);
    }

    const mapperAddress = loadContract({
      network,
      type: DeploymentCategory.global,
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
        data: new SapphireAssessorFactory(signer).getDeployTransaction(
          mapperAddress,
          passportScoresAddress,
          DEFAULT_MAX_CREDIT_SCORE,
        ),
        version: 1,
        type: DeploymentCategory.global,
      },
      networkConfig,
    );

    await verifyContract(
      hre,
      assessorAddress,
      mapperAddress,
      passportScoresAddress,
      DEFAULT_MAX_CREDIT_SCORE,
    );
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
        data: new SapphireCoreV1Factory(signer).getDeployTransaction(),
        version: 1,
        type: DeploymentCategory.borrowing,
        group: collatName,
      },
      networkConfig,
    );
    console.log(
      green(`Sapphire Core implementation deployed at ${coreAddress}`),
    );
    await verifyContract(hre, coreAddress);

    const { collateralAddress } = collatConfig;

    const oracleAddress = await _deployOracle(
      collatName,
      networkConfig,
      signer,
      hre,
      collatConfig.oracle,
    );

    if (!oracleAddress) {
      throw red(`The oracle was not deployed!`);
    }

    const coreProxyAddress = await deployContract(
      {
        name: 'SapphireCoreProxy',
        source: 'ArcProxy',
        data: new ArcProxyFactory(signer).getDeployTransaction(
          coreAddress,
          await signer.getAddress(),
          [],
        ),
        version: 1,
        type: DeploymentCategory.borrowing,
        group: collatName,
      },
      networkConfig,
    );
    console.log(green(`Sapphire core proxy deployed at ${coreProxyAddress}`));
    await verifyContract(
      hre,
      coreProxyAddress,
      coreAddress,
      await signer.getAddress(),
      [],
    );

    // Initialize core

    const credsProxyAddress = loadContract({
      network,
      name: 'CredsERC20',
      source: 'ArcProxy',
    }).address;

    const assessorAddress = loadContract({
      network,
      type: DeploymentCategory.global,
      name: 'SapphireAssessor',
    }).address;

    const core = SapphireCoreV1Factory.connect(coreProxyAddress, signer);
    const creds = CredsERC20Factory.connect(credsProxyAddress, signer);

    const ultimateOwner = getUltimateOwner(signer, networkDetails);

    console.log(
      red(
        `Please ensure the following details are correct:\n
          Collateral Address: ${collateralAddress}\n
          Creds Address: ${credsProxyAddress}\n
          Oracle Address: ${oracleAddress}\n
          Interest Rate Setter: ${
            collatConfig.interestSettings.interestSetter || ultimateOwner
          }\n
          Pause operator: ${collatConfig.pauseOperator || ultimateOwner}\n,
          Assessor address: ${assessorAddress}\n,
          Fee collector: ${collatConfig.feeCollector || ultimateOwner}\n
          High c-ratio: ${collatConfig.borrowRatios.highCRatio}\n
          Low c-ratio: ${collatConfig.borrowRatios.lowCRatio}\n`,
      ),
    );

    console.log(yellow(`Calling core.init() ...\n`));

    await core.init(
      collateralAddress,
      credsProxyAddress,
      oracleAddress,
      collatConfig.interestSettings.interestSetter || ultimateOwner,
      collatConfig.pauseOperator || ultimateOwner,
      assessorAddress,
      collatConfig.feeCollector || ultimateOwner,
      collatConfig.borrowRatios.highCRatio,
      collatConfig.borrowRatios.lowCRatio,
    );

    console.log(green(`core.init() called successfully!\n`));

    console.log(
      yellow(`Setting fees...\n
      Liquidator discount: ${collatConfig.fees.liquidatorDiscount}\n
      Arc liquidation fee: ${collatConfig.fees.liquidationArcFee}\n
      Pool interest fee: ${collatConfig.fees.poolInterestFee}\n
      Borrow fee: ${collatConfig.fees.borrowFee}
    `),
    );
    await core.setFees(
      collatConfig.fees.liquidatorDiscount,
      collatConfig.fees.liquidationArcFee,
      collatConfig.fees.borrowFee,
      collatConfig.fees.poolInterestFee,
    );
    console.log(green('Fees successfully set\n'));

    // Set borrow limits if needed. Skip if all zeros
    console.log(
      yellow(`Setting limits:\n
      Vault borrow min: ${collatConfig.limits.vaultBorrowMin || 0}\n
      Vault borrow max: ${collatConfig.limits.vaultBorrowMax || 0}\n
      Default borrow limit: ${collatConfig.limits.defaultBorrowLimit || 0}
    `),
    );
    await core.setLimits(
      collatConfig.limits.vaultBorrowMin || 0,
      collatConfig.limits.vaultBorrowMax || 0,
      collatConfig.limits.defaultBorrowLimit || 0,
    );
    console.log(yellow(`Limits successfully set!\n`));

    // Add minter to Creds
    console.log(yellow(`Adding minter to Creds...\n`));
    // We already enforce limits at the Creds level.
    await creds.addMinter(core.address, collatConfig.mintLimit);
    console.log(green(`Minter successfully added to creds\n`));

    if (collatConfig.interestSettings.interestRate) {
      console.log(
        yellow(
          `Setting interest rate to ${collatConfig.interestSettings.interestRate.toString()}\n`,
        ),
      );
      await core.setInterestRate(collatConfig.interestSettings.interestRate);
      console.log(green(`Interest rate successfully set\n`));
    }
  });

task('deploy-borrow-pool')
  .addParam('name', 'Sapphire pool ERC20 name')
  .addParam('symbol', 'Sapphire pool ERC20 symbol')
  .setAction(async (taskArgs, hre) => {
    const { network, signer, networkConfig } = await loadDetails(hre);
    const { name, symbol } = taskArgs;

    await pruneDeployments(network, signer.provider);

    const credsAddress = loadContract({
      network,
      name: 'CredsERC20',
      source: 'ArcProxy',
    }).address;

    const sapphirePoolAddress = await deployContract(
      {
        name: 'SapphirePool',
        source: 'SapphirePool',
        data: new SapphirePoolFactory(signer).getDeployTransaction(),
        version: 1,
        type: DeploymentCategory.global,
      },
      networkConfig,
    );
    console.log(green(`Sapphire pool deployed at ${sapphirePoolAddress}`));

    console.log(yellow('Calling init...'));
    await SapphirePoolFactory.connect(sapphirePoolAddress, signer).init(
      name,
      symbol,
      credsAddress,
    );
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
        data: new TestTokenFactory(signer).getDeployTransaction(
          collatName,
          collatName,
          18,
        ),
        version: 1,
        type: DeploymentCategory.borrowing,
        group: collatName,
      },
      networkConfig,
    );
  }
}

/**
 *
 * @param networkConfig
 * @param signer
 * @param hre
 * @returns
 */
async function _deployOracle(
  collatName: string,
  networkConfig: NetworkParams,
  signer: SignerWithAddress,
  hre: HardhatRuntimeEnvironment,
  oracleConfig?: {
    source?: string;
    getDeployTx: (SignerWithAddress) => TransactionRequest;
    constructorArguments: unknown[];
  },
): Promise<string> {
  const { network } = networkConfig;

  if (_.isNil(oracleConfig)) {
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
        data: new MockOracleFactory(signer).getDeployTransaction(),
        version: 1,
        type: DeploymentCategory.borrowing,
        group: collatName,
      },
      networkConfig,
    );

    await verifyContract(hre, mockOracleAddress);
  } else {
    // Oracle is found, deploy it
    const { source, getDeployTx, constructorArguments } = oracleConfig;

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
        type: DeploymentCategory.borrowing,
        group: collatName,
      },
      networkConfig,
    );
    console.log(
      green(`Oracle successfully deployed (or found) at ${oracleAddress}`),
    );
    await verifyContract(hre, oracleAddress, ...constructorArguments);

    return oracleAddress;
  }
}
