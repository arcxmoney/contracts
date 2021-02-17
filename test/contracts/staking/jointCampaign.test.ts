import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { TestToken, TestTokenFactory } from '@src/typings';
import hre from 'hardhat';
import ArcNumber from '@src/utils/ArcNumber';
import { ethers } from 'hardhat';
import { deployTestToken } from '../deployers';
import ArcDecimal from '@src/utils/ArcDecimal';
import { BigNumber, BigNumberish } from 'ethers';
import chai from 'chai';
import { BASE, TEN_PERCENT } from '@src/constants';
import { expectRevert } from '@test/helpers/expectRevert';
import { EVM } from '@test/helpers/EVM';
import { solidity } from 'ethereum-waffle';
import { fail } from 'assert';
import { JointCampaign } from '@src/typings/JointCampaign';
import { JointCampaignFactory } from '@src/typings/JointCampaignFactory';
import { generateContext, ITestContext } from '../context';
import { mozartFixture } from '../fixtures';
import { setupMozart } from '../setup';
import { MozartTestArc } from '@src/MozartTestArc';

chai.use(solidity);
const expect = chai.expect;

let jointCampaignOwner: JointCampaign;
let jointCampaignLido: JointCampaign;
let jointCampaignUser1: JointCampaign;
let jointCampaignUser2: JointCampaign;

let arc: MozartTestArc;

let stakingToken: TestToken;
let arcToken: TestToken;
let stEthToken: TestToken;
let otherErc20: TestToken;

let owner: SignerWithAddress;
let lido: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;

const ARC_REWARD_AMOUNT = ArcNumber.new(100);
const STETH_REWARD_AMOUNT = ArcNumber.new(200);
const STAKE_AMOUNT = ArcNumber.new(10);
const REWARD_DURATION = 10;

const DAO_ALLOCATION = ArcDecimal.new(0.4);
const SLASHER_CUT = ArcDecimal.new(0.3);
const STAKE_TO_DEBT_RATIO = 2;
const USER_ALLOCATION = ArcNumber.new(1).sub(DAO_ALLOCATION.value);

const COLLATERAL_AMOUNT = ArcNumber.new(10);
const BORROW_AMOUNT = ArcNumber.new(5);

let evm: EVM;

