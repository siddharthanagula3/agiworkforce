#!/usr/bin/env node
const { readStdin, hookEnabled } = require('./adapter');
readStdin().then(raw => {
  try {
    if (hookEnabled('session:start', ['minimal', 'standard', 'strict'])) {
      console.error('[AGI] Session started — AGI Workforce (Tauri v2 + React + Rust monorepo)');
      console.error('[AGI] Stack: pnpm workspaces | Tauri v2 desktop | Next.js web | React Native mobile');
    }
  } catch {}
  process.stdout.write(raw);
}).catch(() => process.exit(0));
