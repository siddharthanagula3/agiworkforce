#!/usr/bin/env node
const { readStdin } = require('./adapter');
const { execFileSync } = require('child_process');
const path = require('path');

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

    // console.log warning for production code
    if (/\.(ts|tsx|js|jsx)$/.test(filePath) && !/\.(test|spec|__tests__)/.test(filePath)) {
      try {
        const fs = require('fs');
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const consoleLogs = lines.reduce((acc, line, i) => {
          if (/\bconsole\.log\b/.test(line) && !/\/\//.test(line.split('console.log')[0])) {
            acc.push(i + 1);
          }
          return acc;
        }, []);
        if (consoleLogs.length > 0) {
          console.error(`[AGI] WARNING: console.log found in ${path.basename(filePath)} at line(s): ${consoleLogs.join(', ')}`);
          console.error('[AGI] Remove console.log before committing production code');
        }
      } catch {
        // File read failed — not critical
      }
    }
  } catch {}
  process.stdout.write(raw);
}).catch(() => process.exit(0));
