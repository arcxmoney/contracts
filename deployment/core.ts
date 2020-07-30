import { Wallet, ethers } from 'ethers';
import { AddressBook } from '../src/addresses/AddressBook';
import { Config } from '../src/addresses/Config';

import { CoreV1 } from '../src/typings/CoreV1';
import { Proxy } from '../src/typings/Proxy';
import { LendShare } from '../src/typings/LendShare';
import { SyntheticToken } from '../src/typings/SyntheticToken';
import { StateV1 } from '../src/typings/StateV1';
import { StableShare } from '../src/typings/StableShare';
import { MockOracle } from '../src/typings/MockOracle';
import { ChainLinkOracle } from '../src/typings/ChainLinkOracle';
import { PolynomialInterestSetter } from '../src/typings/PolynomialInterestSetter';

export class CoreStage {
  wallet: Wallet;
  addressBook: AddressBook;
  config: Config;

  constructor(wallet: Wallet, addressBook: AddressBook, config: Config) {
    this.wallet = wallet;
    this.addressBook = addressBook;
    this.config = config;
  }

  async deployAll(): Promise<AddressBook> {
    if (!this.addressBook.coreV1) {
      await this.deployCore();
    }

    if (!this.addressBook.proxy) {
      await this.deployProxy();
    }

    if (!this.addressBook.syntheticToken) {
      await this.deploySynthetic();
    }

    this.addressBook.stableAsset = this.addressBook.stableAsset || this.config.stableShare;
    if (!this.addressBook.stableAsset) {
      await this.deployStableAsset();
    }

    if (!this.addressBook.lendAsset) {
      await this.deployLendAsset();
    }

    this.addressBook.oracle = this.addressBook.oracle || this.config.oracle;
    if (!this.addressBook.oracle) {
      await this.deployOracle();
    }

    this.addressBook.interestSetter = this.addressBook.interestSetter || this.config.interestModel;
    if (!this.addressBook.interestSetter) {
      await this.deployInterestSetter();
    }

    if (!this.addressBook.stateV1) {
      await this.deployState();
    }

    await this.initState();

    await this.transferOwnership();

    return this.addressBook;
  }

  async transferOwnership() {}

  async deployCore() {
    console.log('*** Deploying Core *** ');
    const contract = await CoreV1.awaitDeployment(this.wallet);
    this.addressBook.coreV1 = contract.address;
  }

  async deployProxy() {
    console.log('*** Deploying Proxy *** ');
    const contract = await Proxy.awaitDeployment(this.wallet);
    console.log('** Setting pending implementation **');
    await contract.setPendingImplementation(this.addressBook.coreV1);
    console.log('** Accepting pending implementation **');
    await contract.acceptImplementation({
      gasLimit: 5000000,
    });
    this.addressBook.proxy = contract.address;
  }

  async deploySynthetic() {
    console.log('*** Deploying Synthetic Asset *** ');
    const contract = await SyntheticToken.awaitDeployment(
      this.wallet,
      this.addressBook.proxy,
      this.config.name,
      this.config.symbol,
    );
    this.addressBook.syntheticToken = contract.address;
  }

  async deployStableAsset() {
    console.log('*** Deploying Stable Asset *** ');
    const contract = await StableShare.awaitDeployment(this.wallet);
    this.addressBook.stableAsset = contract.address;
  }

  async deployOracle() {
    console.log('*** Deploying Mock Oracle *** ');
    if (this.config.chainlinkAggregator) {
      const contract = await ChainLinkOracle.awaitDeployment(
        this.wallet,
        this.config.chainlinkAggregator,
      );
      this.addressBook.oracle = contract.address;
    } else {
      const contract = await MockOracle.awaitDeployment(this.wallet);
      this.addressBook.oracle = contract.address;
    }
  }

  async deployInterestSetter() {
    console.log('*** Deploying Interest Setter *** ');
    const contract = await PolynomialInterestSetter.awaitDeployment(this.wallet, {
      maxAPR: this.config.interestModelParams.maxAPR,
      coefficients: this.config.interestModelParams.coefficients,
    });
    this.addressBook.interestSetter = contract.address;
  }

  async deployLendAsset() {
    console.log('*** Deploying Lend Asset ***');
    const contract = await LendShare.awaitDeployment(
      this.wallet,
      this.addressBook.proxy,
      `ARC-${this.config.symbol}`,
      `ARC-${this.config.symbol}`,
    );
    this.addressBook.lendAsset = contract.address;
  }

  async deployState() {
    console.log('*** Deploying State *** ');
    const contract = await StateV1.deploy(this.wallet, this.addressBook.proxy, this.config.owner, {
      lendAsset: this.addressBook.lendAsset,
      syntheticAsset: this.addressBook.syntheticToken,
      stableAsset: this.addressBook.stableAsset,
      interestSetter: this.addressBook.interestSetter,
      collateralRatio: { value: this.config.collateralRatio },
      syntheticRatio: { value: this.config.syntheticRatio },
      liquidationSpread: { value: this.config.liquidationSpread },
      originationFee: { value: this.config.originationFee },
      earningsRate: { value: this.config.earningsRate },
      oracle: this.addressBook.oracle,
    });
    this.addressBook.stateV1 = contract.address;
  }

  async initState() {
    console.log('*** Initing State *** ');
    const contract = await CoreV1.at(this.wallet, this.addressBook.proxy);

    if ((await contract.state()) == ethers.constants.AddressZero) {
      await contract.init(this.addressBook.stateV1);
    }

    if (
      (await contract.stableLimit()).toString() == '0' &&
      (await contract.syntheticLimit()).toString() == '0'
    ) {
      console.log('** Setting Limits **');
      await contract.setLimits(this.config.stableAssetLimit, this.config.syntheticAssetLimit);
    }
  }
}
