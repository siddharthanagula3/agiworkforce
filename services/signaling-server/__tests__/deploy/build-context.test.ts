import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../../../..');
const workflow = parse(
  readFileSync(path.join(root, '.github/workflows/deploy-signaling-server.yml'), 'utf8'),
);

describe('deployment build contexts', () => {
  it('passes the root context to the image builder', () => {
    const step = workflow.jobs.build.steps.find(
      (candidate: { id?: string }) => candidate.id === 'build',
    );
    expect(step.with.context).toBe('.');
    expect(step.with.file).toBe('${{ env.SERVICE_DIR }}/Dockerfile');
  });

  it.each([
    ['deploy-fly', 'Deploy to Fly.io', 'flyctl'],
    ['deploy-railway', 'Deploy to Railway', 'railway'],
  ])(
    'executes %s with the repository root and its explicit service configuration',
    (job, name, cli) => {
      const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), 'relay-deploy-context-')));
      try {
        const service = path.join(temporary, 'services/signaling-server');
        const bin = path.join(temporary, 'bin');
        mkdirSync(service, { recursive: true });
        mkdirSync(bin);
        writeFileSync(path.join(temporary, 'pnpm-lock.yaml'), 'lockfile fixture');
        for (const file of ['Dockerfile', 'fly.toml', 'railway.toml']) {
          writeFileSync(
            path.join(service, file),
            readFileSync(path.join(root, 'services/signaling-server', file)),
          );
        }
        mkdirSync(path.join(service, 'scripts'));
        writeFileSync(
          path.join(service, 'scripts/check-fly-machines.mjs'),
          readFileSync(path.join(root, 'services/signaling-server/scripts/check-fly-machines.mjs')),
        );
        writeFileSync(
          path.join(bin, cli),
          `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'machine' && args[1] === 'list') process.stdout.write(JSON.stringify([{id:'fixture',state:'started'}]));
else fs.writeFileSync(process.env.RELAY_CAPTURE, JSON.stringify({cwd:process.cwd(),args}));
`,
          { mode: 0o755 },
        );
        const step = workflow.jobs[job].steps.find(
          (candidate: { name?: string }) => candidate.name === name,
        );
        const script = step.run.replaceAll('${{ env.SERVICE_DIR }}', 'services/signaling-server');
        const capture = path.join(temporary, 'capture.json');
        execFileSync('/bin/bash', ['-eu', '-c', script], {
          cwd: temporary,
          env: { ...process.env, PATH: `${bin}:${process.env['PATH']}`, RELAY_CAPTURE: capture },
        });
        const call = JSON.parse(readFileSync(capture, 'utf8'));
        expect(call.cwd).toBe(temporary);
        if (cli === 'flyctl') {
          expect(call.args.slice(0, 2)).toEqual(['deploy', '.']);
          for (const [option, expected] of [
            ['--config', 'services/signaling-server/fly.toml'],
            ['--dockerfile', 'services/signaling-server/Dockerfile'],
          ]) {
            expect(call.args[call.args.indexOf(option) + 1]).toBe(expected);
            expect(readFileSync(path.join(call.cwd, expected), 'utf8').length).toBeGreaterThan(0);
          }
        } else {
          expect(readFileSync(path.join(temporary, 'railway.toml'), 'utf8')).toContain(
            'builder = "DOCKERFILE"',
          );
        }
      } finally {
        rmSync(temporary, { recursive: true, force: true });
      }
    },
  );
});
