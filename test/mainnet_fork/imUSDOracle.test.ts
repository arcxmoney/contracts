import { MockProvider } from '@ethereum-waffle/provider';
import { ImUSDOracle, ImUSDOracle__factory } from '@src/typings';
import { expect } from 'chai';

xdescribe('imUSDOracle', () => {
  let oracle: ImUSDOracle;

  before(async () => {
    const provider = new MockProvider({
      ganacheOptions: {
        fork: process.env.GANACHE_FORK_URL,
        fork_block_number: 12025602,
      },
    });
    const signer = await provider.getSigner();

    oracle = await new ImUSDOracle__factory(signer).deploy();
  });

  it('should give the correct price', async () => {
    const price = await oracle.fetchCurrentPrice();
    // $0.1
    expect(price.value).to.eq('104201492729410660');
  });
});
