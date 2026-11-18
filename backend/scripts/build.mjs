// Compiles src/ to dist/ and copies the non-TypeScript assets the app needs
// at runtime (the Redis Lua scripts).
import { spawnSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';

rmSync('dist', { recursive: true, force: true });

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);

cpSync('src/infra/redis/lua', 'dist/infra/redis/lua', { recursive: true });
