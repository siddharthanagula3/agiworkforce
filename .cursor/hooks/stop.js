#!/usr/bin/env node
const { readStdin, hookEnabled } = require('./adapter');
const fs = require('fs');
const path = require('path');

readStdin().then(raw => {
  try {
    const input = JSON.parse(raw || '{}');

    // console.log audit on all modified files
    if (hookEnabled('stop:check-console-log', ['standard', 'strict'])) {
      const modifiedFiles = input.modified_files || input.files || [];
      const warnings = [];

      for (const filePath of modifiedFiles) {
        if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) continue;
        if (/\.(test|spec|__tests__)/.test(filePath)) continue;

        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (/\bconsole\.log\b/.test(lines[i]) && !/\/\//.test(lines[i].split('console.log')[0])) {
              warnings.push(`  ${path.basename(filePath)}:${i + 1}`);
            }
          }
        } catch {
          // File might not exist anymore
        }
      }

      if (warnings.length > 0) {
        console.error('[AGI] WARNING: console.log found in modified files:');
        warnings.forEach(w => console.error(w));
        console.error('[AGI] Remove console.log before committing');
      }
    }

    if (hookEnabled('stop:session-end', ['minimal', 'standard', 'strict'])) {
      console.error('[AGI] Session complete');
    }
  } catch {}

  process.stdout.write(raw);
}).catch(() => process.exit(0));
