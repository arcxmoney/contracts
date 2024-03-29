import {
  ArcProxyFactory,
  FlashLiquidatorAaveV2Factory,
  FlashLiquidatorAaveV3Factory,
  MockSapphireOracleFactory,
  SapphireAssessorFactory,
  SapphireCoreV1,
  SapphireCoreV1Factory,
  SapphireMapperLinearFactory,
  SapphirePassportScoresFactory,
  SapphirePoolFactory,
} from '@src/typings';
import { green, red, yellow } from 'chalk';
import { loadCollateralConfig, loadContract } from '../deployments/src';
import { task, types } from 'hardhat/config';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import _ from 'lodash';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import getUltimateOwner from './utils/getUltimateOwner';
import { DEFAULT_MAX_CREDIT_SCORE } from '@test/helpers/sapphireDefaults';
import { constants, utils } from 'ethers';
import {
  CoreConfig,
  DeploymentType,
  NetworkParams,
} from '../deployments/types';
import { TransactionRequest } from '@ethersproject/providers';
import prompt from 'prompt';
import { pruneDeployments } from './utils/pruneDeployments';
import { verifyContract } from './utils/verifyContract';
import { deployAndSaveContract } from './utils/deployAndSaveContract';
import { loadHardhatDetails } from './utils/loadHardhatDetails';

