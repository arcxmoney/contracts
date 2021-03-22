import { Synth } from '@arc-types/core';
import { TransactionOverrides } from '@arc-types/ethereum';
import { BigNumber, BigNumberish, Signer } from 'ethers';
import { SapphireCoreV1 } from './typings';

export type SapphireSynth = Synth<SapphireCoreV1>;

export class SapphireArc {
  public synths: Record<string, SapphireSynth | undefined> = {};

  constructor(public readonly signer: Signer) {}
  static async new(signer: Signer): Promise<SapphireArc> {
    return new SapphireArc(signer);
  }

  getSynth(name: string): SapphireSynth {
    const synth = this.synths[name];
    if (!synth) {
      throw Error(`Synth '${name}' is not found`);
    }
    return synth;
  }

  getSynthNames() {
    return Object.keys(this.synths);
  }

  open(
    collateralAmount: BigNumberish,
    borrowAmount: BigNumber,
    synthName: string = this.getSynthNames()[0],
    creditScoreProof?: CreditScoreProof,
    caller: Signer = this.signer,
    overrides: TransactionOverrides = {},
  ) {}
}

interface CreditScoreProof {
  account: string,
  score: BigNumberish,
  merkleProof: string[],
}