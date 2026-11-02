import { parentPort, workerData } from 'node:worker_threads';
import { env, pipeline } from '@huggingface/transformers';

// Runs the embedding model off the main thread, so inference never blocks
// request handling. Protocol: parent sends { id, text }; this replies with
// { id, vector } or { id, error }, after a one-time { ready: true }.

interface WorkerConfig {
  model: string;
  cacheDir?: string;
}

const config = workerData as WorkerConfig;
if (config.cacheDir) env.cacheDir = config.cacheDir;

const port = parentPort!;

try {
  const extractor = await pipeline('feature-extraction', config.model, { dtype: 'fp32' });
  port.postMessage({ ready: true });

  port.on('message', async ({ id, text }: { id: number; text: string }) => {
    try {
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      const vector = new Float32Array(output.data as Float32Array);
      port.postMessage({ id, vector }, [vector.buffer]);
    } catch (err) {
      port.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
    }
  });
} catch (err) {
  port.postMessage({ fatal: err instanceof Error ? err.message : String(err) });
}
