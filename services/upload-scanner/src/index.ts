import { LOCAL_CLAMD } from './clamd.ts';
import { loadConfig, loadSourceScanConfig } from './config.ts';
import {
  CLAMD_CONFIG_FILE,
  refreshSignatures,
  startClamd,
  startFreshclam,
  watchClamd,
  writeSourceScanClamdConfig,
  type Daemon,
} from './daemons.ts';
import { log } from './log.ts';
import { clamdProbe, createScannerServer, livenessProbe } from './server.ts';
import { createSourceScanLiveness } from './source-scan.ts';

const LISTEN_HOST = '0.0.0.0';
const SHUTDOWN_GRACE_MS = 15_000;

const config = loadConfig(process.env);
const sourceScans = loadSourceScanConfig(process.env);
const clamdConfig = sourceScans ? writeSourceScanClamdConfig() : CLAMD_CONFIG_FILE;
const probe = clamdProbe(LOCAL_CLAMD);
const liveness = createSourceScanLiveness();
const health = livenessProbe(probe, liveness);
const server = createScannerServer({
  tokens: config.tokens,
  clamd: LOCAL_CLAMD,
  probe,
  liveness,
  sourceScans,
});
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

server.listen(config.port, LISTEN_HOST, () =>
  log('info', 'listening', { port: config.port, sourceScanProtocol: sourceScans ? 2 : 1 }),
);
await refreshSignatures();
if (!stopping) {
  daemons.push(
    startClamd(() => stop(1), clamdConfig),
    startFreshclam(),
    watchClamd(
      async () => (await health()).scanning,
      () => stop(1),
    ),
  );
}
