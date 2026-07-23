import { describe, it, expect } from 'vitest';
import { mapProjectRow } from '../projects';

describe('mapProjectRow', () => {
  const baseLegacyRow = {
    id: 'proj-123',
    user_id: 'user-abc',
    name: 'Legacy Project',
    description: 'Pre-migration project',
    instructions: 'Be helpful',
    color: '#3b82f6',
    is_archived: false,
    metadata: { foo: 'bar' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  };

  it('maps a pre-migration row with round-10 defaults', () => {
    const mapped = mapProjectRow(baseLegacyRow);

    expect(mapped.id).toBe('proj-123');
    expect(mapped.ownerUserId).toBe('user-abc');
    expect(mapped.name).toBe('Legacy Project');
    expect(mapped.color).toBe('#3b82f6');
    expect(mapped.isArchived).toBe(false);
    expect(mapped.metadata).toEqual({ foo: 'bar' });

    // Round-10 defaults · these columns are absent pre-migration.
    expect(mapped.defaultPrivacyMode).toBe('managed');
    expect(mapped.defaultProviderMode).toBe('ManagedGateway');
    expect(mapped.allowedSurfaces).toEqual(['web', 'desktop', 'mobile']);
    expect(mapped.organizationId).toBeNull();
    expect(mapped.defaultModelId).toBeNull();
    expect(mapped.lastUsedAt).toBeNull();
    expect(mapped.iconEmoji).toBeNull();
    expect(mapped.accentColor).toBeNull();
    expect(mapped.importedFrom).toBeNull();
  });

  it('maps a post-migration row with all round-10 fields', () => {
    const mapped = mapProjectRow({
      ...baseLegacyRow,
      conversation_count: 2,
      organization_id: 'org-xyz',
      default_privacy_mode: 'managed',
      default_provider_mode: 'ManagedNative',
      allowed_surfaces: ['web', 'mobile'],
      default_model_id: 'claude-opus-4-8',
      last_used_at: '2026-05-20T12:00:00Z',
      icon_emoji: '🚀',
      accent_color: 'emerald',
      imported_from: 'claude',
    });

    expect(mapped.defaultPrivacyMode).toBe('managed');
    expect(mapped.defaultProviderMode).toBe('ManagedNative');
    expect(mapped.allowedSurfaces).toEqual(['web', 'mobile']);
    expect(mapped.organizationId).toBe('org-xyz');
    expect(mapped.defaultModelId).toBe('claude-opus-4-8');
    expect(mapped.lastUsedAt).toBe('2026-05-20T12:00:00Z');
    expect(mapped.iconEmoji).toBe('🚀');
    expect(mapped.accentColor).toBe('emerald');
    expect(mapped.importedFrom).toBe('claude');
    expect(mapped.conversationCount).toBe(2);
  });

  it('rejects invalid enum values and falls back to safe defaults', () => {
    const mapped = mapProjectRow({
      ...baseLegacyRow,
      default_privacy_mode: 'invalid-mode',
      default_provider_mode: 'NotAMode',
      accent_color: 'fuchsia',
      imported_from: 'github',
      allowed_surfaces: ['web', 'invalid-surface', 42],
    });

    expect(mapped.defaultPrivacyMode).toBe('managed');
    expect(mapped.defaultProviderMode).toBe('ManagedGateway');
    expect(mapped.accentColor).toBeNull();
    expect(mapped.importedFrom).toBeNull();
    expect(mapped.allowedSurfaces).toEqual(['web']);
  });

  it('does not expose developer-session or browser surfaces from Cloud project rows', () => {
    const mapped = mapProjectRow({
      ...baseLegacyRow,
      allowed_surfaces: ['web', 'cli', 'vscode', 'chrome'],
    });

    expect(mapped.allowedSurfaces).toEqual(['web']);
  });

  it('falls back to canonical default surfaces when allowed_surfaces is empty after filtering', () => {
    const mapped = mapProjectRow({
      ...baseLegacyRow,
      allowed_surfaces: ['garbage'],
    });
    expect(mapped.allowedSurfaces).toEqual(['web', 'desktop', 'mobile']);
  });

  it('coerces metadata: null when not an object, passes through when object', () => {
    expect(mapProjectRow({ ...baseLegacyRow, metadata: 'not-an-object' }).metadata).toBeNull();
    expect(mapProjectRow({ ...baseLegacyRow, metadata: [1, 2, 3] }).metadata).toBeNull();
    expect(mapProjectRow({ ...baseLegacyRow, metadata: null }).metadata).toBeNull();
    expect(mapProjectRow({ ...baseLegacyRow, metadata: { k: 1 } }).metadata).toEqual({ k: 1 });
  });
});
