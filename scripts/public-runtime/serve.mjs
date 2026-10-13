import { pathToFileURL } from 'node:url';
import { appendFileSync, readFileSync } from 'node:fs';
import { startPublicHttpBridge } from './http-bridge.mjs';
import { observeProcessShutdown } from './shutdown.mjs';

const state = JSON.parse(readFileSync('/proof-input/state.json', 'utf8'));
let sequence = 0;
const record = (kind, value = {}) =>
  appendFileSync(
    '/proof-output/shutdown.jsonl',
    JSON.stringify({ sequence: sequence++, kind, ...value }) + '\n',
  );
record('observer-start', { runId: state.runId, stateId: state.stateId, pid: process.pid });
observeProcessShutdown(process, record, () => {});

await startPublicHttpBridge();
await import(pathToFileURL('/app/apps/web/server.js').href);
