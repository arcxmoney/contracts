import {
  SynthAdded as SynthAddedV1,
  SynthRegistry,
} from '../generated/SynthRegistry/SynthRegistry';

import { SynthAdded as SynthAddedV2 } from '../generated/SynthRegistryV2/SynthRegistryV2';

import {
  BaseERC20 as BaseERC20Template,
  StateV1 as StateV1Template,
  CoreV1 as CoreV1Template,
  MozartV1 as MozartV1Template,
} from '../generated/templates';

import { CoreV1 } from '../generated/templates/CoreV1/CoreV1';

import { log } from '@graphprotocol/graph-ts';
import { returnSynthVersion } from './constants';
import { BaseERC20 } from '../generated/SynthRegistry/BaseERC20';

export function synthV1Added(event: SynthAddedV1): void {
  let synthRegistryContract = SynthRegistry.bind(event.address);
  let synthDetails = synthRegistryContract.synthsByAddress(event.params.synth);

  let tokenContract = BaseERC20.bind(event.params.synth);
  let synthVersion = returnSynthVersion(tokenContract.name());

  if (synthVersion != 1) {
    return;
  }

  BaseERC20Template.create(event.params.synth);
  let proxyAddress = synthDetails.value1;

  log.info('Version indexing: 1', []);
  CoreV1Template.create(proxyAddress);
  let coreContract = CoreV1.bind(proxyAddress);
  let stateAddress = coreContract.state();
  StateV1Template.create(stateAddress);
}

export function synthV2Added(event: SynthAddedV2): void {
  log.info('Version indexing: 2', []);

  BaseERC20Template.create(event.params.synth);
  MozartV1Template.create(event.params.proxy);
}
