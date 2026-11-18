import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import type { Env } from '../../config/env.schema.js';
import { AzureSecretStore } from './azure-secret-store.js';
import { EnvSecretStore } from './env-secret-store.js';
import type { SecretStore } from './secret-store.js';

/** Provider keys come from Azure Key Vault, or (development only) from env vars. */
export function createSecretStore(env: Env): SecretStore {
  return env.SECRET_STORE === 'azure'
    ? new AzureSecretStore(new SecretClient(env.AZURE_KEYVAULT_URL!, new DefaultAzureCredential()))
    : new EnvSecretStore(env);
}
