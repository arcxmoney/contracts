import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import {
  ArcProxyFactory,
  JointCampaign,
  JointCampaignFactory,
  TestToken,
  TestTokenFactory,
} from '@src/typings';
import hre from 'hardhat';
import ArcNumber from '@src/utils/ArcNumber';
import { ethers } from 'hardhat';
import { deployTestToken } from '../deployers';
import ArcDecimal from '@src/utils/ArcDecimal';
import { BigNumber } from 'ethers';
import chai from 'chai';
import { BASE } from '@src/constants';
import { expectRevert } from '@test/helpers/expectRevert';
import { EVM } from '@test/helpers/EVM';
import { solidity } from 'ethereum-waffle';
import { fail } from 'assert';

chai.use(solidity);
const expect = chai.expect;

let jointCampaignOwner: JointCampaign;
let jointCampaignLido
let jointCampaignUser1: JointCampaign;
let jointCampaignUser2: JointCampaign;

const REWARD_AMOUNT = ArcNumber.new(100);
const STAKE_AMOUNT = ArcNumber.new(10);
const REWARD_DURATION = 10;

let stakingToken: TestToken;
let rewardToken: TestToken;
let lidoToken: TestToken
let otherErc20: TestToken;

let owner: SignerWithAddress;
let lido: SignerWithAddress
let user1: SignerWithAddress;
let user2: SignerWithAddress;

let evm: EVM;

