import { describe, expect, it } from 'vitest';
import { FEATURE_RATE_CARD, chargeMicrousdForProviderCost } from '@agiworkforce/types';

import {
  hostedCodeExecutionProviderOf,
  hostedCodeExecutionReserveMicrousd,
  priceHostedCodeExecution,
} from '../hosted-code-execution';

const OPENAI_SESSION_MICROUSD = FEATURE_RATE_CARD.hosted_code_execution_openai_session
  .providerCogsMicrousd as number;
const ANTHROPIC_HOUR_MICROUSD = FEATURE_RATE_CARD.hosted_code_execution_anthropic_hour
  .providerCogsMicrousd as number;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

function anthropicContainerMicrousd(containerMs: number): number {
  return Math.ceil((containerMs / HOUR_MS) * ANTHROPIC_HOUR_MICROUSD);
}

describe('hostedCodeExecutionProviderOf', () => {
  it('names only the providers whose hosted code execution the rate card prices', () => {
    expect(hostedCodeExecutionProviderOf('openai')).toBe('openai');
    expect(hostedCodeExecutionProviderOf('anthropic')).toBe('anthropic');
    expect(hostedCodeExecutionProviderOf('google')).toBeNull();
    expect(hostedCodeExecutionProviderOf('toString')).toBeNull();
  });
});

describe('priceHostedCodeExecution, OpenAI sessions', () => {
  it('charges one 20-minute session for a container used briefly', () => {
    expect(
      priceHostedCodeExecution({
        provider: 'openai',
        usage: {},
        container: ['cntr_1'],
        requestHadWebSearchOrFetch: false,
        elapsedMs: 5 * MINUTE_MS,
      }),
    ).toEqual({
      microusd: OPENAI_SESSION_MICROUSD,
      sessions: 1,
      containerMs: 20 * MINUTE_MS,
    });
  });

  it('charges every started 20-minute session of a long container', () => {
    const price = priceHostedCodeExecution({
      provider: 'openai',
      usage: {},
      container: ['cntr_1'],
      requestHadWebSearchOrFetch: false,
      elapsedMs: 45 * MINUTE_MS,
    });

    expect(price.sessions).toBe(3);
    expect(price.microusd).toBe(3 * OPENAI_SESSION_MICROUSD);
  });

  it('charges each distinct container the response names, once', () => {
    const price = priceHostedCodeExecution({
      provider: 'openai',
      usage: {},
      container: {
        output: [
          { type: 'code_interpreter_call', container_id: 'cntr_a' },
          { type: 'code_interpreter_call', container_id: 'cntr_b' },
          { type: 'code_interpreter_call', container_id: 'cntr_a' },
        ],
      },
      requestHadWebSearchOrFetch: false,
    });

    expect(price.sessions).toBe(2);
    expect(price.microusd).toBe(2 * OPENAI_SESSION_MICROUSD);
  });

  it('charges nothing when no container ran', () => {
    expect(
      priceHostedCodeExecution({
        provider: 'openai',
        usage: { server_tool_use: { code_execution_requests: 2 } },
        container: null,
        requestHadWebSearchOrFetch: false,
      }),
    ).toEqual({ microusd: 0, sessions: 0, containerMs: 0 });
  });
});

describe('priceHostedCodeExecution, Anthropic container time', () => {
  it('bills a short container at the five-minute minimum', () => {
    expect(
      priceHostedCodeExecution({
        provider: 'anthropic',
        usage: {},
        container: { id: 'container_1', expires_at: '2026-09-27T12:00:00Z' },
        requestHadWebSearchOrFetch: false,
        elapsedMs: 2 * MINUTE_MS,
      }),
    ).toEqual({
      microusd: anthropicContainerMicrousd(5 * MINUTE_MS),
      sessions: 1,
      containerMs: 5 * MINUTE_MS,
    });
  });

  it('bills a longer container for the time it ran, at the hourly rate', () => {
    const price = priceHostedCodeExecution({
      provider: 'anthropic',
      usage: {},
      container: { id: 'container_1', expires_at: '2026-09-27T12:00:00Z' },
      requestHadWebSearchOrFetch: false,
      elapsedMs: 90 * MINUTE_MS,
    });

    expect(price.microusd).toBe(anthropicContainerMicrousd(90 * MINUTE_MS));
  });

  it('counts one container when the usage reports code execution but names none', () => {
    const price = priceHostedCodeExecution({
      provider: 'anthropic',
      usage: { server_tool_use: { code_execution_requests: 3 } },
      container: null,
      requestHadWebSearchOrFetch: false,
    });

    expect(price.sessions).toBe(1);
    expect(price.microusd).toBe(anthropicContainerMicrousd(5 * MINUTE_MS));
  });

  it('ignores a container object that carries no expiry', () => {
    expect(
      priceHostedCodeExecution({
        provider: 'anthropic',
        usage: {},
        container: { container: { id: 'container_1' } },
        requestHadWebSearchOrFetch: false,
      }).sessions,
    ).toBe(0);
  });

  it('charges nothing when the request carried web search or fetch, which includes the container', () => {
    expect(
      priceHostedCodeExecution({
        provider: 'anthropic',
        usage: { server_tool_use: { code_execution_requests: 3 } },
        container: { id: 'container_1', expires_at: '2026-09-27T12:00:00Z' },
        requestHadWebSearchOrFetch: true,
        elapsedMs: 30 * MINUTE_MS,
      }),
    ).toEqual({ microusd: 0, sessions: 0, containerMs: 0 });
  });
});

describe('hostedCodeExecutionReserveMicrousd', () => {
  const HOSTED_TURN = {
    stream: false,
    e2bEnabled: false,
    toolsCapable: true,
    codeExecutionCapable: true,
  };

  it('holds one OpenAI session at its charge for a turn offered hosted code execution', () => {
    expect(hostedCodeExecutionReserveMicrousd({ ...HOSTED_TURN, provider: 'openai' })).toBe(
      chargeMicrousdForProviderCost(OPENAI_SESSION_MICROUSD),
    );
  });

  it('holds the five-minute Anthropic minimum at its charge', () => {
    expect(hostedCodeExecutionReserveMicrousd({ ...HOSTED_TURN, provider: 'anthropic' })).toBe(
      chargeMicrousdForProviderCost(anthropicContainerMicrousd(5 * MINUTE_MS)),
    );
  });

  it('holds nothing for a provider without hosted code execution or a turn without the tool', () => {
    expect(hostedCodeExecutionReserveMicrousd({ ...HOSTED_TURN, provider: 'google' })).toBe(0);
    expect(
      hostedCodeExecutionReserveMicrousd({
        ...HOSTED_TURN,
        provider: 'openai',
        codeExecutionCapable: false,
      }),
    ).toBe(0);
  });
});
