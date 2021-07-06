import {
  ArcProxyFactory,
  JointPassportCampaignFactory,
  RewardCampaignFactory,
  TestTokenFactory,
} from '@src/typings';
import { green, red, yellow } from 'chalk';

import {
  deployContract,
  DeploymentType,
  loadContract,
  loadDetails,
  loadStakingConfig,
  pruneDeployments,
} from '../deployments/src';
import { task } from 'hardhat/config';
import getUltimateOwner from './task-utils/getUltimateOwner';

task('deploy-staking', 'Deploy a staking/reward pool')
  .addParam('name', 'The name of the pool you would like to deploy')
  .setAction(async (taskArgs, hre) => {
    const name = taskArgs.name;

    const {
      network,
      signer,
      networkConfig,
      networkDetails,
    } = await loadDetails(taskArgs, hre);

    const ultimateOwner = getUltimateOwner(signer, networkDetails);

    const stakingConfig = await loadStakingConfig({ network, key: name });

    if (!stakingConfig.rewardsDurationSeconds) {
      throw Error(
        '"rewardsDurationSeconds" is not set in the staking-config.json file',
      );
    }

    await pruneDeployments(network, signer.provider);

    const arcDAO = await loadContract({
      name: 'ArcDAO',
      type: DeploymentType.global,
      network,
    });

    const rewardToken = await loadContract({
      name: stakingConfig.rewardsToken,
      type: DeploymentType.global,
      network,
    });

    if (!arcDAO || !rewardToken) {
      throw red(
        `There is no ArcDAO, RewardToken or Core Contract in this deployments file`,
      );
    }

    const stakingTokenAddress =
      stakingConfig.stakingToken ||
      (await deployContract(
        {
          name: 'TestStakingToken',
          source: 'TestToken',
          data: new TestTokenFactory(signer).getDeployTransaction(
            `${name}-TestToken`,
            name,
            18,
          ),
          version: 1,
          type: DeploymentType.staking,
          group: name,
        },
        networkConfig,
      ));

    if (!stakingTokenAddress) {
      throw red(`There was no valid staking token address that could be used`);
    }

    const implementationContract = await deployContract(
      {
        name: 'Implementation',
        source: stakingConfig.source,
        data: stakingConfig.getDeployTx(signer),
        version: 1,
        type: DeploymentType.staking,
        group: name,
      },
      networkConfig,
    );

    const proxyContract = await deployContract(
      {
        name: 'Proxy',
        source: 'ArcProxy',
        data: new ArcProxyFactory(signer).getDeployTransaction(
          implementationContract,
          await signer.getAddress(),
          [],
        ),
        version: 1,
        type: DeploymentType.staking,
        group: name,
      },
      networkConfig,
    );

    const implementation = RewardCampaignFactory.connect(proxyContract, signer);

    console.log(yellow(`* Calling init()...`));
    try {
      await stakingConfig.runInit(
        implementation,
        arcDAO.address,
        ultimateOwner,
        rewardToken.address,
        stakingTokenAddress,
      );
      console.log(green(`Called init() successfully!\n`));
    } catch (error) {
      console.log(red(`Failed to call init().\nReason: ${error}\n`));
    }

    // Add approved state contracts
    const stateProxies = [];
    try {
      for (const rewardGroup of stakingConfig.coreContracts) {
        const contract = await loadContract({
          name: 'CoreProxy',
          type: DeploymentType.synth,
          network,
          group: rewardGroup,
        });
        stateProxies.push(contract.address);
      }

      console.log(yellow('Approving state contracts...'));
      await implementation.setApprovedStateContracts(stateProxies);
      console.log(green('State contracts approved successfully!'));
    } catch (error) {
      console.log(
        red(`Failed to set approved state contracts. Reason: ${error}\n`),
      );
    }

    try {
      console.log(yellow('Setting rewards duration...'));
      await implementation.setRewardsDuration(
        stakingConfig.rewardsDurationSeconds,
      );
      console.log(green('Rewards duration successfully set'));
    } catch (error) {
      console.log(
        red(`Failed to set the rewards duration. Reason: ${error}\n`),
      );
    }
  });

