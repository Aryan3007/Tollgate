import type { Env } from '../../config/env.schema.js';
import { ProviderNotConfiguredError } from '../../common/errors/gateway-error.js';
import { SecretStore, type ProviderSecretName } from './secret-store.js';

export class EnvSecretStore extends SecretStore {
  private readonly keys: Record<ProviderSecretName, string | undefined>;

  constructor(env: Env) {
    super();
    this.keys = {
      openai: env.PROVIDER_KEY_OPENAI,
      anthropic: env.PROVIDER_KEY_ANTHROPIC,
      groq: env.PROVIDER_KEY_GROQ,
    };
  }

  getProviderKey(name: ProviderSecretName): Promise<string> {
    const key = this.keys[name];
    if (!key) return Promise.reject(new ProviderNotConfiguredError(name));
    return Promise.resolve(key);
  }
}
