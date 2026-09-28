import { loadConfig } from './config.ts';
import { refreshSignatures, startClamd, startFreshclam, type Daemon } from './daemons.ts';
import { log } from './log.ts';
import { createScannerServer } from './server.ts';

const LISTEN_HOST = '0.0.0.0';
const CLAMD = { host: '127.0.0.1', port: 3310 };
const SHUTDOWN_GRACE_MS = 15_000;

const config = loadConfig(process.env);
const server = createScannerServer({ tokens: config.tokens, clamd: CLAMD });
const daemons: Daemon[] = [];
let stopping = false;

function stop(code: number): void {
  if (stopping) return;
  stopping = true;
  log('info', 'stopping', { code });
  setTimeout(() => process.exit(code), SHUTDOWN_GRACE_MS).unref();
  server.close(() => {
    for (const daemon of daemons) daemon.stop();
    process.exit(code);
  });
}

process.once('SIGTERM', () => stop(0));
process.once('SIGINT', () => stop(0));

server.listen(config.port, LISTEN_HOST, () => log('info', 'listening', { port: config.port }));
await refreshSignatures();
if (!stopping) {
  daemons.push(
    startClamd(() => stop(1)),
    startFreshclam(),
  );
}
