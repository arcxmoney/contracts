import { MockProvider } from '@ethereum-waffle/provider';
import { BigNumber } from '@ethersproject/bignumber';
import { WstEthOracle } from '@src/typings/WstEthOracle';
import { WstEthOracleFactory } from '@src/typings/WstEthOracleFactory';
import { expect } from 'chai';

describe('WstEthOracle', () => {
  let oracle: WstEthOracle;

  before(async () => {
    const provider = new MockProvider({
      ganacheOptions: {
        fork: process.env.GANACHE_FORK_URL,
        fork_block_number: 12025602,
      },
    });
    const signer = await provider.getSigner();

    oracle = await new WstEthOracleFactory(signer).deploy();
  });

  it('should give the correct price', async () => {
    const price = await oracle.fetchCurrentPrice();
    // $1724.70
    expect(price.value).to.eq(BigNumber.from('1724700091306820052052'));
  });
});