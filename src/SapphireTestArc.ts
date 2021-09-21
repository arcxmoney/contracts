import { BigNumberish, Signer } from 'ethers';
import { SapphireArc } from './SapphireArc';
import { MockSapphireCoreV1__factory } from './typings/MockSapphireCoreV1__factory';
import { MockSapphireOracle__factory } from './typings/MockSapphireOracle__factory';

export class SapphireTestArc extends SapphireArc {
  static new(signer: Signer): SapphireTestArc {
    return new SapphireTestArc(signer);
  }

  public synth() {
    return this.getSynth(this.getSynthNames()[0]);
  }

  public async updatePrice(price: BigNumberish) {
    const mockOracle = new MockSapphireOracle__factory(this.signer).attach(
      this.synth().oracle.address,
    );
    await mockOracle.setPrice(price);
  }

  public async updateTime(value: BigNumberish) {
    const mockArc = new MockSapphireCoreV1__factory(this.signer).attach(
      this.synth().core.address,
    );
    await mockArc.setCurrentTimestamp(value);

    // Set the timestamp of the oracle
    await this.setOracleTimestamp(value);
  }

  public async setOracleTimestamp(value: BigNumberish) {
    const mockOracle = new MockSapphireOracle__factory(this.signer).attach(
      await this.synth().core.oracle(),
    );
    await mockOracle.setTimestamp(value);
  }

  public getSynthTotals() {
    return this.synth().core.getTotals();
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
