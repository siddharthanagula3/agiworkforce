/**
 * conversationSync.sync-rule.test — verify the /goal sync-rule is
 * runtime-enforced at the ConversationSyncService constructor.
 *
 * Before this verification (2026-05-22), `assertSurfaceCanSyncChats`
 * existed in @agiworkforce/types but was never called in production —
 * sync-rule violation would silently enrol a developer surface into
 * the chat-history realtime channel. Now the assertion fires at
 * construction time.
 */

import { describe, expect, it } from 'vitest';
import { ConversationSyncService } from '../conversationSync';

describe('ConversationSyncService — /goal sync-rule enforcement', () => {
  // Constructor short-circuits on the sync-rule assertion BEFORE touching
  // the ignored legacy constructor argument, so a stub is fine.
  const ignoredClient = {};

  it('accepts Web origin', () => {
    expect(() => new ConversationSyncService(ignoredClient, 'web')).not.toThrow();
  });

  it('accepts Desktop origin', () => {
    expect(() => new ConversationSyncService(ignoredClient, 'desktop')).not.toThrow();
  });

  it('accepts Mobile origin', () => {
    expect(() => new ConversationSyncService(ignoredClient, 'mobile')).not.toThrow();
  });

  it('rejects CLI origin (developer surface)', () => {
    expect(() => new ConversationSyncService(ignoredClient, 'cli' as never)).toThrow(
      /sync-rule violation/i,
    );
  });

  it('rejects VS Code origin (developer surface)', () => {
    expect(() => new ConversationSyncService(ignoredClient, 'vscode' as never)).toThrow(
      /sync-rule violation/i,
    );
  });

  it('rejects Chrome origin (developer surface)', () => {
    expect(() => new ConversationSyncService(ignoredClient, 'chrome' as never)).toThrow(
      /sync-rule violation/i,
    );
  });
});
