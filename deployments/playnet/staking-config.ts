import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import {
  JointCampaign,
  JointCampaignFactory,
  LiquidityCampaign,
  LiquidityCampaignFactory,
  LiquidityCampaignV2,
  LiquidityCampaignV2Factory,
} from '@src/typings';
import ArcDecimal from '@src/utils/ArcDecimal';

export default {
  'Pool-6': {
    source: 'LiquidityCampaign',
    stakingToken: '0x6c0ffb49AD9072F253e254445CFD829BCb8A1b5d',
    rewardsToken: 'ArcxToken',
    rewardsDurationSeconds: 60 * 60 * 24 * 31, // 31 days
    contractFactory: LiquidityCampaignFactory,
    getDeployTx: (signer: SignerWithAddress) =>
      new LiquidityCampaignFactory(signer).getDeployTransaction(),
    runInit: (
      contract: LiquidityCampaign,
      arcDao: string,
      rewardsDistributor: string,
      rewardsTokenAddress: string,
      stakingTokenAddress: string,
    ) => {
      const daoAllocation = '400000000000000000';

      return contract.init(arcDao, rewardsDistributor, rewardsTokenAddress, stakingTokenAddress, {
        value: daoAllocation,
      });
    },
  },
  'Pool-6.1': {
    source: 'LiquidityCampaign',
    stakingToken: '0x6c0ffb49AD9072F253e254445CFD829BCb8A1b5d',
    rewardsToken: 'ArcxToken',
    rewardsDurationSeconds: 60 * 60 * 24 * 31, // 31 days
    contractFactory: LiquidityCampaignFactory,
    getDeployTx: (signer: SignerWithAddress) =>
      new LiquidityCampaignFactory(signer).getDeployTransaction(),
    runInit: (
      contract: LiquidityCampaign,
      arcDao: string,
      rewardsDistributor: string,
      rewardsTokenAddress: string,
      stakingTokenAddress: string,
    ) => {
      const daoAllocation = '400000000000000000';

      return contract.init(arcDao, rewardsDistributor, rewardsTokenAddress, stakingTokenAddress, {
        value: daoAllocation,
      });
    },
  },
  'Pool-7': {
    source: 'JointCampaign',
    stakingToken: '0x6c0ffb49AD9072F253e254445CFD829BCb8A1b5d',
    rewardsToken: 'ArcxToken',
    rewardsDurationSeconds: 60 * 60 * 24 * 31, // 31 days
    contractFactory: JointCampaignFactory,
    getDeployTx: (signer: SignerWithAddress) =>
      new JointCampaignFactory(signer).getDeployTransaction(),
    runInit(
      contract: JointCampaign,
      arcDao: string,
      arcRewardsDistributor: string,
      arcTokenAddress: string,
    ) {
      const lidoRewardsDistributor = '';
      const lidoTokenAddress = '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32';
      const daoAllocation = ArcDecimal.new(0.4);
      const slashersCut = ArcDecimal.new(0.3);
      const stakeToDebtRatio = 2;
      const arcStateContract = '';

      return contract.init(
        arcDao,
        arcRewardsDistributor,
        lidoRewardsDistributor,
        arcTokenAddress,
        lidoTokenAddress,
        this.stakingToken,
        daoAllocation,
        slashersCut,
        stakeToDebtRatio,
        arcStateContract,
      );
    },
  },
  'Pool-8': {
    source: 'LiquidityCampaignV2',
    stakingToken: 'todo: add fake arcx token v2',
    rewardsToken: 'ArcxTokenV2',
    rewardsDurationSeconds: 60 * 60 * 24 * 31, // 31 days
    contractFactory: LiquidityCampaignV2Factory,
    getDeployTx: (signer: SignerWithAddress) =>
      new LiquidityCampaignV2Factory(signer).getDeployTransaction(),
    runInit: (
      contract: LiquidityCampaignV2,
      arcDao: string,
      rewardsDistributor: string,
      rewardsTokenAddress: string,
      stakingTokenAddress: string,
    ) => {
      const daoAllocation = '400000000000000000';

      return contract.init(arcDao, rewardsDistributor, rewardsTokenAddress, stakingTokenAddress, {
        value: daoAllocation,
      });
    },
  },
};
