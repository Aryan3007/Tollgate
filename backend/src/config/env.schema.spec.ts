import { loadEnv } from './env.schema.js';

const required = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  KEY_PEPPER: 'p'.repeat(32),
  JWT_ACCESS_SECRET: 's'.repeat(32),
};

describe('loadEnv', () => {
  it('treats blank values as unset so defaults apply', () => {
    const env = loadEnv({ ...required, PORT: '', SWAGGER_UI_ENABLED: '', PROVIDER_KEY_OPENAI: '' });

    expect(env.PORT).toBe(4000);
    expect(env.SWAGGER_UI_ENABLED).toBeUndefined();
    expect(env.PROVIDER_KEY_OPENAI).toBeUndefined();
  });

  it('fails fast when a required value is missing', () => {
    expect(() => loadEnv({ ...required, KEY_PEPPER: '' })).toThrow(/KEY_PEPPER/);
  });

  it('requires a vault URL when the Azure secret store is selected', () => {
    expect(() => loadEnv({ ...required, SECRET_STORE: 'azure' })).toThrow(/AZURE_KEYVAULT_URL/);
  });

  it('splits CORS origins on commas', () => {
    expect(loadEnv({ ...required, CORS_ORIGINS: 'https://a.dev, https://b.dev' }).CORS_ORIGINS).toEqual([
      'https://a.dev',
      'https://b.dev',
    ]);
  });
});
