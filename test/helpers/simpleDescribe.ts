import 'jest';

import { Wallet, ethers, providers } from 'ethers';
import { generatedWallets } from '../../src/utils/generatedWallets';
import { EVM } from './EVM';

export interface ITestContext {
  wallets?: Wallet[];
  evm?: EVM;
}

export type initFunction = (ctx: ITestContext) => Promise<void>;
export type testsFunction = (ctx: ITestContext) => void;

const provider = new ethers.providers.JsonRpcProvider();
const evm = new EVM(provider);

export default function simpleDescribe(
  name: string,
  init: initFunction,
  tests: testsFunction,
): void {
  // Note that the function passed into describe() should not be async.
  describe(name, () => {
    const ctx: ITestContext = {};

    let preInitSnapshotId: string;
    let postInitSnapshotId: string;

    // Runs before any before() calls made within the d1ArcDescribe() call.
    beforeAll(async () => {
      ctx.wallets = generatedWallets(provider);
      ctx.evm = evm;

      preInitSnapshotId = await evm.snapshot();

      await init(ctx);

      await evm.mineAvgBlock();

      postInitSnapshotId = await evm.snapshot();
    });

    // Runs before any beforeEach() calls made within the d1ArcDescribe() call.
    beforeEach(async () => {
      await evm.resetEVM(postInitSnapshotId);
    });

    // Runs before any after() calls made within the d1ArcDescribe() call.
    afterEach(async () => {
      await evm.resetEVM(postInitSnapshotId);
    });

    tests(ctx);
  });
}

function printGasUsage(label: string, value: number | string): void {
  console.log(`\t\t\x1b[33m${label} \x1b[93m${value}\x1b[0m`);
}
