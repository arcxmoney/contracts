import { PassportScore } from '@arc-types/sapphireCore';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { PassportScoreTree } from '@src/MerkleTree';
import {
  SapphireMapperLinear,
  SapphireMapperLinear__factory,
  MockSapphireMapperLinear__factory,
  SapphireAssessor,
  SapphireAssessor__factory,
} from '@src/typings';
import { MockSapphirePassportScores } from '@src/typings/MockSapphirePassportScores';
import { ArcNumber, getScoreProof } from '@src/utils';
import {
  DEFAULT_MAX_CREDIT_SCORE,
  DEFAULT_PROOF_PROTOCOL,
} from '@test/helpers/sapphireDefaults';
import { expect } from 'chai';
import { BigNumber, constants, utils } from 'ethers';
import { ethers } from 'hardhat';

describe('SapphireAssessor', () => {
  let owner: SignerWithAddress;
  let assessor: SapphireAssessor;
  let mapper: SapphireMapperLinear;
  let passportScoresContract: MockSapphirePassportScores;

  let scoresTree: PassportScoreTree;
  let passportScore1: PassportScore;
  let passportScore2: PassportScore;
  let passportScore3: PassportScore;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  /**
   * Returns an assessor that is set up with a sapphire credit score contract
   * containing a user with the given `creditScore`
   */
  async function getAssessorWithCredit(
    score: BigNumber,
  ): Promise<{
    assessor: SapphireAssessor;
    score: PassportScore;
    scoresTree: PassportScoreTree;
  }> {
    const testPassportScore = {
      account: user1.address,
      protocol: utils.formatBytes32String(DEFAULT_PROOF_PROTOCOL),
      score: score,
    };
    const anotherPassportScore = {
      account: user2.address,
      protocol: utils.formatBytes32String(DEFAULT_PROOF_PROTOCOL),
      score: BigNumber.from(500),
    };

    const testPassportScoreTree = new PassportScoreTree([
      testPassportScore,
      anotherPassportScore,
    ]);

    const testPassportScoreContract = await new MockSapphirePassportScores__factory(
      owner,
    ).deploy();
    await testPassportScoreContract.init(
      testPassportScoreTree.getHexRoot(),
      owner.address,
      owner.address,
    );

    const testAssessor = await new SapphireAssessor__factory(owner).deploy(
      mapper.address,
      testPassportScoreContract.address,
      DEFAULT_MAX_CREDIT_SCORE,
    );

    return {
      assessor: testAssessor,
      score: testPassportScore,
      scoresTree: testPassportScoreTree,
    };
  }

  before(async () => {
    const signers = await ethers.getSigners();
    owner = signers[0];
    user1 = signers[1];
    user2 = signers[2];

    mapper = await new SapphireMapperLinear__factory(owner).deploy();

    passportScore1 = {
      account: user1.address,
      protocol: utils.formatBytes32String(DEFAULT_PROOF_PROTOCOL),
      score: BigNumber.from(600),
    };

    passportScore2 = {
      account: user2.address,
      protocol: utils.formatBytes32String(DEFAULT_PROOF_PROTOCOL),
      score: BigNumber.from(200),
    };

    passportScore3 = {
      account: signers[3].address,
      protocol: utils.formatBytes32String(DEFAULT_PROOF_PROTOCOL),
      score: BigNumber.from(300),
    };

    scoresTree = new PassportScoreTree([
      passportScore1,
      passportScore2,
      passportScore3,
    ]);

    passportScoresContract = await deployMockSapphirePassportScores(owner);
    await passportScoresContract.init(
      scoresTree.getHexRoot(),
      '0x0000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000',
    );

    assessor = await new SapphireAssessor__factory(owner).deploy(
      mapper.address,
      passportScoresContract.address,
      DEFAULT_MAX_CREDIT_SCORE,
    );
  });

  describe('constructor', () => {
    it('reverts if mapper and credit score are null', async () => {
      await expect(
        new SapphireAssessor__factory(owner).deploy(
          '0x0000000000000000000000000000000000000000',
          passportScoresContract.address,
          DEFAULT_MAX_CREDIT_SCORE,
        ),
      ).to.be.revertedWith(
        'SapphireAssessor: The mapper and the passport scores must be valid contracts',
      );

      await expect(
        new SapphireAssessor__factory(owner).deploy(
          mapper.address,
          '0x0000000000000000000000000000000000000000',
          DEFAULT_MAX_CREDIT_SCORE,
        ),
      ).to.be.revertedWith(
        'SapphireAssessor: The mapper and the passport scores must be valid contracts',
      );

      await expect(
        new SapphireAssessor__factory(owner).deploy(
          '0x0000000000000000000000000000000000000000',
          '0x0000000000000000000000000000000000000000',
          DEFAULT_MAX_CREDIT_SCORE,
        ),
      ).to.be.revertedWith(
        'SapphireAssessor: The mapper and the passport scores must be valid contracts',
      );
    });

    it('reverts if max score is 0', async () => {
      await expect(
        new SapphireAssessor__factory(owner).deploy(
          mapper.address,
          passportScoresContract.address,
          0,
        ),
      ).to.be.revertedWith('SapphireAssessor: max score cannot be zero');
    });

    it('initializes the mapper and the credit score', async () => {
      const testAssessor = await new SapphireAssessor__factory(owner).deploy(
        mapper.address,
        passportScoresContract.address,
        DEFAULT_MAX_CREDIT_SCORE,
      );

      expect(await testAssessor.mapper()).to.eq(mapper.address);
      expect(await testAssessor.passportScoresContract()).to.eq(
        passportScoresContract.address,
      );
    });
  });

  describe('#assess', () => {
    it('reverts if upper bound or account are empty', async () => {
      expect(await assessor.passportScoresContract()).to.eq(
        passportScoresContract.address,
      );

      // upper bound is empty
      await expect(
        assessor.assess(0, 0, getScoreProof(passportScore1, scoresTree), false),
      ).to.be.revertedWith('SapphireAssessor: The upper bound cannot be zero');

      // account is empty
      await expect(
        assessor.assess(
          0,
          100,
          {
            account: constants.AddressZero,
            protocol: utils.formatBytes32String(DEFAULT_PROOF_PROTOCOL),
            score: passportScore1.score,
            merkleProof: scoresTree.getProof(passportScore1),
          },
          false,
        ),
      ).to.be.revertedWith(
        'SapphirePassportScores: account cannot be address 0',
      );
    });

    it('reverts if lower bound is not smaller than upper bound', async () => {
      await expect(
        assessor.assess(
          11,
          10,
          {
            account: user1.address,
            protocol: utils.formatBytes32String(DEFAULT_PROOF_PROTOCOL),
            score: passportScore1.score,
            merkleProof: scoresTree.getProof(passportScore1),
          },
          false,
        ),
      ).to.be.revertedWith(
        'SapphireAssessor: The lower bound must be smaller than the upper bound',
      );
    });

    it('reverts if the mapper returns a value that is outside the lower and upper bounds', async () => {
      const testMapper = await new MockSapphireMapperLinear__factory(
        owner,
      ).deploy();
      const testAssessor = await new SapphireAssessor__factory(owner).deploy(
        testMapper.address,
        passportScoresContract.address,
        DEFAULT_MAX_CREDIT_SCORE,
      );

      await testMapper.setMapResult(0);

      await expect(
        testAssessor.assess(
          1,
          10,
          getScoreProof(passportScore1, scoresTree),
          false,
        ),
      ).to.be.revertedWith(
        'SapphireAssessor: The mapper returned a value out of bounds',
      );

      await testMapper.setMapResult(11);

      await expect(
        testAssessor.assess(
          1,
          10,
          getScoreProof(passportScore1, scoresTree),
          false,
        ),
      ).to.be.revertedWith(
        'SapphireAssessor: The mapper returned a value out of bounds',
      );
    });

    it('reverts if the proof is invalid', async () => {
      await expect(
        assessor.assess(
          1,
          10,
          {
            ...getScoreProof(passportScore1, scoresTree),
            score: passportScore1.score.add(1),
          },
          false,
        ),
      ).to.be.revertedWith('SapphirePassportScores: invalid proof');
    });

    it(`returns the upperBound if the user has no proof`, async () => {
      // If there's no score & no proof, pass the lowest credit score to the mapper
      await expect(
        assessor.assess(
          1,
          10,
          {
            account: user2.address,
            protocol: utils.formatBytes32String(''),
            score: 0,
            merkleProof: [],
          },
          false,
        ),
      )
        .to.emit(assessor, 'Assessed')
        .withArgs(user2.address, 10);
    });

    it(`reverts if score is required and no proof is passed`, async () => {
      await expect(
        assessor.assess(
          1,
          10,
          {
            account: passportScore3.account,
            protocol: utils.formatBytes32String(''),
            score: 0,
            merkleProof: [],
          },
          true,
        ),
      ).to.be.revertedWith('SapphirePassportScores: invalid proof');
    });

    it(`reverts if score is required and no proof`, async () => {
      await expect(
        assessor.assess(1, 10, getScoreProof(passportScore2, scoresTree), true),
      ).to.emit(assessor, 'Assessed');

      await expect(
        assessor.assess(
          1,
          10,
          {
            ...getScoreProof(passportScore2, scoresTree),
            merkleProof: [],
          },
          true,
        ),
      ).to.be.revertedWith('SapphirePassportScores: invalid proof');
    });

    it(`emit Assessed if the user has an existing score, score is required and proof is provided`, async () => {
      await expect(
        assessor.assess(
          ArcNumber.new(100),
          ArcNumber.new(200),
          getScoreProof(passportScore1, scoresTree),
          true,
        ),
      ).to.emit(assessor, 'Assessed');

      await expect(
        assessor.assess(
          ArcNumber.new(100),
          ArcNumber.new(200),
          getScoreProof(passportScore1, scoresTree),
          true,
        ),
      ).to.emit(assessor, 'Assessed');
    });

    it('returns the lowerBound if credit score is maxed out', async () => {
      const {
        assessor: testAssessor,
        score: maxPassportScore,
        scoresTree: testPassportScoreTree,
      } = await getAssessorWithCredit(BigNumber.from(1000));

      await expect(
        testAssessor.assess(
          ArcNumber.new(100),
          ArcNumber.new(200),
          getScoreProof(maxPassportScore, testPassportScoreTree),
          false,
        ),
      )
        .to.emit(testAssessor, 'Assessed')
        .withArgs(maxPassportScore.account, ArcNumber.new(100));
    });

    it('returns the upperBound if credit score is at minimum', async () => {
      const {
        assessor: testAssessor,
        score: minPassportScore,
        scoresTree: testPassportScoreTree,
      } = await getAssessorWithCredit(BigNumber.from(0));

      await expect(
        testAssessor.assess(
          ArcNumber.new(100),
          ArcNumber.new(200),
          getScoreProof(minPassportScore, testPassportScoreTree),
          false,
        ),
      )
        .to.emit(testAssessor, 'Assessed')
        .withArgs(minPassportScore.account, ArcNumber.new(200));
    });

    it('returns the correct value given the credit score and a valid proof', async () => {
      // 200 - (600/1000 * (200-100)) = 140
      await expect(
        assessor.assess(
          ArcNumber.new(100),
          ArcNumber.new(200),
          getScoreProof(passportScore1, scoresTree),
          false,
        ),
      )
        .to.emit(assessor, 'Assessed')
        .withArgs(user1.address, ArcNumber.new(140));
    });
  });

  describe('#setMapper', () => {
    it('reverts if called by non-owner', async () => {
      const userAssessor = SapphireAssessor__factory.connect(
        assessor.address,
        user1,
      );

      await expect(userAssessor.setMapper(user1.address)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('reverts if no new mapper is passed', async () => {
      await expect(
        assessor.setMapper(constants.AddressZero),
      ).to.be.revertedWith('SapphireAssessor: _mapper is not a contract');
    });

    it('reverts if the new mapper is the same as the existing one', async () => {
      await expect(assessor.setMapper(mapper.address)).to.be.revertedWith(
        'The same mapper is already set',
      );
    });

    it('sets the new mapper as owner', async () => {
      const testMapper = await new SapphireMapperLinear__factory(
        owner,
      ).deploy();

      await assessor.setMapper(testMapper.address);

      const newMapper = await assessor.mapper();
      expect(newMapper).to.eq(testMapper.address);
    });

    it('emits a MapperSet event', async () => {
      const testMapper = await new SapphireMapperLinear__factory(
        owner,
      ).deploy();

      await expect(assessor.setMapper(testMapper.address))
        .to.emit(assessor, 'MapperSet')
        .withArgs(testMapper.address);
    });
  });

  describe('#setMaxScore', () => {
    it('reverts if called by non-owner', async () => {
      await expect(assessor.connect(user1).setMaxScore(21)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('sets the max score', async () => {
      expect(await assessor.maxScore()).to.eq(DEFAULT_MAX_CREDIT_SCORE);

      await assessor.setMaxScore(21);

      expect(await assessor.maxScore()).to.eq(21);
    });

    it('reverts if max score is set to 0', async () => {
      await expect(assessor.setMaxScore(0)).to.be.revertedWith(
        'SapphireAssessor: max score cannot be zero',
      );
    });
  });

  describe('#setPassportScoreContract', () => {
    it('reverts if called by non-owner', async () => {
      const userAssessor = SapphireAssessor__factory.connect(
        assessor.address,
        user1,
      );

      await expect(
        userAssessor.setPassportScoreContract(user1.address),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('reverts if new address is 0', async () => {
      await expect(
        assessor.setPassportScoreContract(
          '0x0000000000000000000000000000000000000000',
        ),
      ).to.be.revertedWith('SapphireAssessor: _creditScore is not a contract');
    });

    it('reverts if new address is the same as the existing one', async () => {
      await expect(
        assessor.setPassportScoreContract(passportScoresContract.address),
      ).to.be.revertedWith(
        'SapphireAssessor: The same credit score contract is already set',
      );
    });

    it('sets the new credit score contract', async () => {
      const testPassportScoreTree = new PassportScoreTree([passportScore2]);

      const testPassportScoreContract = await new MockSapphirePassportScores__factory(
        owner,
      ).deploy();
      await testPassportScoreContract.init(
        testPassportScoreTree.getHexRoot(),
        owner.address,
        owner.address,
      );

      await assessor.setPassportScoreContract(
        testPassportScoreContract.address,
      );

      expect(await assessor.passportScoresContract()).to.eq(
        testPassportScoreContract.address,
      );
    });

    it('emits the PassportScoreContractSet event', async () => {
      const testPassportScoreTree = new PassportScoreTree([passportScore2]);

      const testPassportScoreContract = await new MockSapphirePassportScores__factory(
        owner,
      ).deploy();
      await testPassportScoreContract.init(
        testPassportScoreTree.getHexRoot(),
        owner.address,
        owner.address,
      );

      await expect(
        assessor.setPassportScoreContract(testPassportScoreContract.address),
      )
        .to.emit(assessor, 'PassportScoreContractSet')
        .withArgs(testPassportScoreContract.address);
    });
  });
});
