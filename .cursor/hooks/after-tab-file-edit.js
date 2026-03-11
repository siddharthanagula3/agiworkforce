#!/usr/bin/env node
const { readStdin } = require('./adapter');
const { execFileSync } = require('child_process');

readStdin().then(raw => {
  try {
    const input = JSON.parse(raw);
    const filePath = input.path || input.file || '';

    // Auto-format with Prettier for TS/JS/CSS files
    if (/\.(ts|tsx|js|jsx|css|json)$/.test(filePath)) {
      try {
        execFileSync('npx', ['prettier', '--write', filePath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 10000,
          cwd: process.cwd(),
        });
      } catch {
        // Prettier not available or failed — not critical
      }
    }
  } catch {}
  process.stdout.write(raw);
}).catch(() => process.exit(0));
