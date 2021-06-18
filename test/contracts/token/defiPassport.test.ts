import { BigNumber } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { CreditScoreTree } from '@src/MerkleTree';
import { MockSapphireCreditScore, SapphireCreditScore } from '@src/typings';
import { MockDefiPassport } from '@src/typings/MockDefiPassport';
import { getScoreProof } from '@src/utils';
import { addSnapshotBeforeRestoreAfterEach } from '@test/helpers/testingUtils';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  deployDefiPassport,
  deployMockDefiPassport,
  deployMockSapphireCreditScore,
} from '../deployers';

describe('DefiPassport', () => {
  let defiPassport: MockDefiPassport;

  let creditScoreContract: SapphireCreditScore;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let userNoCreditScore: SignerWithAddress;
  let skinManager: SignerWithAddress;
  let skinAddress: string;
  const skinTokenId = BigNumber.from(21);

  let creditScoreTree: CreditScoreTree;

  async function _setupCreditScoreContract() {
    creditScoreContract = await deployMockSapphireCreditScore(owner);

    const ownerCreditScore = {
      account: owner.address,
      amount: BigNumber.from(500),
    };
    const userCreditScore = {
      account: user.address,
      amount: BigNumber.from(500),
    };
    creditScoreTree = new CreditScoreTree([ownerCreditScore, userCreditScore]);

    await creditScoreContract.init(
      creditScoreTree.getHexRoot(),
      owner.address,
      owner.address,
      1000,
    );
    await creditScoreContract.setPause(false);

    await creditScoreContract.verifyAndUpdate(
      getScoreProof(userCreditScore, creditScoreTree),
    );
  }

  /**
   * Helper function that mints a passport to the `user`
   */
  async function mintUserPassport() {
    await defiPassport.connect(skinManager).setApproveSkin(skinAddress, true);
    await defiPassport.setSkinOwner(skinAddress, skinTokenId, user.address);

    await defiPassport.mint(user.address, skinAddress, skinTokenId);

    return await defiPassport.tokenOfOwnerByIndex(user.address, 0);
  }

  before(async () => {
    const signers = await ethers.getSigners();
    owner = signers[0];
    user = signers[1];
    userNoCreditScore = signers[2];
    skinManager = signers[3];
    skinAddress = await ethers.Wallet.createRandom().getAddress();

    await _setupCreditScoreContract();

    defiPassport = await deployMockDefiPassport(owner);
    await defiPassport.init(
      'Defi Passport',
      'DefiPassport',
      creditScoreContract.address,
      skinManager.address,
    );
  });

  addSnapshotBeforeRestoreAfterEach();

  describe('#init', () => {
    it('reverts if called by non-admin', async () => {
      await expect(
        defiPassport
          .connect(user)
          .init('a', 'b', creditScoreContract.address, skinManager.address),
      ).to.be.revertedWith('Adminable: caller is not admin');
    });

    it('sets the name and symbol of the NFT', async () => {
      const name = 'DeFi Passport';
      const symbol = 'DefiPassport';

      const _defiPassport = await deployMockDefiPassport(owner);

      await _defiPassport.init(
        name,
        symbol,
        creditScoreContract.address,
        skinManager.address,
      );

      expect(await _defiPassport.name()).to.eq(name);
      expect(await _defiPassport.symbol()).to.eq(symbol);
    });

    it('reverts if called a second time', async () => {
      await expect(
        defiPassport.init(
          'a',
          'b',
          creditScoreContract.address,
          skinManager.address,
        ),
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });
  });

  // mint(address to, address skin)
  describe('#mint', () => {
    it('reverts if the receiver has no credit score', async () => {
      await defiPassport.connect(skinManager).setApproveSkin(skinAddress, true);

      await expect(
        defiPassport.mint(userNoCreditScore.address, skinAddress, skinTokenId),
      ).to.be.revertedWith('DefiPassport: the user has no credit score');
    });

    it('reverts if the skin is not approved', async () => {
      await expect(
        defiPassport.mint(user.address, skinAddress, skinTokenId),
      ).to.be.revertedWith('DefiPassport: the skin is not approved');
    });

    it('reverts if the receiver is not the skin owner', async () => {
      await defiPassport.connect(skinManager).setApproveSkin(skinAddress, true);

      await expect(
        defiPassport.mint(user.address, skinAddress, skinTokenId),
      ).to.be.revertedWith('DefiPassport: the receiver does not own the skin');
    });

    it('mints the passport to the receiver', async () => {
      await defiPassport.connect(skinManager).setApproveSkin(skinAddress, true);
      await defiPassport.setSkinOwner(skinAddress, skinTokenId, user.address);

      await defiPassport.mint(user.address, skinAddress, skinTokenId);

      // The token ID will be 1 since it's the first one minted
      const tokenId = 1;

      expect(await defiPassport.balanceOf(user.address)).to.eq(1);
      expect(await defiPassport.tokenURI(tokenId)).to.eq(
        user.address.slice(2).toLowerCase(),
      );

      const activeSkinRes = await defiPassport.activeSkins(tokenId);
      const activeSkin = {
        skin: activeSkinRes[0],
        skinTokenId: activeSkinRes[1],
      };
      expect(activeSkin).to.deep.eq({
        skin: skinAddress,
        skinTokenId,
      });
    });

    it('reverts if the receiver already has a passport', async () => {
      await defiPassport.connect(skinManager).setApproveSkin(skinAddress, true);
      await defiPassport.setSkinOwner(skinAddress, skinTokenId, user.address);

      await defiPassport.mint(user.address, skinAddress, skinTokenId);

      await expect(
        defiPassport.mint(user.address, skinAddress, skinTokenId),
      ).to.be.revertedWith('DefiPassport: user already has a defi passport');
    });
  });

  describe('#setBaseURI', () => {
    it('reverts if called by non-admin', async () => {
      await expect(
        defiPassport.connect(user).setBaseURI('test'),
      ).to.be.revertedWith('Adminable: caller is not admin');
    });

    it('sets the base URI of tokens', async () => {
      const uri = 'https://test.com/defipassport';

      await defiPassport.setBaseURI(uri);

      expect(await defiPassport.baseURI()).to.eq(uri);
    });
  });

  describe('#setActiveSkin', () => {
    let otherSkinAddy: string;
    let otherSkinTokenId: number;

    before(async () => {
      otherSkinAddy = await ethers.Wallet.createRandom().getAddress();
      otherSkinTokenId = 42;
    });

    it('reverts if caller has no passport', async () => {
      await expect(
        defiPassport.setActiveSkin(skinAddress, skinTokenId),
      ).to.be.revertedWith('DefiPassport: caller has no passport');
    });

    it('reverts if caller does not have the specified skin', async () => {
      await mintUserPassport();

      await expect(
        defiPassport
          .connect(user)
          .setActiveSkin(otherSkinAddy, otherSkinTokenId),
      ).to.be.revertedWith('DefiPassport: the user does not own the skin');
    });

    it('sets the skin', async () => {
      const tokenId = await mintUserPassport();
      await defiPassport.setSkinOwner(
        otherSkinAddy,
        otherSkinTokenId,
        user.address,
      );

      let activeSkin = await defiPassport.activeSkins(tokenId);
      expect(activeSkin.skin).to.eq(skinAddress);
      expect(activeSkin.skinTokenId).to.eq(skinTokenId);

      await defiPassport
        .connect(user)
        .setActiveSkin(otherSkinAddy, otherSkinTokenId);

      activeSkin = await defiPassport.activeSkins(tokenId);
      expect(activeSkin.skin).to.eq(otherSkinAddy);
      expect(activeSkin.skinTokenId).to.eq(otherSkinTokenId);
    });
  });

  describe('#setSkinManager', () => {
    it('reverts if called by non-admin', async () => {
      await expect(
        defiPassport.connect(user).setSkinManager(user.address),
      ).to.be.revertedWith('Adminable: caller is not admin');
    });

    it('reverts if sets the same skin manager', async () => {
      await expect(
        defiPassport.setSkinManager(skinManager.address),
      ).to.be.revertedWith(
        'DefiPassport: the same skin manager is already set',
      );
    });

    it('sets the skin manager if called by admin', async () => {
      expect(await defiPassport.skinManager()).to.eq(skinManager.address);

      await defiPassport.setSkinManager(owner.address);

      expect(await defiPassport.skinManager()).to.eq(owner.address);
    });
  });

  describe('#setApproveSkin', () => {
    it('reverts if called by non-skin-manager', async () => {
      await expect(
        defiPassport.setApproveSkin(skinAddress, false),
      ).to.be.revertedWith('DefiPassport: caller is not skin manager');
    });

    it('approves the skin', async () => {
      expect(await defiPassport.approvedSkins(skinAddress)).to.be.false;

      await defiPassport.connect(skinManager).setApproveSkin(skinAddress, true);

      expect(await defiPassport.approvedSkins(skinAddress)).to.be.true;
    });
  });

  describe('#setCreditScoreContract', () => {
    let otherCreditScoreContract: MockSapphireCreditScore;

    before(async () => {
      otherCreditScoreContract = await deployMockSapphireCreditScore(owner);
    });

    it('reverts if called by non-admin', async () => {
      await expect(
        defiPassport
          .connect(user)
          .setCreditScoreContract(otherCreditScoreContract.address),
      ).to.be.revertedWith('Adminable: caller is not admin');
    });

    it('sets the credit score contract if called by admin', async () => {
      expect(await defiPassport.creditScoreContract()).to.eq(
        creditScoreContract.address,
      );

      await defiPassport.setCreditScoreContract(
        otherCreditScoreContract.address,
      );
    });
  });

  describe('#approve', () => {
    it('reverts - defi passports are not transferrable', async () => {
      const tokenId = await mintUserPassport();

      await expect(
        defiPassport.connect(user).approve(owner.address, tokenId),
      ).to.be.revertedWith(
        'DefiPassport: defi passports are not transferrable',
      );
    });
  });

  describe('#transferFrom', () => {
    it('reverts - defi passports are not transferrable', async () => {
      const tokenId = await mintUserPassport();

      await expect(
        defiPassport
          .connect(user)
          .transferFrom(user.address, owner.address, tokenId),
      ).to.be.revertedWith(
        'DefiPassport: defi passports are not transferrable',
      );
    });
  });

  describe('#safeTransferFrom(from, to, tokenId)', () => {
    it.only('reverts - defi passports are not transferrable', async () => {
      const tokenId = await mintUserPassport();

      await expect(
        defiPassport
          .connect(user)
          .safeTransferFrom(user.address, owner.address, tokenId),
      ).to.be.revertedWith(
        'DefiPassport: defi passports are not transferrable',
      );
    });
  });

  describe('#safeTransferFrom(from, to, tokenId, _data)', () => {
    it('reverts - defi passports are not transferrable', async () => {
      const tokenId = await mintUserPassport();

      await expect(
        defiPassport
          .connect(user)
          .safeTransferFrom(user.address, owner.address, tokenId, ''),
      ).to.be.revertedWith(
        'DefiPassport: defi passports are not transferrable',
      );
    });
  });

  describe('#setApprovalForAll', () => {
    it('reverts - defi passports are not transferrable', async () => {
      await expect(
        defiPassport.connect(user).setApprovalForAll(owner.address, true),
      ).to.be.revertedWith(
        'DefiPassport: defi passports are not transferrable',
      );
    });
  });
});
