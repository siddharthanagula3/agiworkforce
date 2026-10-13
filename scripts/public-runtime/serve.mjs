import { pathToFileURL } from 'node:url';
import { startPublicHttpBridge } from './http-bridge.mjs';

await startPublicHttpBridge();
await import(pathToFileURL('/app/apps/web/server.js').href);
