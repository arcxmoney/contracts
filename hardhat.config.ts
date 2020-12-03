import fs from 'fs';

import { HardhatUserConfig } from 'hardhat/config';
import { BigNumber } from 'ethers';
import { removeConsoleLog } from 'hardhat-preprocessor';
import { privateKeys } from './test/helpers/generatedWallets';

import 'hardhat-preprocessor';
import 'hardhat-spdx-license-identifier';
import 'hardhat-contract-sizer';
import 'hardhat-typechain';
import 'hardhat-watcher';

import 'solidity-coverage';

import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';

import './tasks/type-extensions';

if (fs.existsSync('src/typings/BaseErc20Factory.ts')) {
  /* eslint-disable @typescript-eslint/no-var-requires */
  require('./tasks');
}

require('dotenv').config({ path: '.env' }).parsed;

export const params = {
  testnet_private_key: process.env.TESTNET_DEPLOY_PRIVATE_KEY || '',
  deploy_private_key: process.env.DEPLOY_PRIVATE_KEY || '',
  infura_key: process.env.INFURA_PROJECT_ID || '',
  etherscan_key: process.env.ETHERSCAN_KEY || '',
};

export function getNetworkUrl(network: string) {
  return `https://${network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`;
}

const HUNDRED_THOUSAND_ETH = BigNumber.from(100000).pow(18).toString();

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  solidity: {
    version: '0.5.16',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  networks: {
    hardhat: {
      hardfork: 'istanbul',
      blockGasLimit: 12500000,
      accounts: privateKeys.map((key) => {
        return {
          privateKey: key,
          balance: HUNDRED_THOUSAND_ETH,
        };
      }),
    },
    local: {
      url: 'http://127.0.0.1:8545',
      users: {
        owner: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
      },
    },
    coverage: {
      url: 'http://127.0.0.1:8555', // Coverage launches its own ganache-cli client
    },
    rinkeby: {
      url: getNetworkUrl('rinkeby'),
      accounts: [params.testnet_private_key],
      gasPrice: 1000000000,
      users: {
        owner: '0xa8C01EfD74A206Bb2d769b6b3a5759508c83F20C',
      },
    },
    kovan: {
      url: getNetworkUrl('kovan'),
      accounts: [params.testnet_private_key],
      gasPrice: 1000000000,
      users: {
        owner: '0xa8C01EfD74A206Bb2d769b6b3a5759508c83F20C',
      },
    },
    mainnet: {
      url: getNetworkUrl('mainnet'),
      accounts: [params.deploy_private_key],
      gasPrice: 40000000000,
      users: {
        owner: '0x62f31e08e279f3091d9755a09914df97554eae0b',
      },
    },
  },
  etherscan: {
    apiKey: params.etherscan_key,
  },
  typechain: {
    outDir: './src/typings',
    target: 'ethers-v5',
  },
  // watcher: {
  //   compilation: {
  //     tasks: ["compile"],
  //     files: ["./contracts"],
  //     verbose: true,
  //   },
  //   ci: {
  //     tasks: ["clean", { command: "compile", params: { quiet: true } }, { command: "test", params: { noCompile: true, testFiles: ["./.ts"] } } ],
  //   }
  // },
};

export default config;
