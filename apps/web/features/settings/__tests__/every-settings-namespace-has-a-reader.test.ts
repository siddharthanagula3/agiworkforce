import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every settings namespace the client writes, and the consumer that acts on it.
 *
 * Three namespaces were found writing into the void in a single day — 'general'
 * (preferred name, work description), 'personalization' (mobile's style preset
 * and sliders), and historically the removed rememberChats and locationMetadata
 * switches. In every case a settings screen collected a preference and nothing
 * read it, which is invisible from the UI: the control saves, the save
 * succeeds, and the product ignores it.
 *
 * A namespace added without an entry here fails this test, forcing the question
 * "what reads it?" when it is written rather than months later.
 */
interface NamespaceConsumer {
  /** File that acts on the preference. */
  file: string;
  /**
   * The token that file uses to reach the value. Usually the namespace itself;
   * `privacy` is different and the difference matters — see below.
   */
  token?: string;
}

const NAMESPACE_CONSUMERS: Readonly<Record<string, NamespaceConsumer>> = {
  capabilities: { file: 'lib/services/managed-memory-context-service.ts' },
  general: { file: 'lib/server/user-identity.ts' },
  // Read on the path that assembles a completion's tool list, so the denial
  // reaches every route that resolves connector permissions through it.
  lockdown: {
    file: 'app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts',
    token: 'parseLockdownEnabled',
  },
  memory: { file: 'lib/services/managed-memory-context-service.ts' },
  notifications: { file: 'lib/services/schedule-notification-service.ts' },
  personalization: { file: 'lib/server/user-identity.ts' },
  // Sentry is a browser SDK and initialises before React mounts, so it cannot
  // fetch the synced namespace itself. The root layout now reads it
  // server-side (lib/server/telemetry-consent.ts) and renders it onto <html>
  // before hydration; PrivacySection also writes a localStorage mirror as the
  // fallback for the rare case that attribute carries no signal. Fixed
  // 2026-08-24 — see WEB-TELEMETRY-CONSENT-NOT-CROSS-DEVICE-01.
  privacy: { file: 'lib/sentry-shared.ts', token: 'agi.privacy.shareTelemetry' },
  safety: { file: 'lib/services/managed-content-safety-service.ts' },
  security: { file: 'lib/server/device-signin-policy.ts' },
};

function namespacesWrittenByTheClient(): string[] {
  const out = execFileSync(
    'grep',
    [
      '-rhoE',
      "NAMESPACE = '[a-zA-Z]+'|PREF_NAMESPACE = '[a-zA-Z]+'",
      '--include=*.ts',
      '--include=*.tsx',
      'features',
      'app',
      'shared',
    ],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  const found = new Set<string>();
  for (const match of out.matchAll(/'([a-zA-Z]+)'/g)) found.add(match[1] as string);
  return [...found].sort();
}

describe('every settings namespace the client writes has something that reads it', () => {
  it('finds the namespaces at all, so a rename cannot make this vacuous', () => {
    expect(namespacesWrittenByTheClient().length).toBeGreaterThanOrEqual(6);
  });

  it('has a declared consumer for each one', () => {
    const undeclared = namespacesWrittenByTheClient().filter((ns) => !NAMESPACE_CONSUMERS[ns]);

    expect(
      undeclared,
      `settings namespace(s) with no declared consumer: ${undeclared.join(', ')}. ` +
        'Name what reads it, or do not collect it — a preference nothing reads is a control that lies.',
    ).toEqual([]);
  });

  it('points every declared consumer at a file that exists', () => {
    for (const [ns, consumer] of Object.entries(NAMESPACE_CONSUMERS)) {
      expect(
        existsSync(join(process.cwd(), consumer.file)),
        `${ns} -> missing ${consumer.file}`,
      ).toBe(true);
    }
  });

  it('has each declared consumer actually mention its namespace', () => {
    for (const [ns, consumer] of Object.entries(NAMESPACE_CONSUMERS)) {
      const source = readFileSync(join(process.cwd(), consumer.file), 'utf8');
      const token = consumer.token ?? ns;
      expect(source, `${consumer.file} never mentions '${token}'`).toContain(token);
    }
  });
});
