import { CoreConfig } from '@deployments/types';
import { gray, red, blue } from 'chalk';
import { constants, getPathToNetwork } from './config';

/*
 * Load Core Config
 */

export interface LoadConfigParams {
  network: string;
  key: string;
}

export async function loadCollateralConfig(params: LoadConfigParams) {
  return (await loadConfig(
    params,
    constants.COLLATERAL_CONFIG_FILENAME,
    'core',
  )) as CoreConfig;
}

async function loadConfig(
  params: LoadConfigParams,
  filename: string,
  type: string,
) {
  console.log(
    gray(`Loading the ${type} config for ${params.network.toUpperCase()}...`),
  );

  const configFile = getPathToNetwork(params.network, filename);
  const { default: config } = await import(configFile);

  if (!(params.key in config)) {
    console.log(red(`${params.key} does not exist in ${type} config`));
    return;
  }

  console.log(blue(`${params.key} config found!`));

  return config[params.key];
}
