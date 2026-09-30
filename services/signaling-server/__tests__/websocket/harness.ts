import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (typeof address === 'string' || address === null) {
        probe.close(() => reject(new Error('no port')));
        return;
      }
      const { port } = address;
      probe.close(() => resolvePort(port));
    });
  });
}

export interface RunningServer {
  port: number;
  exitCode: () => number | null;
  stop: () => void;
}

export async function startServer(overrides: Record<string, string>): Promise<RunningServer> {
  const port = await freePort();
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  delete env['ALLOWED_ORIGINS'];
  delete env['TRUST_PROXY'];
  delete env['ADMIN_API_KEY'];
  delete env['SIGNALING_INTERNAL_SECRET'];
  Object.assign(
    env,
    {
      NODE_ENV: 'production',
      PORT: String(port),
      SIGNALING_PORT: String(port),
      SIGNALING_HOST: '127.0.0.1',
      SIGNALING_WS_PATH: '/ws',
      NEON_DATABASE_URL: 'postgresql://test:test@127.0.0.1:54321/test',
    },
    overrides,
  );

  const child: ChildProcessWithoutNullStreams = spawn(
    resolve(serviceRoot, 'node_modules/.bin/tsx'),
    ['src/index.ts'],
    { cwd: serviceRoot, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.stdout.on('data', () => {});

  const deadline = Date.now() + 20000;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`signaling server exited early (${child.exitCode}): ${stderr}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/live`);
      if (response.status === 200) break;
    } catch {
      /* not listening yet */
    }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`signaling server never came up: ${stderr}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  return { port, exitCode: () => child.exitCode, stop: () => child.kill('SIGKILL') };
}
