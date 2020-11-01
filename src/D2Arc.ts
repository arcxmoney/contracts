import { Signer } from 'ethers';
import { BigNumber, BigNumberish } from 'ethers/utils';
import {
  D2CoreV1,
  IERC20,
  IOracle,
  ISyntheticToken,
  SyntheticToken,
  TransactionOverrides,
} from './typings';
import { ID2Core } from './typings/ID2Core';
import { asyncForEach } from '@src/utils/asyncForEach';
import { TestToken } from '@src/typings/TestToken';
import { ActionOperated, Operation, Position } from './types';
import { parseLogs } from './utils/parseLogs';

export enum SynthNames {
  TESTUSD = 'TESTUSD',
}

export type Synth = {
  core: D2CoreV1;
  oracle: IOracle;
  collateral: TestToken;
  synthetic: SyntheticToken;
};

export default class D2Arc {
  public wallet: Signer;
  public walletAddress: string;

  public synths: { [name: string]: Synth } = {};

  static async init(wallet: Signer): Promise<D2Arc> {
    let arc = new D2Arc();
    arc.wallet = wallet;
    arc.walletAddress = await wallet.getAddress();
    return arc;
  }

  public async addSynths(synths: { [name in SynthNames]: string }) {
    const entries = Object.entries(synths);
    await asyncForEach(entries, async ([name, synth]) => {
      const core = D2CoreV1.at(this.wallet, synth);
      const oracle = IOracle.at(this.wallet, await core.getCurrentOracle());
      const collateral = TestToken.at(this.wallet, await core.getCollateralAsset());
      const synthetic = SyntheticToken.at(this.wallet, await core.getSyntheticAsset());

      this.synths[name] = {
        core,
        oracle,
        collateral,
        synthetic,
      };
    });
  }

  public availableSynths(): Synth[] {
    return Object.values(this.synths);
  }

  async openPosition(
    collateralAmount: BigNumberish,
    borrowAmount: BigNumber,
    caller: Signer = this.wallet,
    synth: Synth = this.availableSynths()[0],
    overrides: TransactionOverrides = {},
  ) {
    const contract = await this.getCore(synth, caller);
    const tx = await contract.operateAction(
      Operation.Open,
      {
        id: 0,
        amountOne: collateralAmount,
        amountTwo: borrowAmount,
      },
      overrides,
    );

    return await this.parseActionTx(tx);
  }

  async borrow(
    positionId: BigNumberish,
    collateralAmount: BigNumberish,
    borrowAmount: BigNumberish,
    caller: Signer = this.wallet,
    synth: Synth = this.availableSynths()[0],
    overrides: TransactionOverrides = {},
  ) {}

  async repay(
    positionId: BigNumberish,
    repaymentAmount: BigNumberish,
    withdrawAmount: BigNumberish,
    caller: Signer = this.wallet,
    synth: Synth = this.availableSynths()[0],
    overrides: TransactionOverrides = {},
  ) {
    const contract = await this.getCore(synth, caller);
    const tx = await contract.operateAction(
      Operation.Repay,
      {
        id: 0,
        amountOne: repaymentAmount,
        amountTwo: withdrawAmount,
      },
      overrides,
    );

    return await this.parseActionTx(tx);
  }

  async liquidatePosition(
    positionId: BigNumberish,
    caller: Signer = this.wallet,
    synth: Synth = this.availableSynths()[0],
    overrides: TransactionOverrides = {},
  ) {}

  async parseActionTx(tx: any) {
    const receipt = await tx.wait();
    const logs = parseLogs(receipt.logs, D2CoreV1.ABI);
    const log = logs[0];

    const position = {
      owner: log.values.updatedPosition[0],
      collateralAmount: {
        sign: log.values.updatedPosition[1][0],
        value: log.values.updatedPosition[1][1],
      },
      borrowedAmount: {
        sign: log.values.updatedPosition[2][0],
        value: log.values.updatedPosition[2][1],
      },
    } as Position;

    const result = {
      operation: log.values.operation,
      params: {
        id: log.values.params[0],
        amountOne: log.values.params[1],
        amountTwo: log.values.params[2],
      },
      updatedPosition: position,
    } as ActionOperated;

    return result;
  }

  async getCore(synth: Synth, caller?: Signer) {
    return await D2CoreV1.at(caller || this.wallet, synth.core.address);
  }
}
