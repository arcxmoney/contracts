import { Signer, Wallet } from 'ethers';

import { MozartArc } from './MozartArc';
import { BigNumberish } from 'ethers';
import { MockOracleFactory } from '@typings/MockOracleFactory';
import { MockMozartV1Factory } from './typings/MockMozartV1Factory';

export class MozartTestArc extends MozartArc {
  static async init(signer: Signer): Promise<MozartTestArc> {
    const arc = new MozartTestArc();
    arc.signer = signer;
    arc.signerAddress = await signer.getAddress();
    return arc;
  }

  // async deployTestArc() {
  //   const mockCore = await MockD2CoreV1.deploy(this.signer);

  //   const collateralAsset = await TestToken.deploy(this.signer, 'TestCollateral', 'TEST');

  //   let syntheticAsset = await SyntheticTokenV1.deploy(this.signer);

  //   const syntheticProxy = await ArcProxy.deploy(
  //     this.signer,
  //     syntheticAsset.address,
  //     this.signerAddress,
  //     [],
  //   );
  //   syntheticAsset = await SyntheticTokenV1.at(this.signer, syntheticProxy.address);

  //   const oracle = await MockOracle.deploy(this.signer);
  //   const coreProxy = await ArcProxy.deploy(this.signer, mockCore.address, this.signerAddress, []);

  //   let core = await D2CoreV1.at(this.signer, coreProxy.address);

  //   await core.init(
  //     collateralAsset.address,
  //     syntheticAsset.address,
  //     oracle.address,
  //     await this.signer.getAddress(),
  //     { value: 0 },
  //     { value: 0 },
  //     { value: 0 },
  //     { value: 0 },
  //   );

  //   await syntheticAsset.addMinter(core.address, MAX_UINT256);

  //   await this.addSynths({ ETHX: core.address });
  // }

  public synth() {
    return this.availableSynths()[0];
  }

  public async updatePrice(price: BigNumberish) {
    const mockOracle = await new MockOracleFactory(this.signer).attach(this.synth().oracle.address);
    await mockOracle.setPrice({ value: price });
  }

  public async updateTime(value: BigNumberish) {
    const mockArc = await new MockMozartV1Factory(this.signer).attach(this.synth().core.address);
    await mockArc.setCurrentTimestamp(value);
  }

  public async getSynthTotals() {
    return await this.synth().core.getTotals();
  }

  public async getPosition(id: BigNumberish) {
    return await this.synth().core.getPosition(id);
  }

  public core() {
    return this.synth().core;
  }

  public synthetic() {
    return this.synth().synthetic;
  }

  public collateral() {
    return this.synth().collateral;
  }

  public coreAddress() {
    return this.synth().core.address;
  }

  public syntheticAddress() {
    return this.synth().synthetic.address;
  }
}
