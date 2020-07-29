import { Wallet, Signer } from 'ethers';
import { BigNumber, BigNumberish } from 'ethers/utils';
import { StableShare } from './typings/StableShare';
import { IOracle } from './typings/IOracle';
import { SyntheticToken } from './typings/SyntheticToken';
import { PolynomialInterestSetter } from './typings/PolynomialInterestSetter';
import {
  AssetType,
  Operation,
  OperationParams,
  ActionOperated,
  Position,
  TransactionOverrides,
} from './types';
import { CoreV1 } from './typings/CoreV1';
import { parseLogs } from './utils/parseLogs';
import { Proxy } from './typings/Proxy';
import { StateV1 } from './typings/StateV1';
import { AddressBook } from './addresses/AddressBook';
import { Config } from './addresses/Config';
import Token from '../src/utils/Token';
import { LendShare } from './typings/LendShare';

export default class Arc {
  public wallet: Signer;

  public core: CoreV1;
  public state: StateV1;
  public synthetic: SyntheticToken;
  public stableShare: StableShare;
  public oracle: IOracle;
  public interestModel: PolynomialInterestSetter;
  public lendAsset: LendShare;

  static async init(wallet: Signer, addressBook?: AddressBook): Promise<Arc> {
    let arc = new Arc();
    arc.wallet = wallet;

    if (addressBook) {
      arc.core = await CoreV1.at(wallet, addressBook.proxy);
      arc.state = await StateV1.at(wallet, addressBook.stateV1);
      arc.synthetic = await SyntheticToken.at(wallet, addressBook.syntheticToken);
      arc.stableShare = await StableShare.at(wallet, addressBook.stableAsset);
      arc.oracle = await IOracle.at(wallet, addressBook.oracle);
    }

    return arc;
  }

  async deployArc(config: Config) {
    this.core = await CoreV1.deploy(this.wallet);

    const proxy = await Proxy.deploy(this.wallet);
    await proxy.setPendingImplementation(this.core.address);
    await proxy.acceptImplementation();

    this.core = await CoreV1.at(this.wallet, proxy.address);

    await this.core.setLimits(config.stableAssetLimit, config.syntheticAssetLimit);

    this.synthetic = await SyntheticToken.deploy(
      this.wallet,
      proxy.address,
      config.name,
      config.symbol,
    );

    this.lendAsset = await LendShare.deploy(
      this.wallet,
      proxy.address,
      `ARC-${config.name}`,
      `ARC-${config.name}`,
    );

    this.state = await StateV1.deploy(
      this.wallet,
      this.core.address,
      await this.wallet.getAddress(),
      {
        lendAsset: this.lendAsset.address,
        syntheticAsset: this.synthetic.address,
        stableAsset: config.stableShare,
        interestSetter: config.interestModel,
        collateralRatio: { value: config.collateralRatio },
        syntheticRatio: { value: config.syntheticRatio },
        liquidationSpread: { value: config.liquidationSpread },
        originationFee: { value: config.originationFee },
        earningsRate: { value: config.earningsRate },
        oracle: config.oracle,
      },
    );

    await this.core.init(this.state.address);
  }

  async approveStableShare(
    amount: BigNumberish,
    caller?: Signer,
    overrides?: TransactionOverrides,
  ) {
    await Token.approve(
      this.stableShare.address,
      caller || this.wallet,
      this.core.address,
      amount,
      overrides,
    );
  }

  async approveSynthetic(amount: BigNumberish, caller?: Signer, overrides?: TransactionOverrides) {
    await Token.approve(
      this.synthetic.address,
      caller || this.wallet,
      this.core.address,
      amount,
      overrides,
    );
  }

  async supply(amount: BigNumberish, caller?: Signer, overrides?: TransactionOverrides) {
    const contract = await this.getCore(caller);
    const tx = await contract.operateAction(
      Operation.Supply,
      {
        id: 0,
        assetOne: AssetType.Stable,
        amountOne: amount,
        assetTwo: '',
        amountTwo: 0,
      },
      overrides,
    );
    return await this.parseActionTx(tx);
  }