task('deploy-staking-liquidity', 'Deploy a LiquidityCampaign')
  .addParam('name', 'The name of the pool you would like to deploy')
  .setAction(async (taskArgs, hre) => {
    const name = taskArgs.name;

    const {
      network,
      signer,
      networkConfig,
      networkDetails,
    } = await loadDetails(taskArgs, hre);

    const ultimateOwner = getUltimateOwner(signer, networkDetails);

    const stakingConfig = await loadStakingConfig({ network, key: name });

    if (!stakingConfig.rewardsDurationSeconds) {
      throw red(
        `"rewardsDurationSeconds" is not set in the staking-config.ts file`,
      );
    }

    await pruneDeployments(network, signer.provider);

    const arcDAO = await loadContract({
      name: 'ArcDAO',
      type: DeploymentType.global,
      version: 2,
      network,
    });

    const rewardToken = await loadContract({
      source: stakingConfig.rewardsToken,
      type: DeploymentType.global,
      network,
    });

    if (!arcDAO || !rewardToken) {
      throw red(
        `There is no ArcDAO, RewardToken or Core Contract in this deployments file`,
      );
    }

    const stakingTokenAddress =
      stakingConfig.stakingToken ||
      (await deployContract(
        {
          name: 'TestStakingToken',
          source: 'TestToken',
          data: new TestTokenFactory(signer).getDeployTransaction(
            `${name}-TestToken`,
            name,
            18,
          ),
          version: 1,
          type: DeploymentType.staking,
          group: name,
        },
        networkConfig,
      ));

    const implementationContractAddress = await deployContract(
      {
        name: 'Implementation',
        source: stakingConfig.source,
        data: stakingConfig.getDeployTx(signer),
        version: 1,
        type: DeploymentType.staking,
        group: name,
      },
      networkConfig,
    );

    const proxyContract = await deployContract(
      {
        name: 'Proxy',
        source: 'ArcProxy',
        data: new ArcProxyFactory(signer).getDeployTransaction(
          implementationContractAddress,
          await signer.getAddress(),
          [],
        ),
        version: 1,
        type: DeploymentType.staking,
        group: name,
      },
      networkConfig,
    );

    if (!stakingConfig.contractFactory) {
      throw red(`"contractFactory" missing from in the staking-config.ts file`);
    }

    const implementation = stakingConfig.contractFactory.connect(
      proxyContract,
      signer,
    );

    console.log(yellow(`* Calling init()...`));
    try {
      await stakingConfig.runInit(
        implementation,
        arcDAO.address,
        ultimateOwner,
        rewardToken.address,
        stakingTokenAddress,
      );
      console.log(green(`Called init() successfully!\n`));
    } catch (error) {
      console.log(red(`Failed to call init().\nReason: ${error}\n`));
    }

    try {
      console.log(yellow('Setting rewards duration...'));
      await implementation.setRewardsDuration(
        stakingConfig.rewardsDurationSeconds,
      );
      console.log(green('Rewards duration successfully set'));
    } catch (error) {
      console.log(
        red(`Failed to set the rewards duration. Reason: ${error}\n`),
      );
    }

    console.log(yellow(`Verifying contract...`));
    await hre.run('verify:verify', {
      address: implementationContractAddress,
      constructorArguments: [],
    });
    console.log(green(`Contract verified successfully!`));
  });

