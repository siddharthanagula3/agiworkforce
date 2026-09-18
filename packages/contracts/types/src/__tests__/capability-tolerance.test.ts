import { describe, expect, it } from 'vitest';

import {
  isPlatformCapability,
  parseCapabilityNames,
  surfaceCapabilityGrant,
} from '../capabilities';
import {
  CONTENT_BLOCK_TYPES,
  isKnownContentBlock,
  isStreamStopReason,
  normalizeStopReason,
  vendorRawChunk,
  type StreamStopReason,
} from '../provider-adapter';

describe('parseCapabilityNames', () => {
  it('grants what it knows and reports what it does not', () => {
    const parsed = parseCapabilityNames(['canChat', 'canFoldLaundry', 'canUseVoice']);

    expect([...parsed.granted].sort()).toEqual(['canChat', 'canUseVoice']);
    expect(parsed.unrecognized).toEqual(['canFoldLaundry']);
  });

  it('reads a record and treats false as not granted', () => {
    const parsed = parseCapabilityNames({
      canChat: true,
      canUseVoice: false,
      canTimeTravel: true,
      canUseImages: 'yes',
    });

    expect([...parsed.granted]).toEqual(['canChat']);
    expect(parsed.unrecognized).toEqual(['canTimeTravel']);
  });

  it('never throws on a malformed claim', () => {
    for (const raw of [null, undefined, 42, 'canChat', {}, []]) {
      const parsed = parseCapabilityNames(raw);
      expect(parsed.granted.size).toBe(0);
      expect(parsed.unrecognized).toEqual([]);
    }
  });

  it('agrees with the guard it is built on', () => {
    expect(isPlatformCapability('canChat')).toBe(true);
    expect(isPlatformCapability('canChatMore')).toBe(false);
    expect(isPlatformCapability(null)).toBe(false);
  });
});

describe('surfaceCapabilityGrant', () => {
  it('reads the one platform matrix rather than restating it', () => {
    expect(surfaceCapabilityGrant('web').has('canUseTerminal')).toBe(false);
    expect(surfaceCapabilityGrant('desktop').has('canUseTerminal')).toBe(true);
    expect(surfaceCapabilityGrant('mobile').has('canUsePhotos')).toBe(true);
  });
});

describe('unknown enum tolerance on a provider stream', () => {
  const MAPPING: Readonly<Record<string, StreamStopReason>> = {
    SAFETY: 'refusal',
    MAX_TOKENS: 'max_tokens',
  };

  it('maps a known vendor signal and keeps the vendor string', () => {
    expect(normalizeStopReason('SAFETY', MAPPING)).toEqual({
      type: 'stop',
      reason: 'refusal',
      providerFinishReason: 'SAFETY',
    });
  });

  it('falls back for a vendor signal this build has never seen', () => {
    expect(normalizeStopReason('RECITATION', MAPPING)).toEqual({
      type: 'stop',
      reason: 'end_turn',
      providerFinishReason: 'RECITATION',
    });
    expect(normalizeStopReason('RECITATION', MAPPING, 'error').reason).toBe('error');
  });

  it('accepts a vendor signal that already uses the canonical vocabulary', () => {
    expect(normalizeStopReason('pause_turn', {}).reason).toBe('pause_turn');
    expect(isStreamStopReason('pause_turn')).toBe(true);
    expect(isStreamStopReason('paused')).toBe(false);
  });

  it('reports no vendor signal rather than inventing one', () => {
    expect(normalizeStopReason(null, MAPPING)).toEqual({ type: 'stop', reason: 'end_turn' });
    expect(normalizeStopReason('   ', MAPPING).providerFinishReason).toBeUndefined();
  });
});

describe('unknown content-block tolerance', () => {
  it('recognises every modelled block type', () => {
    for (const type of CONTENT_BLOCK_TYPES) {
      expect(isKnownContentBlock({ type })).toBe(true);
    }
  });

  it('refuses to treat an unmodelled block as known', () => {
    expect(isKnownContentBlock({ type: 'server_tool_use' })).toBe(false);
    expect(isKnownContentBlock({ type: 'redacted_thinking' })).toBe(false);
    expect(isKnownContentBlock(null)).toBe(false);
    expect(isKnownContentBlock('text')).toBe(false);
  });

  it('carries an unmodelled block through whole rather than dropping it', () => {
    const payload = { type: 'redacted_thinking', data: 'opaque' };
    expect(vendorRawChunk(payload)).toEqual({ type: 'vendor-raw', payload });
  });
});