  async withdraw(amount: BigNumberish, caller?: Signer, overrides?: TransactionOverrides) {
    const contract = await this.getCore(caller);
    const tx = await contract.operateAction(
      Operation.Withdraw,
      {
        id: 0,
        assetOne: AssetType.Stable,
        amountOne: amount,
        assetTwo: '',
        amountTwo: 0,
      },
      overrides,
    );
    return await this.parseActionTx(tx);
  }

  async openPosition(
    collateralAsset: AssetType,
    collateralAmount: BigNumberish,
    borrowAmount: BigNumberish,
    caller?: Signer,
    overrides?: TransactionOverrides,
  ) {
    const contract = await this.getCore(caller);
    const tx = await contract.operateAction(
      Operation.Open,
      {
        id: 0,
        assetOne: collateralAsset,
        amountOne: collateralAmount,
        assetTwo: '',
        amountTwo: borrowAmount,
      },
      overrides,
    );
    return await this.parseActionTx(tx);
  }

  async borrow(
    positionId: BigNumberish,
    collateralAsset: AssetType,
    collateralAmount: BigNumberish,
    borrowAmount: BigNumberish,
    caller?: Signer,
    overrides?: TransactionOverrides,
  ) {
    const contract = await this.getCore(caller);
    const tx = await contract.operateAction(
      Operation.Borrow,
      {
        id: positionId,
        assetOne: collateralAsset,
        amountOne: collateralAmount,
        assetTwo: '',
        amountTwo: borrowAmount,
      },
      overrides,
    );

    return await this.parseActionTx(tx);
  }

  async repay(
    positionId: BigNumberish,
    repaymentAmount: BigNumberish,
    withdrawAmount: BigNumberish,
    caller?: Signer,
    overrides?: TransactionOverrides,
  ) {
    const contract = await this.getCore(caller);
    const tx = await contract.operateAction(
      Operation.Repay,
      {
        id: positionId,
        assetOne: '',
        amountOne: repaymentAmount,
        assetTwo: '',
        amountTwo: withdrawAmount,
      },
      overrides,
    );

    return await this.parseActionTx(tx);
  }

  async liquidatePosition(
    positionId: BigNumberish,
    caller?: Signer,
    overrides?: TransactionOverrides,
  ) {
    const contract = await this.getCore(caller);
    const tx = await contract.operateAction(
      Operation.Liquidate,
      {
        id: positionId,
        assetOne: '',
        amountOne: 0,
        assetTwo: '',
        amountTwo: 0,
      } as OperationParams,
      overrides,
    );

    return await this.parseActionTx(tx);
  }

  async parseActionTx(tx: any) {
    const receipt = await tx.wait();
    const logs = parseLogs(receipt.logs, CoreV1.ABI);
    const log = logs[0];

    const position = {
      owner: log.values.updatedPosition[0],
      collateralAsset: log.values.updatedPosition[1],
      borrowedAsset: log.values.updatedPosition[2],
      collateralAmount: {
        sign: log.values.updatedPosition[3][0],
        value: log.values.updatedPosition[3][1],
      },
      borrowedAmount: {
        sign: log.values.updatedPosition[4][0],
        value: log.values.updatedPosition[4][1],
      },
    } as Position;

    const result = {
      operation: log.values.operation,
      params: {
        id: log.values.params[0],
        assetOne: log.values.params[1],
        amountOne: log.values.params[2],
        assetTwo: log.values.params[3],
        amountTwo: log.values.params[4],
      },
      updatedPosition: position,
    } as ActionOperated;

    return result;
  }

  async getCore(caller?: Signer) {
    return await CoreV1.at(caller || this.wallet, this.core.address);
  }
}