describe('JointCampaign', () => {
  const DAO_ALLOCATION = ArcDecimal.new(0.4);
  const USER_ALLOCATION = ArcNumber.new(1).sub(DAO_ALLOCATION.value);

  async function increaseTime(duration: number) {
    await evm.increaseTime(duration);
    await evm.mineBlock();
  }

  async function stake(contract: JointCampaign, user: SignerWithAddress, amount: BigNumber) {
    await mintAndApprove(stakingToken, user, amount);

    const timestampAtStake = await getCurrentTimestamp();
    await contract.stake(amount);

    return timestampAtStake;
  }

  async function mintAndApprove(
    token: TestToken,
    tokenReceiver: SignerWithAddress,
    amount: BigNumber,
  ) {
    const tokenContract = TestTokenFactory.connect(token.address, tokenReceiver);
    await tokenContract.mintShare(tokenReceiver.address, amount);
    await tokenContract.approve(jointCampaignOwner.address, amount);
  }

  async function getCurrentTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();
    const currentBlock = await ethers.provider.getBlock(currentBlockNumber);

    return BigNumber.from(currentBlock.timestamp);
  }

  async function setup() {
    if (!jointCampaignOwner || !owner) {
      throw 'Liquidity campaign or owner cannot be null';
    }

    await jointCampaignOwner.setRewardsDistributor(owner.address);

    await jointCampaignOwner.setRewardsDuration(REWARD_DURATION);

    await jointCampaignOwner.init(
      owner.address,
      owner.address,
      rewardToken.address,
      stakingToken.address,
      DAO_ALLOCATION,
    );

    await jointCampaignOwner.notifyRewardAmount(REWARD_AMOUNT);
  }

  before(async () => {
    const signers = await ethers.getSigners();
    evm = new EVM(hre.ethers.provider);
    owner = signers[0];
    user1 = signers[1];
    user2 = signers[2];
  });

  beforeEach(async () => {
    stakingToken = await deployTestToken(owner, '3Pool', 'CRV');
    rewardToken = await deployTestToken(owner, 'Arc Token', 'ARC');
    otherErc20 = await deployTestToken(owner, 'Another ERC20 token', 'AERC20');

    jointCampaignOwner = await new JointCampaignFactory(owner).deploy();

    const proxy = await new ArcProxyFactory(owner).deploy(
      jointCampaignOwner.address,
      await owner.getAddress(),
      [],
    );

    jointCampaignOwner = await new JointCampaignFactory(owner).attach(proxy.address);
    jointCampaignUser1 = await new JointCampaignFactory(user1).attach(proxy.address);
    jointCampaignUser2 = await new JointCampaignFactory(user2).attach(proxy.address);

    await rewardToken.mintShare(jointCampaignOwner.address, REWARD_AMOUNT);
  });

  describe('View functions', () => {
    describe('#lastTimeRewardApplicable', () => {
      beforeEach(async () => {
        await setup();
      });

      it('should return the block timestamp if called before the reward period finished', async () => {
        const currentTime = await getCurrentTimestamp();

        expect(await jointCampaignOwner.lastTimeRewardApplicable()).to.eq(currentTime);
      });

      it('should return the period finish if called after reward period has finished', async () => {
        await increaseTime(REWARD_DURATION);

        const periodFinish = await jointCampaignOwner.periodFinish();
        expect(await jointCampaignOwner.lastTimeRewardApplicable()).to.eq(periodFinish);
      });
    });

    describe('#balanceOfStaker', () => {
      beforeEach(async () => {
        await setup();
      });

      it('should return the correct balance', async () => {
        const stakingAmount = ArcNumber.new(10);

        await stakingToken.mintShare(owner.address, stakingAmount);
        await stakingToken.approve(jointCampaignOwner.address, stakingAmount);

        await jointCampaignOwner.stake(stakingAmount);

        expect(await jointCampaignOwner.balanceOfStaker(owner.address)).to.eq(stakingAmount);
      });
    });

    describe('#rewardPerToken', () => {
      beforeEach(async () => {
        await setup();
      });

      it('should return the reward per token stored if the supply is 0', async () => {
        const rewardPerTokenStored = await jointCampaignOwner.rewardPerTokenStored();

        expect(await jointCampaignOwner.rewardPerToken()).to.eq(rewardPerTokenStored);
      });

      it('should return a valid reward per token after someone staked', async () => {
        const stakingAmount = ArcNumber.new(10);
        await mintAndApprove(stakingToken, user1, stakingAmount);

        await jointCampaignUser1.stake(stakingAmount.div(2));
        await jointCampaignUser1.stake(stakingAmount.div(2));

        await evm.mineBlock();

        const rewardPerToken = await jointCampaignUser1.rewardPerToken();
        const rewardPerTokenStored = await jointCampaignOwner.rewardPerTokenStored();

        // const currentRewardRate = (await jointCampaignUser1.lastTimeRewardApplicable())
        //   .sub(await jointCampaignUser1.lastUpdateTime())
        //   .mul(await jointCampaignUser1.rewardRate())
        //   .mul(BASE)
        //   .div(await jointCampaignUser1.totalSupply());

        // console.log({
        //   totalSupply: await(await jointCampaignUser1.totalSupply()).toString(),
        //   rewardPerTokenStored: rewardPerTokenStored.toString(),
        //   rewardPerToken: rewardPerToken.toString(),
        //   daoAllocation: await(await jointCampaignUser1.daoAllocation()).toString(),
        //   userAllocation: await(await jointCampaignUser1.userAllocation()).toString(),
        //   lastUpdateTime: await(await jointCampaignUser1.lastUpdateTime()).toString(),
        //   rewardRate: await(await jointCampaignUser1.rewardRate()).toString(),
        //   currentRewardRate: currentRewardRate.toString(),
        //   lastTimeRewardApplicable: await(
        //     await jointCampaignUser1.lastTimeRewardApplicable(),
        //   ).toString(),
        // });

        expect(rewardPerToken).to.be.gt(BigNumber.from(0));
        expect(rewardPerToken).to.not.eq(rewardPerTokenStored);
      });

      xit('should return correct reward per token with two tokens staked')
    });

    // TODO unsure if dao allocation is still a thing
    describe('#userAllocation', () => {
      beforeEach(async () => {
        await setup();
      });

      it('should return the correct user allocation', async () => {
        const userAllocation = await jointCampaignUser1.userAllocation();

        expect(userAllocation.value).to.eq(BASE.sub(DAO_ALLOCATION.value));
      });
    });

    describe('#arcxEarned', () => {
      beforeEach(async () => {
        await setup();
      });

      it('should return the correct amount of arcx earned over time', async () => {
        await stake(jointCampaignUser1, user1, ArcNumber.new(10));
        // Check amount earned (should be 0)
        const amountEarned0 = await jointCampaignUser1.earned(user1.address);
        expect(amountEarned0).to.eq(BigNumber.from(0));

        // Advance time
        await increaseTime(60);
        // Check amount earned
        const amountEarned1 = await jointCampaignUser1.earned(user1.address);

        expect(amountEarned1).to.be.gt(amountEarned0);
      });

      it('should return the correct amount of arcx earned over time while another user stakes in between', async () => {
        // User A stakes
        await stake(jointCampaignUser1, user1, STAKE_AMOUNT);

        // User B stakes
        await stake(jointCampaignUser2, user2, STAKE_AMOUNT); // adds 3 epochs

        await increaseTime(1);

        // Check amount earned
        const user1Earned = await jointCampaignUser1.earned(user1.address);
        const user2Earned = await jointCampaignUser2.earned(user2.address);

        expect(user1Earned).to.eq(ArcNumber.new(21));
        expect(user2Earned).to.eq(ArcNumber.new(3));
      });
    });

    describe('#stETHEarned', () => {
      beforeEach(async () => {
        await setup();
      });

      it('should return the correct amount of stETH earned over time', async () => {
        await stake(jointCampaignUser1, user1, ArcNumber.new(10));
        // Check amount earned (should be 0)
        const amountEarned0 = await jointCampaignUser1.earned(user1.address);
        expect(amountEarned0).to.eq(BigNumber.from(0));

        // Advance time
        await increaseTime(60);
        // Check amount earned
        const amountEarned1 = await jointCampaignUser1.earned(user1.address);

        expect(amountEarned1).to.be.gt(amountEarned0);
      });

      it('should return the correct amount of stETH earned over time while another user stakes in between', async () => {
        // User A stakes
        await stake(jointCampaignUser1, user1, STAKE_AMOUNT);

        // User B stakes
        await stake(jointCampaignUser2, user2, STAKE_AMOUNT); // adds 3 epochs

        await increaseTime(1);

        // Check amount earned
        const user1Earned = await jointCampaignUser1.earned(user1.address);
        const user2Earned = await jointCampaignUser2.earned(user2.address);

        expect(user1Earned).to.eq(ArcNumber.new(21));
        expect(user2Earned).to.eq(ArcNumber.new(3));
      });
    });

    describe('#getRewardForDuration', () => {
      beforeEach(async () => {
        await setup();
      });

      it('returns the correct reward for duration', async () => {
        const rewardForDuration = await jointCampaignOwner.getRewardForDuration();

        expect(Math.round(parseFloat(ethers.utils.formatEther(rewardForDuration)))).to.eq(
          parseFloat(ethers.utils.formatEther(REWARD_AMOUNT)),
        );
      });
    });

    describe('#isMinter', () => {
      xit('should revert if the state contract is not registered')
      xit('should return false if user did not mint debt to the position')
      xit('should return fasle if user minted a smaller amount than the given _amount')
      xit('should return true if user minted an equal or greater amount of debt for the given position')
    })
  });

  describe('Mutative functions', () => {
    describe('#stake', () => {
      beforeEach(async () => {
        await setup();
      });

      xit('should not be able to stake the full amount with less debt')
      xit('should not be able to set a lower debt requirement by staking less before the deadline')
      xit('should not be able to stake to a different position ID')
      
      it('should not be able to stake more than balance', async () => {
        await mintAndApprove(stakingToken, user1, ArcNumber.new(10));

        const balance = await stakingToken.balanceOf(user1.address);

        await expectRevert(jointCampaignUser1.stake(balance.add(1)));
      });

      it('should be able to stake', async () => {
        const amount = ArcNumber.new(10);
        await mintAndApprove(stakingToken, user1, amount.mul(2));

        await jointCampaignUser1.stake(amount);

        let supply = await jointCampaignUser1.totalSupply();

        expect(supply).to.eq(amount);

        await jointCampaignUser1.stake(amount);

        supply = await jointCampaignUser1.totalSupply();

        expect(supply).to.eq(amount.mul(2));
        expect(await stakingToken.balanceOf(jointCampaignOwner.address)).to.eq(amount.mul(2))
      });

      it('should update reward correctly after staking', async () => {
        await stake(jointCampaignUser1, user1, STAKE_AMOUNT);

        await increaseTime(1);

        let earned = await jointCampaignUser1.earned(user1.address);

        expect(earned).to.eq(ArcNumber.new(6));

        await increaseTime(1);

        earned = await jointCampaignUser1.earned(user1.address);

        expect(earned).to.eq(ArcNumber.new(12));
      });
    });

    describe('#getReward', () => {
      beforeEach(async () => {
        await setup();
      });

      it('should not be able to get the reward if the tokens are not claimable', async () => {
        await stake(jointCampaignUser1, user1, STAKE_AMOUNT);

        await increaseTime(REWARD_DURATION / 2);

        await expectRevert(jointCampaignUser1.getReward(user1.address));
      });

      it('should be able to claim rewards gradually over time', async () => {
        await jointCampaignOwner.setTokensClaimable(true);

        await stake(jointCampaignUser1, user1, STAKE_AMOUNT);
        await increaseTime(1);

        const currentBalance = await rewardToken.balanceOf(user1.address);

        await expect(() => jointCampaignUser1.getReward(user1.address)).to.changeTokenBalance(
          rewardToken,
          user1,
          currentBalance.add(ArcNumber.new(12)),
        );

        await increaseTime(1);

        await expect(() => jointCampaignUser1.getReward(user1.address)).to.changeTokenBalance(
          rewardToken,
          user1,
          currentBalance.add(ArcNumber.new(12)),
        );
      });

      it('should be able to claim the right amount of rewards given the number of participants', async () => {
        await jointCampaignOwner.setTokensClaimable(true);
        const initialBalance = await rewardToken.balanceOf(user1.address);

        await stake(jointCampaignUser1, user1, STAKE_AMOUNT);

        await expect(() => jointCampaignUser1.getReward(user1.address)).to.changeTokenBalance(
          rewardToken,
          user1,
          initialBalance.add(ArcNumber.new(6)),
        );

        const user2Balance = await rewardToken.balanceOf(user2.address);

        await stake(jointCampaignUser2, user2, STAKE_AMOUNT); // increases 3 epochs

        await expect(() => jointCampaignUser1.getReward(user1.address)).to.changeTokenBalance(
          rewardToken,
          user1,
          initialBalance.add(ArcNumber.new(21)), // 6 + 6+ 6 + (6/2)
        );

        await expect(() => jointCampaignUser2.getReward(user2.address)).to.changeTokenBalance(
          rewardToken,
          user2,
          user2Balance.add(ArcNumber.new(6)), // 3 + 3
        );
      });

      // it.only('should update reward after claiming reward', async () => {
      //   await jointCampaignOwner.setTokensClaimable(true);

      //   await stake(jointCampaignUser1, user1, STAKE_AMOUNT);

      //   const rewardPerTokenStored0 = await jointCampaignUser1.rewardPerTokenStored();

      //   console.log('reward per token stored 0', rewardPerTokenStored0.toString());

      //   await increaseTime(1);

      //   await jointCampaignUser1.getReward(user1.address);

      //   console.log(
      //     'reward per token stored 1',
      //     (await jointCampaignUser1.rewardPerTokenStored()).toString(),
      //   );
      //   const rewardPerTokenStored1 = await jointCampaignUser1.rewardPerTokenStored();

      //   console.log(rewardPerTokenStored0.toString(), rewardPerTokenStored1.toString());

      //   await jointCampaignUser1.getReward(user1.address);

      //   expect(rewardPerTokenStored0).to.be.lt(rewardPerTokenStored1);
      // });
    });

    describe('#withdraw', () => {
      beforeEach(async () => {
        await setup();
      });

      it('should not be able to withdraw more than the balance', async () => {
        await stake(jointCampaignUser1, user1, STAKE_AMOUNT);

        await expectRevert(jointCampaignUser1.withdraw(STAKE_AMOUNT.add(1)));
      });

      it('should withdraw the correct amount', async () => {
        await stake(jointCampaignUser1, user1, STAKE_AMOUNT);

        await jointCampaignUser1.withdraw(STAKE_AMOUNT);

        const balance = await stakingToken.balanceOf(user1.address);

        expect(balance).to.eq(STAKE_AMOUNT);
      });

      // it('should update reward correctly after withdrawing', async () => {
      //   await stake(jointCampaignUser1, user1, STAKE_AMOUNT);

      //   const rewardPerTokenStored0 = await jointCampaignUser1.rewardPerTokenStored();

      //   await jointCampaignUser1.withdraw(STAKE_AMOUNT);

      //   const rewardPerTokenStored1 = await jointCampaignUser1.rewardPerTokenStored();

      //   expect(rewardPerTokenStored0).to.not.eq(rewardPerTokenStored1);
      // });
    });

    describe('#exit', () => {
      beforeEach(async () => {
        await setup();
      });

      it('should be able to exit and get the right amount of staked tokens and rewards', async () => {
        await jointCampaignOwner.setTokensClaimable(true);

        await stake(jointCampaignUser1, user1, STAKE_AMOUNT);

        await jointCampaignUser1.exit();

        const stakingBalance = await stakingToken.balanceOf(user1.address);
        const rewardBalance = await rewardToken.balanceOf(user1.address);

        expect(stakingBalance).to.eq(STAKE_AMOUNT);
        expect(rewardBalance).to.eq(ArcNumber.new(6));
      });
    });

    describe('#slash', () => {
      xit('should not be able to slash if user has the amount of their debt snapshot')
      xit('should not be able to slash past the vesting end date')
      xit('should not be able to slash if the tokens are unstaked but debt is there')
      xit('should be able to slash if the user does not have enough debt', async () => {
        // check for both rewards
      })
    })
  });

  describe('Restricted functions', () => {
    describe('#init', () => {
      it('should not be callable by anyone', async () => {
        await expectRevert(
          jointCampaignUser1.init(
            user1.address,
            user1.address,
            rewardToken.address,
            stakingToken.address,
            DAO_ALLOCATION,
          ),
        );
      });

      it('should only be callable by the contract owner', async () => {
        await jointCampaignOwner.init(
          owner.address,
          owner.address,
          rewardToken.address,
          stakingToken.address,
          DAO_ALLOCATION,
        );

        const arcDao = await jointCampaignOwner.arcDAO();
        const rewardsDistributor = await jointCampaignOwner.rewardsDistributor();
        const rewardsToken = await jointCampaignOwner.rewardsToken();
        const stakingTokenAddress = await jointCampaignOwner.stakingToken();
        const daoAllocation = await jointCampaignOwner.daoAllocation();

        expect(arcDao).to.eq(owner.address);
        expect(rewardsDistributor).to.eq(owner.address);
        expect(rewardsToken).to.eq(rewardToken.address);
        expect(stakingTokenAddress).to.eq(stakingToken.address);
        expect(daoAllocation).to.eq(DAO_ALLOCATION.value);
      });
    });

    describe('#notifyRewardAmount', () => {
      it('should not be callable by anyone', async () => {
        await expectRevert(jointCampaignUser1.notifyRewardAmount(REWARD_AMOUNT));
      });

      xit('should be callable by the owner')
      
      it('should be callable by the rewards distributor', async () => {
        await jointCampaignOwner.init(
          owner.address,
          owner.address,
          rewardToken.address,
          stakingToken.address,
          DAO_ALLOCATION,
        );

        await jointCampaignOwner.setRewardsDuration(REWARD_DURATION);

        await jointCampaignOwner.notifyRewardAmount(REWARD_AMOUNT);

        const rewardrate = await jointCampaignOwner.rewardRate();

        expect(rewardrate).to.be.eq(ArcNumber.new(10));
      });

      xit('should revert if contract does not own any ARCx')
      xit('should revert if the amount of ARCx is smaller than the reward set')

      it('should update rewards correctly after a new reward update', async () => {
        await jointCampaignOwner.init(
          owner.address,
          owner.address,
          rewardToken.address,
          stakingToken.address,
          DAO_ALLOCATION,
        );

        await jointCampaignOwner.setRewardsDuration(REWARD_DURATION);

        await jointCampaignOwner.notifyRewardAmount(REWARD_AMOUNT.div(2));
        const rewardRate0 = await jointCampaignOwner.rewardRate();

        expect(rewardRate0).to.eq(ArcNumber.new(5));

        await jointCampaignOwner.notifyRewardAmount(REWARD_AMOUNT.div(2));

        const rewardrate1 = await jointCampaignOwner.rewardRate();

        expect(rewardrate1).to.eq(ArcDecimal.new(9.5).value);
      });
    });

    describe('#setRewardsDistributor', () => {
      it('should not be callable by non-owner', async () => {
        await expectRevert(jointCampaignUser1.setRewardsDistributor(user1.address));
      });

      it('should set rewards distributor if called by owner', async () => {
        await jointCampaignOwner.setRewardsDistributor(user2.address, true);

        expect(await jointCampaignOwner.rewardsDistributor()).to.eq(user2.address);
      });
    });

    describe('#setRewardsDuration', () => {
      it('should not be claimable by anyone', async () => {
        await expectRevert(
          jointCampaignUser1.setRewardsDuration(BigNumber.from(REWARD_DURATION)),
        );
      });

      it('should only be callable by the contract owner and set the right duration', async () => {
        const duration = BigNumber.from(REWARD_DURATION);

        await jointCampaignOwner.setRewardsDuration(duration);

        expect(await jointCampaignOwner.rewardsDuration()).to.eq(duration);
      });
    });

    describe('#recoverERC20', () => {
      const erc20Share = ArcNumber.new(10);

      beforeEach(async () => {
        await otherErc20.mintShare(jointCampaignOwner.address, erc20Share);
      });

      it('should not be callable by anyone', async () => {
        await expectRevert(jointCampaignUser1.recoverERC20(otherErc20.address, erc20Share));
      });

      it('should not recover staking or stEth', async () => {
        await setup();
        await stakingToken.mintShare(jointCampaignOwner.address, erc20Share);
        await rewardToken.mintShare(jointCampaignOwner.address, erc20Share);
        
        await expectRevert(jointCampaignOwner.recoverERC20(stakingToken.address, erc20Share));
        await expectRevert(jointCampaignOwner.recoverERC20(rewardToken.address, erc20Share));
        // todo add second reward token
        fail()
      });

      xit('should revert if owner tries to recover a greater amount of ARC than the reward amount')

      it('should let owner recover the erc20 on this contract', async () => {
        const balance0 = await otherErc20.balanceOf(owner.address);

        await jointCampaignOwner.recoverERC20(otherErc20.address, erc20Share);

        const balance1 = await otherErc20.balanceOf(owner.address);

        expect(balance1).to.eq(balance0.add(erc20Share));
      });

      xit('should let owner recover the surplus of ARC on the contract')
    });

    describe('#setTokensClaimable', () => {
      it('should not be claimable by anyone', async () => {
        await expectRevert(jointCampaignUser1.setTokensClaimable(true));
      });

      it('should only be callable by the contract owner', async () => {
        await jointCampaignOwner.setTokensClaimable(true);

        expect(await jointCampaignOwner.tokensClaimable()).to.be.eq(true);
      });
    });

    describe('#setApprovedStateContract', () => {
    beforeEach(setup);

    xit('should not be able to set a state contract as an unauthorized user', async () => {
    });

    xit('should revert if it is the same one', async () => {
    });

    xit('should be able to set a valid state contract as the owner', async () => {
    });

    xit('should set a new appoved state contract', async () => {
    });
  });
  });
});
