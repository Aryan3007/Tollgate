export type ProviderSecretName = 'openai' | 'anthropic' | 'groq';

/** Where provider API keys come from: env vars in development, Key Vault in production. */
export abstract class SecretStore {
  abstract getProviderKey(name: ProviderSecretName): Promise<string>;
}
