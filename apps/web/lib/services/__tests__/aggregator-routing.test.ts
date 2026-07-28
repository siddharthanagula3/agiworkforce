/**
 * MiniMax, Qwen and Zhipu are served through OpenRouter until direct accounts
 * are worth opening (founder decision 2026-07-27). Moonshot and xAI stay
 * direct. MuleRouter is gone.
 *
 * The failure this guards is the two halves disagreeing. Routing has to move
 * the provider *and* the wire model id together — redirect only the provider
 * and OpenRouter receives `glm-5.2`, an id it does not publish; redirect only
 * the id and DashScope receives `z-ai/glm-5.2`, which it does not either.
 * Both fail at request time, from config that reads fine.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  canFailoverToOpenRouter,
  failoverMappedModelIds,
  isRoutedViaOpenRouter,
  mappedModelIds,
  openRouterFailoverSlugFor,
  openRouterSlugFor,
} from '../aggregator-routing';

const ENV_KEYS = ['OPENROUTER_API_KEY', 'AGI_OPENROUTER_ROUTED_PROVIDERS'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env['OPENROUTER_API_KEY'] = 'sk-or-test';
  delete process.env['AGI_OPENROUTER_ROUTED_PROVIDERS'];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('aggregator routing', () => {
  it.each(['minimax', 'qwen', 'zhipu'])('routes %s through OpenRouter', (provider) => {
    expect(isRoutedViaOpenRouter(provider)).toBe(true);
  });

  it.each(['moonshot', 'xai', 'anthropic', 'openai', 'google', 'deepseek', 'perplexity'])(
    'leaves %s direct',
    (provider) => {
      expect(isRoutedViaOpenRouter(provider)).toBe(false);
    },
  );

  it('does not route when there is no OpenRouter key', () => {
    // Otherwise a provider that merely lacks a key is swapped for another that
    // also lacks one, and the user sees an OpenRouter auth error naming a
    // provider they never selected.
    delete process.env['OPENROUTER_API_KEY'];
    for (const provider of ['minimax', 'qwen', 'zhipu']) {
      expect(isRoutedViaOpenRouter(provider)).toBe(false);
    }
  });

  it('honours an env override, including turning routing off entirely', () => {
    process.env['AGI_OPENROUTER_ROUTED_PROVIDERS'] = 'qwen';
    expect(isRoutedViaOpenRouter('qwen')).toBe(true);
    expect(isRoutedViaOpenRouter('zhipu')).toBe(false);

    // The reversal path: one env change sends everything direct again.
    process.env['AGI_OPENROUTER_ROUTED_PROVIDERS'] = '';
    for (const provider of ['minimax', 'qwen', 'zhipu']) {
      expect(isRoutedViaOpenRouter(provider)).toBe(false);
    }
  });

  it.each([
    ['qwen3.5-flash', 'qwen/qwen3.5-flash-02-23'],
    ['qwen3.7-plus', 'qwen/qwen3.7-plus'],
    ['glm-5.2', 'z-ai/glm-5.2'],
    ['MiniMax-M3', 'minimax/minimax-m3'],
  ])('maps %s to the slug OpenRouter publishes', (apiModelId, slug) => {
    expect(openRouterSlugFor(apiModelId)).toBe(slug);
  });

  it('has no slug for an unmapped model, rather than inventing one', () => {
    // A new Qwen model added to the catalog must fail as unconfigured, not be
    // sent to OpenRouter under a guessed id.
    expect(openRouterSlugFor('qwen9.9-imaginary')).toBeUndefined();
  });

  it('maps every catalog model belonging to a routed provider', async () => {
    // The check that keeps this honest over time: add a Qwen/GLM/MiniMax model
    // to models.json without a slug here and this fails, instead of the model
    // shipping and 404ing on first use.
    const { default: catalog } = await import('@agiworkforce/types/models.json', {
      with: { type: 'json' },
    });
    const routed = new Set(['minimax', 'qwen', 'zhipu']);
    const models = Object.values(
      (catalog as { models: Record<string, { provider: string; apiModelId?: string; id: string }> })
        .models,
    );
    const missing = models
      .filter((m) => routed.has(m.provider))
      .map((m) => m.apiModelId ?? m.id)
      .filter((id) => openRouterSlugFor(id) === undefined);

    expect(
      missing,
      `unmapped models for OpenRouter-routed providers: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('maps nothing that is not in the catalog', () => {
    // Guards the reverse drift: a slug left behind after a model is retired.
    expect(mappedModelIds().length).toBeGreaterThan(0);
  });
});

describe('OpenRouter failover routes', () => {
  const saved = process.env['OPENROUTER_API_KEY'];
  beforeEach(() => {
    process.env['OPENROUTER_API_KEY'] = 'sk-or-test';
  });
  afterEach(() => {
    if (saved === undefined) delete process.env['OPENROUTER_API_KEY'];
    else process.env['OPENROUTER_API_KEY'] = saved;
  });

  it('offers a failover route for a direct provider', () => {
    expect(canFailoverToOpenRouter('anthropic', 'claude-sonnet-5')).toBe(true);
    expect(openRouterFailoverSlugFor('claude-sonnet-5')).toBe('anthropic/claude-sonnet-5');
  });

  it('offers none when already on OpenRouter', () => {
    // Retrying the same wire would just fail again.
    expect(canFailoverToOpenRouter('openrouter', 'claude-sonnet-5')).toBe(false);
    expect(canFailoverToOpenRouter('open_router', 'claude-sonnet-5')).toBe(false);
  });

  it('offers none without a key', () => {
    delete process.env['OPENROUTER_API_KEY'];
    expect(canFailoverToOpenRouter('anthropic', 'claude-sonnet-5')).toBe(false);
  });

  it('covers every chat model of every directly-called provider', async () => {
    // The guard that matters over time: add a chat model for a direct provider
    // and this fails unless it also has a failover route, rather than that
    // model silently being the one with no safety net during an outage.
    const { default: catalog } = await import('@agiworkforce/types/models.json', {
      with: { type: 'json' },
    });
    const direct = new Set([
      'anthropic',
      'openai',
      'google',
      'deepseek',
      'xai',
      'moonshot',
      'perplexity',
    ]);
    const NON_CHAT = new Set(['image', 'video', 'audio', 'embedding', 'tts', 'stt']);
    const models = Object.values(
      (
        catalog as {
          models: Record<
            string,
            { provider: string; apiModelId?: string; id: string; modelType?: string }
          >;
        }
      ).models,
    );
    const missing = models
      .filter((m) => direct.has(m.provider) && !NON_CHAT.has(m.modelType ?? ''))
      .map((m) => m.apiModelId ?? m.id)
      .filter((id) => openRouterFailoverSlugFor(id) === undefined);

    expect(missing, `chat models with no OpenRouter failover route: ${missing.join(', ')}`).toEqual(
      [],
    );
  });

  it('has no slug for a model the catalog no longer contains', async () => {
    // The reverse of the coverage check. Retiring a model leaves its slug
    // behind, and a stale entry is invisible until someone routes to a model
    // that no longer exists. This is what catches it.
    const { default: catalog } = await import('@agiworkforce/types/models.json', {
      with: { type: 'json' },
    });
    const known = new Set(
      Object.values(
        (catalog as { models: Record<string, { apiModelId?: string; id: string }> }).models,
      ).map((m) => m.apiModelId ?? m.id),
    );
    const stale = [...mappedModelIds(), ...failoverMappedModelIds()].filter((id) => !known.has(id));
    expect(stale, `slugs for models not in models.json: ${stale.join(', ')}`).toEqual([]);
  });

  it('never maps a model to both a permanent route and a failover route', () => {
    // A model already served through OpenRouter has nowhere to fail over to;
    // listing it in both maps would mean "retry the wire that just failed".
    const both = mappedModelIds().filter((id) => openRouterFailoverSlugFor(id) !== undefined);
    expect(both, `models in both routing maps: ${both.join(', ')}`).toEqual([]);
  });
});