task(
  'deploy-passport-scores',
  'Deploy the SapphirePassportScores with zero hash as the root',
)
  .addOptionalParam('rootUpdater', 'The merkle root updater')
  .addOptionalParam('pauseOperator', 'The pause operator')
  .addOptionalParam('initialEpoch', 'The initial epoch number')
  .addFlag('implementationOnly', 'Deploy only the implementation contract')
  .setAction(async (taskArgs, hre) => {
    const {
      rootUpdater,
      pauseOperator,
      implementationOnly,
      initialEpoch,
    } = taskArgs;
    const {
      network,
      signer,
      networkConfig,
      networkDetails,
    } = await loadHardhatDetails(hre);

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

    const passportScoresImpAddress = await deployAndSaveContract(
      {
        name: 'SapphirePassportScores',
        source: 'SapphirePassportScores',
        data: new SapphirePassportScoresFactory(signer).getDeployTransaction(),
        version,
        type: DeploymentType.global,
      },
      networkConfig,
    );
    await verifyContract(hre, passportScoresImpAddress);

    if (implementationOnly) {
      return;
    }

    const passportScoresProxyAddress = await deployAndSaveContract(
      {
        name: 'SapphirePassportScoresProxy',
        source: 'ArcProxy',
        data: new ArcProxyFactory(signer).getDeployTransaction(
          passportScoresImpAddress,
          await signer.getAddress(),
          [],
        ),
        version: 1,
        type: DeploymentType.global,
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
  async (_, hre) => {
    const { network, signer, networkConfig } = await loadHardhatDetails(hre);

    await pruneDeployments(network, signer.provider);

    // Deploy the mapper
    const mapperAddress = await deployAndSaveContract(
      {
        name: 'SapphireMapperLinear',
        source: 'SapphireMapperLinear',
        data: new SapphireMapperLinearFactory(signer).getDeployTransaction(),
        version: 1,
        type: DeploymentType.borrowing,
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
  async (_, hre) => {
    const { network, signer, networkConfig } = await loadHardhatDetails(hre);

    await pruneDeployments(network, signer.provider);

    const passportScoresAddress = loadContract({
      network,
      type: DeploymentType.global,
      name: 'SapphirePassportScoresProxy',
    }).address;

    if (!passportScoresAddress) {
      throw red(`The Sapphire Credit Score must be deployed first`);
    }

    const mapperAddress = loadContract({
      network,
      type: DeploymentType.borrowing,
      name: 'SapphireMapperLinear',
    }).address;

    if (!mapperAddress) {
      throw red(`The Sapphire Mapper must be deployed first`);
    }

    // Deploy the mapper
    const assessorAddress = await deployAndSaveContract(
      {
        name: 'SapphireAssessor',
        source: 'SapphireAssessor',
        data: new SapphireAssessorFactory(signer).getDeployTransaction(
          mapperAddress,
          passportScoresAddress,
          DEFAULT_MAX_CREDIT_SCORE,
        ),
        version: 1,
        type: DeploymentType.borrowing,
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
  .addOptionalParam(
    'collateral',
    'The collateral name to register the core with',
  )
  .addOptionalParam('contractVersion', 'Implementation version')
  .addFlag('implementationOnly', 'Deploy only the implementation contract')
  .setAction(async (taskArgs, hre) => {
    const {
      collateral: collatName,
      contractVersion,
      implementationOnly,
    } = taskArgs;

    const {
      network,
      signer,
      networkConfig,
      networkDetails,
    } = await loadHardhatDetails(hre);

    await pruneDeployments(network, signer.provider);

    const coreAddress = await deployAndSaveContract(
      {
        name: 'SapphireCore',
        source: 'SapphireCoreV1',
        data: new SapphireCoreV1Factory(signer).getDeployTransaction(),
        version: parseInt(contractVersion || '1'),
        type: DeploymentType.borrowing,
      },
      networkConfig,
    );
    console.log(
      green(`Sapphire Core implementation deployed at ${coreAddress}`),
    );
    await verifyContract(hre, coreAddress);

    if (implementationOnly) return;

    if (!collatName) {
      throw red('You must specify the collateral name');
    }

    const collatConfig = await loadCollateralConfig({
      network,
      key: collatName,
    });

    if (!collatConfig) {
      throw red(
        `No configuration has been found for collateral: ${collatName}`,
      );
    }

    console.log(
      yellow(`Collateral config:\n`, JSON.stringify(collatConfig, null, 2)),
    );

    const coreProxyAddress = await deployAndSaveContract(
      {
        name: 'SapphireCoreProxy',
        source: 'ArcProxy',
        data: new ArcProxyFactory(signer).getDeployTransaction(
          coreAddress,
          await signer.getAddress(),
          [],
        ),
        version: 1,
        type: DeploymentType.borrowing,
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

    const { collateralAddress } = collatConfig;

    const oracleAddress =
      typeof collatConfig.oracle === 'string'
        ? collatConfig.oracle
        : await _deployOracle(networkConfig, signer, hre, collatConfig.oracle);

    if (!oracleAddress) {
      throw red(`The oracle was not deployed!`);
    }

    // Initialize core
    const assessorAddress = loadContract({
      network,
      type: DeploymentType.borrowing,
      name: 'SapphireAssessor',
    }).address;

    const core = SapphireCoreV1Factory.connect(coreProxyAddress, signer);

    const ultimateOwner = getUltimateOwner(signer, networkDetails);

    if (!ultimateOwner || ultimateOwner === constants.AddressZero) {
      throw red(`Ultimate owner is null`);
    }

    console.log(
      yellow(
        `Ultimate owner is ${
          collatConfig.interestSettings.interestSetter || ultimateOwner
        }`,
      ),
    );

    const collateralAddressSet = await core.collateralAsset();
    if (collateralAddressSet === constants.AddressZero) {
      prompt.start();
      console.log(
        red(
          `Please ensure the following details are correct:
            Collateral Address: ${collateralAddress}
            Oracle Address: ${oracleAddress}
            Interest Rate Setter: ${
              collatConfig.interestSettings.interestSetter || ultimateOwner
            }
            Pause operator: ${collatConfig.pauseOperator || ultimateOwner}
            Assessor address: ${assessorAddress}
            Fee collector: ${collatConfig.feeCollector || ultimateOwner}
            High c-ratio: ${collatConfig.borrowRatios.highCRatio}
            Low c-ratio: ${collatConfig.borrowRatios.lowCRatio}`,
        ),
      );
      const { agree } = await prompt.get([
        {
          name: 'agree',
          description: 'Do you agree?',
          default: 'Y',
        },
      ]);
      if (agree.toString().toLowerCase() !== 'y') {
        throw red(`You must agree to continue`);
      }

      console.log(yellow(`Calling core.init() ...\n`));
      // Setting interest rate setter as the deployer, to set it to the ultimate owner or prescribed interest setter later

      const tx = await core.init(
        collateralAddress,
        oracleAddress,
        signer.address,
        collatConfig.pauseOperator || ultimateOwner,
        assessorAddress,
        collatConfig.feeCollector || ultimateOwner,
        collatConfig.borrowRatios.highCRatio,
        collatConfig.borrowRatios.lowCRatio,
      );
      await tx.wait();
      console.log(green(`core.init() called successfully!\n`));
    } else {
      console.log(green('Core already initialized!'));
    }

    if ((await core.borrowPool()) !== collatConfig.borrowPool) {
      console.log(
        yellow(`Setting borrow pool to ${collatConfig.borrowPool} ...`),
      );
      await core.setBorrowPool(collatConfig.borrowPool);
      console.log(green('Borrow pool set successfully'));
    }

    if (await shouldSetFees(core, collatConfig)) {
      console.log(
        yellow(`Setting fees...
        Liquidator discount: ${collatConfig.fees.liquidatorDiscount}
        Arc liquidation fee: ${collatConfig.fees.liquidationArcFee}
        Pool interest fee: ${collatConfig.fees.poolInterestFee}
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
    }

    // Set borrow limits if needed. Skip if all zeros
    if (await shouldSetLimits(core, collatConfig)) {
      console.log(
        yellow(`Setting limits:
        Vault borrow min: ${collatConfig.limits.vaultBorrowMin || 0}
        Vault borrow max: ${collatConfig.limits.vaultBorrowMax || 0}
        Default borrow limit: ${collatConfig.limits.defaultBorrowLimit || 0}
      `),
      );
      await core.setLimits(
        collatConfig.limits.vaultBorrowMin || 0,
        collatConfig.limits.vaultBorrowMax || 0,
        collatConfig.limits.defaultBorrowLimit || 0,
      );
      console.log(yellow(`Limits successfully set!\n`));
    }

    if (collatConfig.interestSettings.interestRate) {
      console.log(
        yellow(
          `Setting interest rate to ${collatConfig.interestSettings.interestRate.toString()}\n`,
        ),
      );
      await core.setInterestRate(collatConfig.interestSettings.interestRate);
      console.log(green(`Interest rate successfully set\n`));
    }

    if (
      collatConfig.interestSettings.interestSetter &&
      collatConfig.interestSettings.interestSetter !== signer.address
    ) {
      console.log(
        yellow(
          `Setting interest setter to ${
            collatConfig.interestSettings.interestSetter || ultimateOwner
          }\n`,
        ),
      );
      await core.setInterestSetter(
        collatConfig.interestSettings.interestSetter || ultimateOwner,
      );
      console.log(green(`Interest setter successfully set\n`));
    }

    if (collatConfig.creditLimitProofProtocol) {
      const existingLimitProtocol = await core.getProofProtocol(1);
      if (existingLimitProtocol !== collatConfig.creditLimitProofProtocol) {
        console.log(yellow('Setting credit limit proof protocol...'));
        await core.setProofProtocols([
          utils.formatBytes32String('arcx.credit'),
          utils.formatBytes32String(collatConfig.creditLimitProofProtocol),
        ]);
        console.log(green('Credit limit proof protocol set successfully\n'));
      }
    }
  });

task('deploy-borrow-pool')
  .addOptionalParam('name', 'Sapphire pool ERC20 name')
  .addOptionalParam('symbol', 'Sapphire pool ERC20 symbol')
  .addOptionalParam(
    'contractVersion',
    'Implementation contract version',
    1,
    types.int,
  )
  .addOptionalParam(
    'group',
    'Group name for the deployment registration (A, B, C)',
  )
  .addFlag('implementationOnly', 'Only deploy the implementation contract')
  .setAction(async (taskArgs, hre) => {
    const { network, signer, networkConfig } = await loadHardhatDetails(hre);
    const {
      name,
      symbol,
      contractVersion,
      implementationOnly,
      group,
    } = taskArgs;

    await pruneDeployments(network, signer.provider);

    const sapphirePoolImpl = await deployAndSaveContract(
      {
        name: 'SapphirePool',
        source: 'SapphirePool',
        data: new SapphirePoolFactory(signer).getDeployTransaction(),
        version: contractVersion,
        type: DeploymentType.borrowing,
      },
      networkConfig,
    );
    await verifyContract(hre, sapphirePoolImpl);

    if (implementationOnly) {
      return;
    }

    if (!name || !symbol) {
      throw red(`You must specify a name and symbol for the pool`);
    }

    const sapphirePoolProxy = await deployAndSaveContract(
      {
        name: 'SapphirePoolProxy',
        source: 'ArcProxy',
        data: new ArcProxyFactory(signer).getDeployTransaction(
          sapphirePoolImpl,
          signer.address,
          [],
        ),
        version: 1,
        type: DeploymentType.borrowing,
        group,
      },
      networkConfig,
    );
    await verifyContract(
      hre,
      sapphirePoolProxy,
      sapphirePoolImpl,
      signer.address,
      [],
    );

    console.log(green(`Sapphire pool deployed at ${sapphirePoolProxy}`));

    console.log(yellow('Calling init...'));
    console.log({
      name,
      symbol,
    });
    await SapphirePoolFactory.connect(sapphirePoolProxy, signer).init(
      name,
      symbol,
    );
  });

task('deploy-liquidator')
  .addParam('aaveAddressProvider', 'Aave address provider')
  .addParam('swapRouter', 'Uniswap V3 swap router')
  .addParam('profitReceiver', 'Profit receiver')
  .setAction(async (taskArgs, hre) => {
    const { signer, networkConfig } = await loadHardhatDetails(hre);
    const { aaveAddressProvider, swapRouter, profitReceiver } = taskArgs;

    let factory: FlashLiquidatorAaveV2Factory | FlashLiquidatorAaveV3Factory;
    let source: string;
    if (networkConfig.network === 'mainnet') {
      factory = new FlashLiquidatorAaveV2Factory(signer);
      source = 'FlashLiquidatorAaveV2';
    } else if (networkConfig.network === 'polygon') {
      factory = new FlashLiquidatorAaveV3Factory(signer);
      source = 'FlashLiquidatorAaveV3';
    } else {
      throw new Error(`Network ${networkConfig.network} not supported`);
    }

    const sapphireLiquidator = await deployAndSaveContract(
      {
        name: 'FlashLiquidator',
        source,
        data: factory.getDeployTransaction(
          aaveAddressProvider,
          swapRouter,
          profitReceiver,
        ),
        version: 1,
        type: DeploymentType.global,
      },
      networkConfig,
    );
    await verifyContract(
      hre,
      sapphireLiquidator,
      aaveAddressProvider,
      swapRouter,
      profitReceiver,
    );

    console.log(
      green(
        `FlashLiquidator was successfully deployed at ${sapphireLiquidator}`,
      ),
    );
  });

/**
 * Deploys the given oracle, or a mock oracle
 */
async function _deployOracle(
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
    const mockOracleAddress = await deployAndSaveContract(
      {
        name: 'Oracle',
        source: 'MockOracle',
        data: new MockSapphireOracleFactory(signer).getDeployTransaction(),
        version: 1,
        type: DeploymentType.global,
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
    const oracleAddress = await deployAndSaveContract(
      {
        name: 'Oracle',
        source,
        data: getDeployTx(signer),
        version: 1,
        type: DeploymentType.global,
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

async function shouldSetFees(
  core: SapphireCoreV1,
  collatConfig: CoreConfig,
): Promise<boolean> {
  if (
    !(await core.liquidatorDiscount()).eq(
      collatConfig.fees.liquidatorDiscount,
    ) ||
    !(await core.liquidationArcFee()).eq(collatConfig.fees.liquidationArcFee) ||
    !(await core.poolInterestFee()).eq(collatConfig.fees.poolInterestFee) ||
    !(await core.borrowFee()).eq(collatConfig.fees.borrowFee)
  ) {
    return true;
  }

  return false;
}

async function shouldSetLimits(
  core: SapphireCoreV1,
  collatConfig: CoreConfig,
): Promise<boolean> {
  if (
    !(await core.vaultBorrowMinimum()).eq(
      collatConfig.limits.vaultBorrowMin || 0,
    ) ||
    !(await core.vaultBorrowMaximum()).eq(collatConfig.limits.vaultBorrowMax) ||
    !(await core.defaultBorrowLimit()).eq(
      collatConfig.limits.defaultBorrowLimit || 0,
    )
  ) {
    return true;
  }

  return false;
}
