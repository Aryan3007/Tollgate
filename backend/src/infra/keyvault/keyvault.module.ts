import { Module } from '@nestjs/common';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { APP_CONFIG } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { AzureSecretStore } from './azure-secret-store.js';
import { EnvSecretStore } from './env-secret-store.js';
import { SecretStore } from './secret-store.js';

@Module({
  providers: [
    {
      provide: SecretStore,
      inject: [APP_CONFIG],
      useFactory: (env: Env): SecretStore =>
        env.SECRET_STORE === 'azure'
          ? new AzureSecretStore(
              new SecretClient(env.AZURE_KEYVAULT_URL!, new DefaultAzureCredential()),
            )
          : new EnvSecretStore(env),
    },
  ],
  exports: [SecretStore],
})
export class KeyVaultModule {}
