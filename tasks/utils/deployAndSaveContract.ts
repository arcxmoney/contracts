import { writeToDeployments } from './writeToDeployments';
import { yellow, gray, green, red, magenta } from 'chalk';
import { loadContracts } from '../../deployments/src/loadContracts';
import { DeployContractParams, NetworkParams } from '../../deployments/types';

export async function deployAndSaveContract(
  deployParams: DeployContractParams,
  networkParams: NetworkParams,
  confirmations?: number,
) {
  // Ignore source since it may vary based on the network
  const existing = loadContracts({
    network: networkParams.network,
    source: deployParams.source,
    name: deployParams.name,
    type: deployParams.type,
    group: deployParams.group,
    version: deployParams.version,
  });

  const tx = deployParams.data;

  if (networkParams.gasPrice !== 'auto') {
    tx.gasLimit = networkParams.gasLimit || deployParams.data.gasLimit;
    tx.gasPrice = networkParams.gasPrice || deployParams.data.gasPrice;
  }

  const details = `${deployParams.name} | ${deployParams.source} | ${
    deployParams.group || 'no-group'
  }`;

  if (existing.length) {
    console.log(magenta(`Contract already exists: ${details}`));
    return existing[0].address;
  }

  console.log(yellow(`* Deploying: ${details}`));
  const signedTx = await networkParams.signer.sendTransaction(tx);
  await signedTx.wait();

  console.log(gray(`* Sending tx: ${signedTx.hash}`));

  try {
    const receipt = await signedTx.wait(confirmations);
    console.log(green(`Deployed: ${details}\n`));

    writeToDeployments({
      name: deployParams.name,
      source: deployParams.source,
      address: receipt.contractAddress,
      txn: signedTx.hash,
      network: networkParams.network,
      version: deployParams.version,
      type: deployParams.type,
      group: deployParams.group || '',
    });

    console.log(
      green(
        `${deployParams.source} contract deployed at ${receipt.contractAddress}`,
      ),
    );

    return receipt.contractAddress;
  } catch {
    console.log(red(`Failed to deploy: ${details}\n`));
    return;
  }
}
