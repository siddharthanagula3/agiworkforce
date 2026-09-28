import { LOCAL_CLAMD } from './clamd.ts';
import { loadConfig } from './config.ts';
import {
  refreshSignatures,
  startClamd,
  startFreshclam,
  watchClamd,
  type Daemon,
} from './daemons.ts';
import { log } from './log.ts';
import { clamdProbe, createScannerServer } from './server.ts';

const LISTEN_HOST = '0.0.0.0';
const SHUTDOWN_GRACE_MS = 15_000;

const config = loadConfig(process.env);
const probe = clamdProbe(LOCAL_CLAMD);
const server = createScannerServer({ tokens: config.tokens, clamd: LOCAL_CLAMD, probe });
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
    watchClamd(
      async () => (await probe()).scanning,
      () => stop(1),
    ),
  );
}