describe('JointCampaign', () => {
  async function increaseTime(duration: number) {
    await evm.increaseTime(duration);
    await evm.mineBlock();
  }

  /**
   * Opens a position and stakes the amount
   *
   * @param user staking user
   * @param amount the amount to stake
   * @returns the position ID
   */
  async function stake(user: SignerWithAddress, amount: BigNumber) {
    await mintAndApprove(stakingToken, user, amount);

    const newPosition = await arc.openPosition(COLLATERAL_AMOUNT, BORROW_AMOUNT, user);

    const contract = JointCampaignFactory.connect(jointCampaignOwner.address, user);

    await contract.stake(amount, newPosition.params.id);

    return newPosition.params.id;
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

  /**
   * Only calls init() and sets the reward duration
   */
  async function setupBasic() {
    if (!jointCampaignOwner || !owner) {
      throw 'Liquidity campaign or owner cannot be null';
    }

    await jointCampaignOwner.setRewardsDuration(REWARD_DURATION);

    await jointCampaignOwner.init(
      owner.address,
      owner.address,
      lido.address,
      arcToken.address,
      stEthToken.address,
      stakingToken.address,
      DAO_ALLOCATION,
      SLASHER_CUT,
      STAKE_TO_DEBT_RATIO,
      await arc.coreAddress(),
    );
  }

  /**
   * Also calls JointCampaign.init() and notifies the reward amounts
   */
  async function setup() {
    if (!jointCampaignOwner || !owner) {
      throw 'Liquidity campaign or owner cannot be null';
    }

    await setupBasic();

    await jointCampaignOwner.notifyRewardAmount(ARC_REWARD_AMOUNT, arcToken.address);
    await jointCampaignLido.notifyRewardAmount(STETH_REWARD_AMOUNT, stEthToken.address);
  }

  function fixtureInit(ctx: ITestContext): Promise<void> {
    return setupMozart(ctx, {
      oraclePrice: ArcNumber.new(1),
      collateralRatio: ArcNumber.new(2),
      interestRate: TEN_PERCENT,
    });
  }

  before(async () => {
    const signers = await ethers.getSigners();
    evm = new EVM(hre.ethers.provider);
    owner = signers[0];
    lido = signers[1];
    user1 = signers[2];
    user2 = signers[3];
  });

  beforeEach(async () => {
    stakingToken = await deployTestToken(owner, '3Pool', 'CRV');
    arcToken = await deployTestToken(owner, 'Arc Token', 'ARC');
    stEthToken = await deployTestToken(owner, 'stEthToken', 'stETH');
    otherErc20 = await deployTestToken(owner, 'Another ERC20 token', 'AERC20');

    jointCampaignOwner = await new JointCampaignFactory(owner).deploy();
    jointCampaignLido = JointCampaignFactory.connect(jointCampaignOwner.address, lido);
    jointCampaignUser1 = JointCampaignFactory.connect(jointCampaignOwner.address, user1);
    jointCampaignUser2 = JointCampaignFactory.connect(jointCampaignOwner.address, user2);

    await arcToken.mintShare(jointCampaignOwner.address, ARC_REWARD_AMOUNT);
    await stEthToken.mintShare(jointCampaignOwner.address, STETH_REWARD_AMOUNT);

    const ctx: ITestContext = await generateContext(mozartFixture, fixtureInit);

    arc = ctx.sdks.mozart;
  });

  describe('View functions', () => {
    describe('#totalSupply', () => {
      beforeEach(setup);

      it('should return the correct amount of staking tokens', async () => {
        expect(await jointCampaignOwner.totalSupply()).to.eq(BigNumber.from(0));

        await stake(user1, STAKE_AMOUNT);

        expect(await jointCampaignOwner.totalSupply()).to.eq(STAKE_AMOUNT);

        await stake(user2, STAKE_AMOUNT.mul(2));

        expect(await jointCampaignOwner.totalSupply()).to.eq(STAKE_AMOUNT.mul(3));
      });
    });

    describe('#balanceOfStaker', () => {
      beforeEach(setup);

      it('should return 0 if user did not stake', async () => {
        expect(await jointCampaignOwner.balanceOfStaker(user1.address)).to.eq(BigNumber.from(0));
      });

      it('should return the correct balance after staking', async () => {
        await stake(user1, STAKE_AMOUNT);

        expect(await jointCampaignOwner.balanceOfStaker(user1.address)).to.eq(STAKE_AMOUNT);
      });
    });

    describe('#lastTimeRewardApplicable', () => {
      beforeEach(setup);

      xit(
        'arc: should return the block timestamp if called after the stEth reward period but before the arc reward period',
      );
      xit(
        'stEth: should return the block timestamp if called after the arc reward period but before the stEth reward period',
      );

      xit(
        'arc: should return the arc reward period if called after the arc reward period but before the stEth reward period',
      );
      xit(
        'stEth: should return the stEth reward period if called after the stEth reward period but before the arc reward period',
      );
    });

    describe('#arcRewardPerTokenUser', () => {
      beforeEach(setup);

      it('should return 0 if the supply is 0', async () => {
        expect(await jointCampaignOwner.arcRewardPerTokenUser()).to.eq(BigNumber.from(0));
      });

      it('should return a valid reward per token after someone staked', async () => {
        await stake(user1, STAKE_AMOUNT);
        await evm.mineBlock();

        expect(await jointCampaignOwner.arcRewardPerTokenUser()).to.eq(ArcDecimal.new(0.6).value);
      });

      it('should return correct reward per token with two users staked', async () => {
        await stake(user1, STAKE_AMOUNT);
        await stake(user2, STAKE_AMOUNT);

        await evm.mineBlock();

        expect(await jointCampaignOwner.arcRewardPerTokenUser()).to.eq(ArcDecimal.new(0.3).value);
      });
    });

    describe('#stEthRewardPerToken', () => {
      beforeEach(setup);

      it('should return the reward per token stored if the supply is 0', async () => {
        expect(await jointCampaignOwner.stEthRewardPerToken()).to.eq(BigNumber.from(0));
      });

      it('should return the correct reward per token after someone staked', async () => {
        await stake(user1, STAKE_AMOUNT);
        await evm.mineBlock();

        expect(await jointCampaignOwner.stEthRewardPerToken()).to.eq(ArcNumber.new(2));
      });

      it('should return correct reward per token with two tokens staked', async () => {
        await stake(user1, STAKE_AMOUNT);
        await stake(user2, STAKE_AMOUNT);

        await evm.mineBlock();

        expect(await jointCampaignOwner.stEthRewardPerToken()).to.eq(ArcNumber.new(1));
      });
    });

    describe('#arcEarned', () => {
      beforeEach(setup);

      it('should return the correct amount of arcx earned over time', async () => {
        await stake(user1, STAKE_AMOUNT);

        await evm.mineBlock();

        expect(await jointCampaignUser1.arcEarned(user1.address)).to.eq(ArcNumber.new(6));

        await evm.mineBlock();

        expect(await jointCampaignUser1.arcEarned(user1.address)).to.eq(ArcNumber.new(12));
      });

      it('should return the correct amount of arcx earned over time while another user stakes in between', async () => {
        await stake(user1, STAKE_AMOUNT);

        await evm.mineBlock();

        expect(await jointCampaignUser1.arcEarned(user1.address)).to.eq(ArcNumber.new(6));

        await stake(user2, STAKE_AMOUNT); // adds 4 epochs

        await evm.mineBlock();

        expect(await jointCampaignUser1.arcEarned(user1.address)).to.eq(ArcNumber.new(33)); // 6 + 6*4 + 6/2
        expect(await jointCampaignUser2.arcEarned(user2.address)).to.eq(ArcNumber.new(3));
      });
    });

    describe('#stETHEarned', () => {
      beforeEach(setup);

      it('should return the correct amount of stETH earned over time', async () => {
        await stake(user1, STAKE_AMOUNT);

        await evm.mineBlock();

        expect(await jointCampaignUser1.stEthEarned(user1.address)).to.eq(ArcNumber.new(20));

        await evm.mineBlock();

        expect(await jointCampaignUser1.stEthEarned(user1.address)).to.eq(ArcNumber.new(40));
      });

      it('should return the correct amount of stETH earned over time while another user stakes in between', async () => {
        await stake(user1, STAKE_AMOUNT);

        await evm.mineBlock();

        expect(await jointCampaignUser1.stEthEarned(user1.address)).to.eq(ArcNumber.new(20));

        await stake(user2, STAKE_AMOUNT); // adds 4 epochs

        await evm.mineBlock();

        expect(await jointCampaignUser1.stEthEarned(user1.address)).to.eq(ArcNumber.new(110)); // 20 + 20*4 + 20/2
        expect(await jointCampaignUser2.stEthEarned(user2.address)).to.eq(ArcNumber.new(10));
      });
    });

    describe('#userAllocation', () => {
      beforeEach(setup);

      it('should return the correct user allocation', async () => {
        const userAllocation = await jointCampaignUser1.userAllocation();

        expect(userAllocation.value).to.eq(BASE.sub(DAO_ALLOCATION.value));
      });
    });

    describe('#getArcRewardForDuration', () => {
      beforeEach(setup);

      it('returns the correct ARC reward for duration', async () => {
        const rewardForDuration = await jointCampaignOwner.getArcRewardForDuration();

        expect(rewardForDuration).to.eq(ARC_REWARD_AMOUNT);
      });
    });

    describe('#getStETHRewardForDuration', () => {
      beforeEach(setup);

      it('returns the correct stEth reward for duration', async () => {
        const rewardForDuration = await jointCampaignOwner.getStETHRewardForDuration();

        expect(rewardForDuration).to.eq(STETH_REWARD_AMOUNT);
      });
    });

    describe('#isMinter', () => {
      beforeEach(setup);

      it('should return false if user did not mint debt to the position', async () => {
        expect(await jointCampaignUser1.isMinter(user1.address, BORROW_AMOUNT, BigNumber.from(0)))
          .to.be.false;

        const user2Position = await arc.openPosition(COLLATERAL_AMOUNT, BORROW_AMOUNT, user2);

        expect(
          await jointCampaignUser1.isMinter(user1.address, BORROW_AMOUNT, user2Position.params.id),
        ).to.be.false;
      });

      it('should return false if user minted a smaller amount than the given _amount', async () => {
        const user1Position = await arc.openPosition(COLLATERAL_AMOUNT, BORROW_AMOUNT, user1);

        expect(
          await jointCampaignUser1.isMinter(
            user1.address,
            BORROW_AMOUNT.add(1),
            user1Position.params.id,
          ),
        ).to.be.false;
      });

      it('should return true if user minted an equal or greater amount of debt for the given position', async () => {
        const user1Position = await arc.openPosition(COLLATERAL_AMOUNT, BORROW_AMOUNT, user1);

        expect(
          await jointCampaignUser1.isMinter(
            user1.address,
            BORROW_AMOUNT.div(2),
            user1Position.params.id,
          ),
        ).to.be.true;

        expect(
          await jointCampaignUser1.isMinter(user1.address, BORROW_AMOUNT, user1Position.params.id),
        ).to.be.true;
      });
    });
  });

  describe('Mutative functions', () => {
    describe('#stake', () => {
      beforeEach(setup);

      it('should not be able to stake the full amount with less debt', async () => {
        await mintAndApprove(stakingToken, user1, STAKE_AMOUNT);

        const newPosition = await arc.openPosition(COLLATERAL_AMOUNT, BORROW_AMOUNT.sub(1), user1);

        await expectRevert(jointCampaignUser1.stake(STAKE_AMOUNT, newPosition.params.id));
      });

      it('should not be able to set a lower debt requirement by staking less before the deadline', async () => {
        const newPositionId = await stake(user1, STAKE_AMOUNT);

        await expectRevert(jointCampaignUser1.stake(BigNumber.from(1), newPositionId));
      });

      it('should not be able to stake to a different position ID', async () => {
        await stake(user1, STAKE_AMOUNT);

        const newPosition = await arc.openPosition(COLLATERAL_AMOUNT, BORROW_AMOUNT, user1);

        await mintAndApprove(stakingToken, user1, STAKE_AMOUNT);

        await expectRevert(jointCampaignUser1.stake(STAKE_AMOUNT, newPosition.params.id));
      });

      it('should not be able to stake more than balance', async () => {
        await mintAndApprove(stakingToken, user1, STAKE_AMOUNT);

        const newPosition = await arc.openPosition(COLLATERAL_AMOUNT, BORROW_AMOUNT, user1);

        await expectRevert(jointCampaignUser1.stake(STAKE_AMOUNT.add(1), newPosition.params.id));
      });

      it('should be able to stake', async () => {
        await stake(user1, STAKE_AMOUNT);

        expect(await jointCampaignUser1.balanceOfStaker(user1.address)).to.be.eq(STAKE_AMOUNT);
      });
    });

    describe('#slash', () => {
      beforeEach(setup);

      it('should not be able to slash if user has the amount of their debt snapshot', async () => {
        await stake(user1, STAKE_AMOUNT);

        await expectRevert(jointCampaignUser2.slash(user1.address));
      });

      it('should be able to slash if the user does not have enough debt', async () => {
        // check for both rewards
        const positionId = await stake(user1, STAKE_AMOUNT);

        await evm.mineBlock();

        await arc.repay(positionId, BORROW_AMOUNT.div(2), BigNumber.from(0), user1);

        await jointCampaignUser2.slash(user1.address);

        const dao = await jointCampaignUser1.stakers(owner.address);

        // 30 earned, 9 slasher's cut, 9 * 0.6 (user allocation) = 5.4
        expect(await jointCampaignUser2.arcEarned(user2.address)).to.eq(ArcDecimal.new(5.4).value);
        expect(await jointCampaignUser2.stEthEarned(user2.address)).to.eq(ArcNumber.new(60));
        expect(dao.arcRewardsEarned).to.eq(ArcNumber.new(21));
      });
    });

    describe.only('#getReward', () => {
      it('should not be able to get the reward if the tokens are not claimable', async () => {
        await setup();
        await stake(user1, STAKE_AMOUNT);

        await evm.mineBlock();

        await expectRevert(jointCampaignUser1.getReward(user1.address));
      });

      it('should be able to claim rewards gradually over time', async () => {
        await setup();
        await jointCampaignOwner.setTokensClaimable(true);

        await stake(user1, STAKE_AMOUNT);

        await evm.mineBlock();

        await jointCampaignUser1.getReward(user1.address);

        expect(await arcToken.balanceOf(user1.address)).to.eq(ArcNumber.new(12));
        expect(await stEthToken.balanceOf(user1.address)).to.eq(ArcNumber.new(40));

        await evm.mineBlock();

        await jointCampaignUser1.getReward(user1.address);

        expect(await arcToken.balanceOf(user1.address)).to.eq(ArcNumber.new(24));
        expect(await stEthToken.balanceOf(user1.address)).to.eq(ArcNumber.new(80));
      });

      it('should be able to claim the right amount of rewards given the number of participants', async () => {
        await setupBasic();
        await jointCampaignOwner.setRewardsDuration(BigNumber.from(20));
        await jointCampaignOwner.notifyRewardAmount(ARC_REWARD_AMOUNT, arcToken.address);
        await jointCampaignLido.notifyRewardAmount(STETH_REWARD_AMOUNT, stEthToken.address);

        await jointCampaignOwner.setTokensClaimable(true);

        await stake(user1, STAKE_AMOUNT);

        await jointCampaignUser1.getReward(user1.address);

        expect(await arcToken.balanceOf(user1.address)).to.eq(ArcNumber.new(3));
        expect(await stEthToken.balanceOf(user1.address)).to.eq(ArcNumber.new(10));

        await stake(user2, STAKE_AMOUNT); // increases 4 epochs

        await jointCampaignUser1.getReward(user1.address);

        expect(await arcToken.balanceOf(user1.address)).to.eq(ArcDecimal.new(16.5).value); // 3 + 3*4 + 1.5
        expect(await stEthToken.balanceOf(user1.address)).to.eq(ArcNumber.new(55)); // 10 + 10*4 + 5

        await jointCampaignUser2.getReward(user2.address);
        expect(await arcToken.balanceOf(user2.address)).to.eq(ArcNumber.new(3)); // 1.5 * 2
        expect(await stEthToken.balanceOf(user2.address)).to.eq(ArcNumber.new(10)); // 5 * 2
      });

      it('should claim the correct amount of rewards after calling #notifyRewardAmount a second time', async () => {
        await setupBasic();
        await jointCampaignOwner.setRewardsDuration(BigNumber.from(20));
        await jointCampaignOwner.setTokensClaimable(true);

        await jointCampaignOwner.notifyRewardAmount(ARC_REWARD_AMOUNT, arcToken.address); // arc reward per epoch = 5
        await jointCampaignLido.notifyRewardAmount(STETH_REWARD_AMOUNT, stEthToken.address); // stEth reward per epoch = 10

        await stake(user1, STAKE_AMOUNT);

        await jointCampaignUser1.getReward(user1.address);

        expect(await arcToken.balanceOf(user1.address)).to.eq(ArcNumber.new(3));
        expect(await stEthToken.balanceOf(user1.address)).to.eq(ArcNumber.new(10));

        await arcToken.mintShare(jointCampaignUser1.address, ARC_REWARD_AMOUNT);
        await stEthToken.mintShare(jointCampaignUser1.address, STETH_REWARD_AMOUNT);

        // call notify reward amount a second time
        await jointCampaignOwner.notifyRewardAmount(ARC_REWARD_AMOUNT, arcToken.address); // arc reward per epoch = 7.75
        await jointCampaignLido.notifyRewardAmount(STETH_REWARD_AMOUNT, stEthToken.address); // stEth reward per epoch = 15.5

        await jointCampaignUser1.getReward(user1.address);

        expect(await arcToken.balanceOf(user1.address)).to.eq(ArcDecimal.new(21.3).value); // 3 + 3*3 + (7.75*2*0.6)
        expect(await stEthToken.balanceOf(user1.address)).to.eq(ArcDecimal.new(65.5).value); // 10 + 10*4 + 15.5
      });
    });

    describe('#withdraw', () => {
      beforeEach(setup);

      xit('should not be able to withdraw more than the balance', async () => {
        // await stake(jointCampaignUser1, user1, STAKE_AMOUNT);
        // await expectRevert(jointCampaignUser1.withdraw(STAKE_AMOUNT.add(1)));
      });

      xit('should withdraw the correct amount', async () => {
        // await stake(jointCampaignUser1, user1, STAKE_AMOUNT);
        // await jointCampaignUser1.withdraw(STAKE_AMOUNT);
        // const balance = await stakingToken.balanceOf(user1.address);
        // expect(balance).to.eq(STAKE_AMOUNT);
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
      beforeEach(setup);

      xit('should be able to exit and get the right amount of staked tokens and rewards', async () => {
        // await jointCampaignOwner.setTokensClaimable(true);
        // await stake(jointCampaignUser1, user1, STAKE_AMOUNT);
        // await jointCampaignUser1.exit();
        // const stakingBalance = await stakingToken.balanceOf(user1.address);
        // const rewardBalance = await arcToken.balanceOf(user1.address);
        // expect(stakingBalance).to.eq(STAKE_AMOUNT);
        // expect(rewardBalance).to.eq(ArcNumber.new(6));
      });
    });
  });

  describe('Restricted functions', () => {
    describe('#init', () => {
      xit('should not be callable by anyone', async () => {
        // await expectRevert(
        //   jointCampaignUser1.init(
        //     user1.address,
        //     user1.address,
        //     arcToken.address,
        //     stakingToken.address,
        //     DAO_ALLOCATION,
        //   ),
        // );
      });

      xit('should only be callable by the contract owner', async () => {
        // await jointCampaignOwner.init(
        //   owner.address,
        //   owner.address,
        //   arcToken.address,
        //   stakingToken.address,
        //   DAO_ALLOCATION,
        // );
        // const arcDao = await jointCampaignOwner.arcDAO();
        // const rewardsDistributor = await jointCampaignOwner.rewardsDistributor();
        // const rewardsToken = await jointCampaignOwner.rewardsToken();
        // const stakingTokenAddress = await jointCampaignOwner.stakingToken();
        // const daoAllocation = await jointCampaignOwner.daoAllocation();
        // expect(arcDao).to.eq(owner.address);
        // expect(rewardsDistributor).to.eq(owner.address);
        // expect(rewardsToken).to.eq(arcToken.address);
        // expect(stakingTokenAddress).to.eq(stakingToken.address);
        // expect(daoAllocation).to.eq(DAO_ALLOCATION.value);
      });
    });

    describe('#setStEthRewardsDistributor', () => {
      it('should not be callable by anyone', async () => {
        await expectRevert(jointCampaignUser1.setRewardsDistributor(user1.address));
      });

      it('should set rewards distributor if called by current stEthRewardsDistributor', async () => {
        await jointCampaignOwner.setRewardsDistributor(user2.address, true);

        expect(await jointCampaignOwner.rewardsDistributor()).to.eq(user2.address);
        fail();
      });
    });

    describe('#setArcRewardsDistributor', () => {
      it('should not be callable by anyone', async () => {
        await expectRevert(jointCampaignUser1.setRewardsDistributor(user1.address));
      });

      it('should set rewards distributor if called by owner', async () => {
        await jointCampaignOwner.setRewardsDistributor(user2.address, true);

        expect(await jointCampaignOwner.rewardsDistributor()).to.eq(user2.address);
        fail();
      });
    });

    describe('#setRewardsDuration', () => {
      it('should not be called by anyone', async () => {
        await expectRevert(jointCampaignUser1.setRewardsDuration(BigNumber.from(REWARD_DURATION)));
      });

      it('should only be callable by the contract owner and set the right duration', async () => {
        const duration = BigNumber.from(REWARD_DURATION);

        await jointCampaignOwner.setRewardsDuration(duration);

        expect(await jointCampaignOwner.rewardsDuration()).to.eq(duration);
      });
    });

    describe('#notifyRewardAmount', () => {
      xit('should not be callable by anyone', async () => {
        // await expectRevert(jointCampaignUser1.notifyRewardAmount(REWARD_AMOUNT));
      });

      xit('should be callable by the arc distributor');
      xit('should be callable by the stETH distributor');
      xit('should revert if ARCx reward amount is less than the amount of ARCx on the contract');
      xit('should revert if stETH reward amount is less than the amount of stETH on the contract');
      xit('should revert if ARCx distributor tries to notify the stETH rewards');
      xit('should revert if stETH distributor tries to notify the ARCx rewards');

      xit('should update arc rewards correctly after a new reward update', async () => {
        // await jointCampaignOwner.init(
        //   owner.address,
        //   owner.address,
        //   arcToken.address,
        //   stakingToken.address,
        //   DAO_ALLOCATION,
        // );
        // await jointCampaignOwner.setRewardsDuration(REWARD_DURATION);
        // await jointCampaignOwner.notifyRewardAmount(REWARD_AMOUNT.div(2));
        // const rewardRate0 = await jointCampaignOwner.rewardRate();
        // expect(rewardRate0).to.eq(ArcNumber.new(5));
        // await jointCampaignOwner.notifyRewardAmount(REWARD_AMOUNT.div(2));
        // const rewardrate1 = await jointCampaignOwner.rewardRate();
        // expect(rewardrate1).to.eq(ArcDecimal.new(9.5).value);
      });

      xit('should update stETH rewards correctly after a new reward update');
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
        await arcToken.mintShare(jointCampaignOwner.address, erc20Share);

        await expectRevert(jointCampaignOwner.recoverERC20(stakingToken.address, erc20Share));
        await expectRevert(jointCampaignOwner.recoverERC20(arcToken.address, erc20Share));
        // todo add second reward token
        fail();
      });

      xit('should revert if owner tries to recover a greater amount of ARC than the reward amount');

      it('should let owner recover the erc20 on this contract', async () => {
        const balance0 = await otherErc20.balanceOf(owner.address);

        await jointCampaignOwner.recoverERC20(otherErc20.address, erc20Share);

        const balance1 = await otherErc20.balanceOf(owner.address);

        expect(balance1).to.eq(balance0.add(erc20Share));
      });

      xit('should let owner recover the surplus of ARC on the contract');
    });

    describe('#recoverStEth', () => {
      xit('should not be callable by anyone');
      xit('should let stEth reward distributor recover the surplus of stEth on the contract');
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
  });
});
