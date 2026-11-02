export type ProviderSecretName = 'openai' | 'anthropic' | 'groq';

/** Abstract class (not interface) so Nest can use it as an injection token. */
export abstract class SecretStore {
  abstract getProviderKey(name: ProviderSecretName): Promise<string>;
}