task('deploy-staking-joint', 'Deploy a JointCampaign')
  .addParam('name', 'The name of the pool you would like to deploy')
  .setAction(async (taskArgs, hre) => {
    const name = taskArgs.name;

    const {
      network,
      signer,
      networkConfig,
      networkDetails,
    } = await loadDetails(taskArgs, hre);

    const ultimateOwner = getUltimateOwner(signer, networkDetails);

    const stakingConfig = await loadStakingConfig({ network, key: name });

    if (!stakingConfig.rewardsDurationSeconds) {
      throw red(
        `"rewardsDurationSeconds" is not set in the staking-config.ts file`,
      );
    }

    await pruneDeployments(network, signer.provider);

    const arcDAO = await loadContract({
      name: 'ArcDAO',
      type: DeploymentType.global,
      network,
    });

    const rewardToken = await loadContract({
      name: stakingConfig.rewardsToken,
      type: DeploymentType.global,
      network,
    });

    if (!arcDAO || !rewardToken) {
      throw red(`There is no ArcDAO or RewardToken in this deployments file`);
    }

    if (!stakingConfig.contractFactory) {
      throw red(`"contractFactory" missing from in the staking-config.ts file`);
    }

    const stakingTokenAddress =
      stakingConfig.stakingToken ||
      (await deployContract(
        {
          name: 'TestStakingToken',
          source: 'TestToken',
          data: new TestTokenFactory(signer).getDeployTransaction(
            `${name}-TestToken`,
            name,
            18,
          ),
          version: 1,
          type: DeploymentType.staking,
          group: name,
        },
        networkConfig,
      ));

    // Joint campaign doesn't use a proxy
    const jointCampaignAddress = await deployContract(
      {
        name: 'JointCampaign',
        source: stakingConfig.source,
        data: stakingConfig.getDeployTx(signer),
        type: DeploymentType.staking,
        group: name,
        version: 1,
      },
      networkConfig,
    );

    const jointCampaignContract = stakingConfig.contractFactory.connect(
      jointCampaignAddress,
      signer,
    );

    try {
      console.log(yellow(`* Calling init()...`));
      await stakingConfig.runInit(
        jointCampaignContract,
        arcDAO.address,
        ultimateOwner,
        rewardToken.address,
      );
      console.log(green(`Called init() successfully!\n`));
    } catch (error) {
      console.log(red(`Failed to call init().\nREason: ${error}\n`));
    }

    try {
      console.log(yellow(`Setting rewards duration...`));
      await jointCampaignContract.setRewardsDuration(
        stakingConfig.rewardsDurationSeconds,
      );
      console.log(green(`Rewards duration successfully set`));
    } catch (error) {
      console.log(
        red(`Failed to set the rewards duration. Reason: ${error}\n`),
      );
    }
  });

task('deploy-staking-joint-passport', 'Deploy a JointPassportCampaign')
  .addParam('name', 'The name of the pool you would like to deploy')
  .setAction(async (taskArgs, hre) => {
    const { name } = taskArgs;

    const {
      network,
      signer,
      networkConfig,
      networkDetails,
    } = await loadDetails(taskArgs, hre);

    await pruneDeployments(network, signer.provider);

    const stakingConfig = await loadStakingConfig({ network, key: name });

    const mandatoryFields = [
      'collabRewardsToken',
      'rewardsDurationSeconds',
      'daoAllocation',
    ];

    for (const field of mandatoryFields) {
      if (!stakingConfig[field]) {
        throw red(`"${field}" is missing from the config file`);
      }
    }

    const {
      arcRewardsDistributor,
      collabRewardsDistributor,
      collabRewardsToken,
      stakingToken,
      daoAllocation,
      maxStakePerUser,
      creditScoreThreshold,
      rewardsDurationSeconds,
    } = stakingConfig;

    const arcDAO = loadContract({
      name: 'ArcDAO',
      type: DeploymentType.global,
      version: 2,
      network,
    });

    const rewardToken = loadContract({
      name: 'ArcxToken',
      type: DeploymentType.global,
      version: 2,
      network,
    });

    const creditScoreDetails = loadContract({
      name: 'SapphireCreditScoreProxy',
      network,
    });

    // Joint campaign doesn't use a proxy
    const jointPassportCampaignAddy = await deployContract(
      {
        name: 'JointPassportCampaign',
        source: stakingConfig.source,
        data: new JointPassportCampaignFactory(signer).getDeployTransaction(
          arcDAO.address,
          arcRewardsDistributor || signer.address,
          collabRewardsDistributor || signer.address,
          rewardToken.address,
          collabRewardsToken,
          stakingToken,
          creditScoreDetails.address,
          daoAllocation,
          maxStakePerUser,
          creditScoreThreshold,
        ),
        type: DeploymentType.staking,
        group: name,
        version: 1,
      },
      networkConfig,
    );
    const jointPassportCampaign = JointPassportCampaignFactory.connect(
      jointPassportCampaignAddy,
      signer,
    );

    console.log(yellow(`Setting rewards duration...`));
    await jointPassportCampaign.setRewardsDuration(rewardsDurationSeconds);
    console.log(green(`Rewards duration was set successfully`));

    if (['mainnet', 'rinkeby'].includes(network)) {
      console.log(yellow(`Verifying contract...`));
      await hre.run('verify:verify', {
        address: jointPassportCampaignAddy,
        constructorArguments: [
          arcDAO.address,
          arcRewardsDistributor || signer.address,
          collabRewardsDistributor || signer.address,
          rewardToken.address,
          collabRewardsToken,
          stakingToken,
          creditScoreDetails.address,
          daoAllocation,
          maxStakePerUser,
          creditScoreThreshold,
        ],
      });
      console.log(green(`Contract verified successfully!`));
    }
  });