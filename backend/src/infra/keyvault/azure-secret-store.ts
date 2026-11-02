import { Injectable } from '@nestjs/common';
import type { SecretClient } from '@azure/keyvault-secrets';
import { ProviderNotConfiguredError } from '../../common/errors/gateway-error.js';
import { SecretStore, type ProviderSecretName } from './secret-store.js';

const TTL_MS = 5 * 60_000;

/** Key Vault secret names: `provider-openai`, `provider-anthropic`, `provider-groq`. */
export const secretNameFor = (name: ProviderSecretName) => `provider-${name}`;

/**
 * Provider keys live only in Key Vault. They are cached in memory for a few
 * minutes so the hot path never waits on Azure; rotating a key in the vault
 * takes effect within the TTL.
 */
@Injectable()
export class AzureSecretStore extends SecretStore {
  private readonly cache = new Map<
    ProviderSecretName,
    { value: string; at: number }
  >();
  private readonly inflight = new Map<ProviderSecretName, Promise<string>>();

  constructor(private readonly client: Pick<SecretClient, 'getSecret'>) {
    super();
  }

  getProviderKey(name: ProviderSecretName): Promise<string> {
    const cached = this.cache.get(name);
    if (cached && Date.now() - cached.at < TTL_MS) {
      return Promise.resolve(cached.value);
    }

    // Concurrent cache misses share one Key Vault call.
    let pending = this.inflight.get(name);
    if (!pending) {
      pending = this.fetch(name).finally(() => this.inflight.delete(name));
      this.inflight.set(name, pending);
    }
    return pending;
  }

  private async fetch(name: ProviderSecretName): Promise<string> {
    let value: string | undefined;
    try {
      value = (await this.client.getSecret(secretNameFor(name))).value;
    } catch (err) {
      const stale = this.cache.get(name);
      // Keep serving the last known key through a Key Vault blip.
      if (stale) return stale.value;
      if ((err as { statusCode?: number }).statusCode === 404) {
        throw new ProviderNotConfiguredError(name);
      }
      throw err;
    }
    if (!value) throw new ProviderNotConfiguredError(name);

    this.cache.set(name, { value, at: Date.now() });
    return value;
  }
}
