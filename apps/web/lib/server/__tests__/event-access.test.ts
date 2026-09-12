import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  EVENT_DISABLED_MODELS_ENV,
  EVENT_ENABLED_ENV,
  EVENT_ENDS_AT_ENV,
  EVENT_MODELS_ENV,
  EVENT_STARTS_AT_ENV,
  eventAllowsModel,
  eventModelIdsFor,
  readEventPromotion,
} from '@/lib/server/event-access';

const ENV_KEYS = [
  EVENT_ENABLED_ENV,
  EVENT_MODELS_ENV,
  EVENT_DISABLED_MODELS_ENV,
  EVENT_STARTS_AT_ENV,
  EVENT_ENDS_AT_ENV,
];

const PAID_TIERS = ['basic', 'pro', 'max', 'max_15x', 'team', 'enterprise'] as const;

function setEvent(values: Partial<Record<string, string>>) {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

describe('event access overlay', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) original[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it('is inactive when the flag is off, whatever else is configured', () => {
    setEvent({ [EVENT_MODELS_ENV]: 'claude-sonnet-5,grok-4.6' });

    expect(readEventPromotion().active).toBe(false);
    expect(eventAllowsModel('grok-4.6', 'free')).toBe(false);
  });

  it('grants the allowlisted models to free when the flag is on', () => {
    setEvent({ [EVENT_ENABLED_ENV]: '1', [EVENT_MODELS_ENV]: 'grok-4.6,qwen-3.8-flash' });

    expect(eventAllowsModel('grok-4.6', 'free')).toBe(true);
    expect(eventAllowsModel('qwen-3.8-flash', 'free')).toBe(true);
    expect(eventAllowsModel('claude-opus-5', 'free')).toBe(false);
  });

  it('expires on its own once the window closes', () => {
    const now = Date.parse('2026-09-12T12:00:00Z');
    setEvent({
      [EVENT_ENABLED_ENV]: '1',
      [EVENT_MODELS_ENV]: 'grok-4.6',
      [EVENT_ENDS_AT_ENV]: '2026-09-12T10:00:00Z',
    });

    expect(readEventPromotion(now).active).toBe(false);
    expect(eventAllowsModel('grok-4.6', 'free', readEventPromotion(now))).toBe(false);
  });

  it('has not begun before its start time', () => {
    const now = Date.parse('2026-09-12T08:00:00Z');
    setEvent({
      [EVENT_ENABLED_ENV]: '1',
      [EVENT_MODELS_ENV]: 'grok-4.6',
      [EVENT_STARTS_AT_ENV]: '2026-09-12T10:00:00Z',
    });

    expect(readEventPromotion(now).active).toBe(false);
  });

  it('is live inside the window', () => {
    const now = Date.parse('2026-09-12T11:00:00Z');
    setEvent({
      [EVENT_ENABLED_ENV]: '1',
      [EVENT_MODELS_ENV]: 'grok-4.6',
      [EVENT_STARTS_AT_ENV]: '2026-09-12T10:00:00Z',
      [EVENT_ENDS_AT_ENV]: '2026-09-12T23:00:00Z',
    });

    expect(readEventPromotion(now).active).toBe(true);
    expect(eventAllowsModel('grok-4.6', 'free', readEventPromotion(now))).toBe(true);
  });

  it('drops a single model without touching the rest', () => {
    setEvent({
      [EVENT_ENABLED_ENV]: '1',
      [EVENT_MODELS_ENV]: 'grok-4.6,qwen-3.8-flash',
      [EVENT_DISABLED_MODELS_ENV]: 'grok-4.6',
    });

    expect(eventAllowsModel('grok-4.6', 'free')).toBe(false);
    expect(eventAllowsModel('qwen-3.8-flash', 'free')).toBe(true);
  });

  it('fails closed on an id the registry does not know', () => {
    setEvent({ [EVENT_ENABLED_ENV]: '1', [EVENT_MODELS_ENV]: 'claude-sonnet-5000,  ,grok-4.6' });

    const promotion = readEventPromotion();
    expect(promotion.active).toBe(true);
    expect([...promotion.modelIds]).toEqual(['grok-4.6']);
    expect(eventAllowsModel('claude-sonnet-5000', 'free')).toBe(false);
  });

  it('is inactive when every allowlisted id is unusable', () => {
    setEvent({ [EVENT_ENABLED_ENV]: '1', [EVENT_MODELS_ENV]: 'not-a-model' });

    expect(readEventPromotion().active).toBe(false);
  });

  it.each(PAID_TIERS)('never changes what %s can reach', (tier) => {
    setEvent({ [EVENT_ENABLED_ENV]: '1', [EVENT_MODELS_ENV]: 'grok-4.6,qwen-3.8-flash' });

    // The overlay adds nothing for a paid plan, and because it only ever adds,
    // it cannot take anything away either.
    expect(eventAllowsModel('grok-4.6', tier)).toBe(false);
    expect(eventModelIdsFor(tier).size).toBe(0);
  });

  it('reports the promoted set for badges', () => {
    setEvent({ [EVENT_ENABLED_ENV]: '1', [EVENT_MODELS_ENV]: 'grok-4.6,qwen-3.8-flash' });

    expect([...eventModelIdsFor('free')].sort()).toEqual(['grok-4.6', 'qwen-3.8-flash']);
    expect(eventModelIdsFor('pro').size).toBe(0);
  });

  it('turns off cleanly, restoring permanent free behaviour', () => {
    setEvent({ [EVENT_ENABLED_ENV]: '1', [EVENT_MODELS_ENV]: 'grok-4.6' });
    expect(eventAllowsModel('grok-4.6', 'free')).toBe(true);

    setEvent({ [EVENT_MODELS_ENV]: 'grok-4.6' }); // flag removed, nothing else changed
    expect(eventAllowsModel('grok-4.6', 'free')).toBe(false);
  });
});
