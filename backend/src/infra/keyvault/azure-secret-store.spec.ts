import { ProviderNotConfiguredError } from '../../common/errors/gateway-error.js';
import { AzureSecretStore } from './azure-secret-store.js';

function fakeClient(impl: (name: string) => Promise<{ value?: string }>) {
  const getSecret = vi.fn(impl);
  return { client: { getSecret } as never, getSecret };
}

describe('AzureSecretStore', () => {
  afterEach(() => vi.useRealTimers());

  it('reads the provider key from the provider-<name> secret', async () => {
    const { client, getSecret } = fakeClient(() => Promise.resolve({ value: 'sk-live' }));

    await expect(new AzureSecretStore(client).getProviderKey('openai')).resolves.toBe('sk-live');
    expect(getSecret).toHaveBeenCalledWith('provider-openai');
  });

  it('serves repeat and concurrent reads from one Key Vault call', async () => {
    const { client, getSecret } = fakeClient(() => Promise.resolve({ value: 'sk-live' }));
    const store = new AzureSecretStore(client);

    await Promise.all([store.getProviderKey('groq'), store.getProviderKey('groq')]);
    await store.getProviderKey('groq');

    expect(getSecret).toHaveBeenCalledTimes(1);
  });

  it('refetches after the cache TTL', async () => {
    vi.useFakeTimers();
    const { client, getSecret } = fakeClient(() => Promise.resolve({ value: 'sk-live' }));
    const store = new AzureSecretStore(client);

    await store.getProviderKey('openai');
    vi.advanceTimersByTime(5 * 60_000 + 1);
    await store.getProviderKey('openai');

    expect(getSecret).toHaveBeenCalledTimes(2);
  });

  it('keeps serving the last key when Key Vault fails after the TTL', async () => {
    vi.useFakeTimers();
    let fail = false;
    const { client } = fakeClient(() =>
      fail ? Promise.reject(new Error('vault down')) : Promise.resolve({ value: 'sk-live' }),
    );
    const store = new AzureSecretStore(client);

    await store.getProviderKey('openai');
    fail = true;
    vi.advanceTimersByTime(5 * 60_000 + 1);

    await expect(store.getProviderKey('openai')).resolves.toBe('sk-live');
  });

  it('reports a missing secret as an unconfigured provider', async () => {
    const { client } = fakeClient(() =>
      Promise.reject(Object.assign(new Error('not found'), { statusCode: 404 })),
    );

    await expect(new AzureSecretStore(client).getProviderKey('anthropic')).rejects.toBeInstanceOf(
      ProviderNotConfiguredError,
    );
  });
});
