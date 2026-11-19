import { describe, expect, it } from 'vitest';
import {
  SUPPORT_ABSTENTION_REASONS,
  SUPPORT_HISTORY_LIMIT,
  SUPPORT_MAX_HISTORY_TURN_LENGTH,
  SUPPORT_MAX_QUESTION_LENGTH,
  SupportAskRequestSchema,
  describeDiagnostics,
  supportDiagnosticsSchema,
} from '../support';

const turn = (content: string) => ({ role: 'user' as const, content });

describe('SupportAskRequestSchema', () => {
  it('holds a support question to a length a pasted program does not fit in', () => {
    expect(SUPPORT_MAX_QUESTION_LENGTH).toBe(600);
    expect(
      SupportAskRequestSchema.safeParse({
        message: 'x'.repeat(SUPPORT_MAX_QUESTION_LENGTH),
        surface: 'app',
      }).success,
    ).toBe(true);
    expect(
      SupportAskRequestSchema.safeParse({
        message: 'x'.repeat(SUPPORT_MAX_QUESTION_LENGTH + 1),
        surface: 'app',
      }).success,
    ).toBe(false);
  });

  it('rejects an empty question and an unknown surface', () => {
    expect(SupportAskRequestSchema.safeParse({ message: '   ', surface: 'app' }).success).toBe(
      false,
    );
    expect(SupportAskRequestSchema.safeParse({ message: 'hi', surface: 'desktop' }).success).toBe(
      false,
    );
  });

  it('accepts exactly the history the engine reads and nothing larger', () => {
    const atLimit = Array.from({ length: SUPPORT_HISTORY_LIMIT }, () =>
      turn('x'.repeat(SUPPORT_MAX_HISTORY_TURN_LENGTH)),
    );
    expect(
      SupportAskRequestSchema.safeParse({ message: 'hi', surface: 'app', history: atLimit })
        .success,
    ).toBe(true);

    expect(
      SupportAskRequestSchema.safeParse({
        message: 'hi',
        surface: 'app',
        history: [...atLimit, turn('one more')],
      }).success,
    ).toBe(false);
    expect(
      SupportAskRequestSchema.safeParse({
        message: 'hi',
        surface: 'app',
        history: [turn('x'.repeat(SUPPORT_MAX_HISTORY_TURN_LENGTH + 1))],
      }).success,
    ).toBe(false);
  });
});

describe('support abstention reasons', () => {
  it('names an out-of-scope refusal, once', () => {
    expect(SUPPORT_ABSTENTION_REASONS.filter((reason) => reason === 'out_of_scope')).toHaveLength(
      1,
    );
    expect(new Set(SUPPORT_ABSTENTION_REASONS).size).toBe(SUPPORT_ABSTENTION_REASONS.length);
  });
});
describe('supportDiagnosticsSchema client facts', () => {
  const bundle = {
    collectedAt: '2026-11-14T10:00:00.000Z',
    surface: 'mobile',
    appVersion: '0.0.1',
    releaseSha: null,
    deployEnv: null,
    platform: 'ios 26.1',
    locale: 'en-US',
    timeZone: 'America/New_York',
    viewport: { width: 402, height: 874 },
    online: true,
    pagePath: '/settings',
    conversationId: null,
    recentEvents: [],
  };

  it('accepts a bundle that names no build, device class or app mode', () => {
    expect(supportDiagnosticsSchema.safeParse(bundle).success).toBe(true);
  });

  it.each([
    { appBuild: '57', deviceClass: 'phone', appMode: 'local' },
    { appBuild: '9', deviceClass: 'tablet', appMode: 'cloud' },
    { appBuild: null, deviceClass: null, appMode: null },
  ])('accepts the facts feedback reports: %o', (facts) => {
    expect(supportDiagnosticsSchema.parse({ ...bundle, ...facts })).toMatchObject(facts);
  });

  it.each([
    { appBuild: 'x'.repeat(51) },
    { deviceClass: 'desktop' },
    { appMode: 'byok' },
    { appBuild: 57 },
  ])('refuses %o', (facts) => {
    expect(supportDiagnosticsSchema.safeParse({ ...bundle, ...facts }).success).toBe(false);
  });

  it('names the facts in the summary only when the surface reported them', () => {
    const named = describeDiagnostics(
      supportDiagnosticsSchema.parse({
        ...bundle,
        appBuild: '57',
        deviceClass: 'phone',
        appMode: 'cloud',
      }),
    );
    expect(named).toContain('app build: 57');
    expect(named).toContain('device: phone');
    expect(named).toContain('app mode: cloud');

    const unnamed = describeDiagnostics(supportDiagnosticsSchema.parse(bundle));
    expect(unnamed).not.toContain('app build:');
    expect(unnamed).not.toContain('device:');
    expect(unnamed).not.toContain('app mode:');
  });
});
