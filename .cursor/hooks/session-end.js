#!/usr/bin/env node
const { readStdin, hookEnabled } = require('./adapter');
readStdin().then(raw => {
  try {
    if (hookEnabled('session:end:marker', ['minimal', 'standard', 'strict'])) {
      console.error('[AGI] Session ended');
    }
  } catch {}
  process.stdout.write(raw);
}).catch(() => process.exit(0));
