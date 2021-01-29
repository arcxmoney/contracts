import { timeLog } from 'console';
import { ethers } from 'hardhat';

describe('ArcUniswapV2Oracle', () => {
  let oracle: ArcUniswapV2Oracle;

  before(async () => {
    const signer = await ethers.provider.getSigner();

    oracle = await new ArcUniswapV2OracleFactory(signer).deploy();
    console.log('oracle address:', oracle.address);
  });

  describe('#work', () => {
    xit('should not allow non-keeper to call work()', async () => {
      console.log('todo');
    });

    xit('should revert if work() is called before the window period', async () => {
      console.log('todo');
    });

    xit('should update all pairs', async () => {
      console.log('todo');
    });
  });

  describe('#addPair', () => {
    xit('should not allow non-owner to add a pair', async () => {
      console.log('todo');
    });

    xit('should revert if duplicate pair is added', async () => {
      console.log('todo');
    });

    xit('should revert if uniswap pair does not exist', async () => {
      console.log('todo');
    });

    xit('should add a uniswp pair', async () => {
      console.log('todo');
    });
  });

  describe('#getPairs', () => {
    xit('should not return any pair if none is added', async () => {
      console.log('todo');
    });

    xit('should return the pairs', async () => {
      console.log('todo');
    });
  });

  // TODO check out here how to remove pair https://ethereum.stackexchange.com/a/39302
  describe('#removePair', () => {
    xit('should not allow non-owner to remove a pair', async () => {
      console.log('todo');
    });

    xit('should revert if unknown pair is removed', async () => {
      console.log('todo');
    });

    xit('should remove a uniswap pair', async () => {
      console.log('todo');
    });

    xit('should not leave any gaps in the pairs array after removal', async () => {
      console.log('todo');
    });

    xit('should remove pair from pairObservations', async () => {
      console.log('todo');
    });
  });

  describe('#updatePair', () => {
    xit('should revert if pair is not known', async () => {
      console.log('todo');
    });

    xit('should return false if not within period window', async () => {
      console.log('todo');
    });

    xit('should return true if within the period window', async () => {
      console.log('todo');
    });
  });

  describe('#updateAll', () => {
    xit('should return false if no pairs are added', async () => {
      console.log('todo');
    });

    xit('should return true if updated at least one pair', async () => {
      console.log('todo');
    });

    xit('should update all pairs', async () => {
      console.log('todo');
    });
  });

  describe('#setPeriodWindow', () => {
    xit('should throw if caller is not owner', async () => {
      console.log('todo');
    });

    xit('should revert if window is 0', async () => {
      console.log('todo');
    });
  });

  describe('#work', () => {
    xit('should revoke if caller is not keeper', async () => {
      console.log('todo');
    });

    xit('should execute the work and receive the reward', async () => {
      console.log('todo');
    });
  });

  describe('#lastObservation', () => {
    xit('should return the last observation of a pair', async () => {
      console.log('todo');
    });
  });

  describe('#workable()', () => {
    xit('should return false if there are no known pairs', async () => {
      console.log('todo');
    });

    xit('should return false if there are no workable pairs', async () => {
      console.log('todo');
    });

    xit('should return true if there exists any workable pair', async () => {
      console.log('todo');
    });
  });

  describe('#workable(pair)', () => {
    xit('should false if the pair is not known', async () => {
      console.log('todo');
    });

    xit('should return false if the pair was updated in less than periodWindow', async () => {
      console.log('todo');
    });

    xit('should return treu if the pair was updated in more than periodWindow', async () => {
      console.log('todo');
    });
  });

  describe('#current', () => {
    xit('should revert if the pair was not updated within 2 period windows', async () => {
      console.log('todo');
    });

    xit('should return the correct price', async () => {
      console.log('todo');
    });
  });

  describe('#setPeriodWindow', () => {
    xit('should not set period if it is 0', async () => {
      console.log('todo');
    });

    xit('should revert if called by non-owner', async () => {
      console.log('todo');
    });

    xit('should set the period window', async () => {
      console.log('todo');
    });
  });

  describe('#quote', () => {
    xit('should revert if the last observation of the pair is bigger than the granularity * periodWindow', async () => {
      console.log('todo');
    });

    xit('should return the right quote', async () => {
      console.log('todo');
    });
  });
});
