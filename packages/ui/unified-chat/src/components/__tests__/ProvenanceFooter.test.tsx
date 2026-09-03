import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import { ProvenanceFooter } from '../ProvenanceFooter';
import type { ChatMessage } from '../../lib/types';

const FIXTURE_MODEL_ID = 'fixture-provenance-model';
const FIXTURE_PIN_MODEL_ID = 'fixture-pin-model';

const baseMessage: Pick<
  ChatMessage,
  'model' | 'provider' | 'toolCalls' | 'citations' | 'createdAt' | 'routing'
> = {
  model: FIXTURE_MODEL_ID,
  provider: 'test-provider',
  createdAt: new Date().toISOString(),
};

describe('ProvenanceFooter, source modes', () => {
  it('manual source: renders provenance row, no routing trace', () => {
    const { container, queryByTestId } = render(
      <ProvenanceFooter
        message={{
          ...baseMessage,
          routing: { source: 'manual' },
        }}
      />,
    );
    expect(container.querySelector('[data-component="provenance-footer"]')).toBeTruthy();
    expect(container.querySelector('[data-component="provenance-routing"]')).toBeNull();
    expect(queryByTestId('provenance-pin-button')).toBeNull();
    expect(container.textContent).toContain(FIXTURE_MODEL_ID);
  });

  it('auto source: renders routing trace with task, model, and reason', () => {
    const { container } = render(
      <ProvenanceFooter
        message={{
          ...baseMessage,
          routing: {
            source: 'auto',
            task: 'code',
            reason: 'detected code-related prompt',
            pinModel: FIXTURE_MODEL_ID,
          },
        }}
      />,
    );
    const trace = container.querySelector('[data-component="provenance-routing"]');
    expect(trace).toBeTruthy();
    expect(trace?.textContent).toContain('Auto routed');
    expect(trace?.textContent).toContain('code');
    expect(trace?.textContent).toContain(FIXTURE_MODEL_ID);
    expect(trace?.textContent).toContain('detected code-related prompt');
  });

  it('auto source: Pin-to-model button fires callback with routing payload', () => {
    const onPinModel = vi.fn();
    const routing = {
      source: 'auto' as const,
      task: 'image',
      reason: 'image prompt detected',
      pinModel: FIXTURE_PIN_MODEL_ID,
    };
    const { container } = render(
      <ProvenanceFooter message={{ ...baseMessage, routing }} onPinModel={onPinModel} />,
    );
    const button = container.querySelector(
      '[data-component="provenance-pin-button"]',
    ) as HTMLButtonElement | null;
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain(`Pin to ${FIXTURE_PIN_MODEL_ID}`);
    fireEvent.click(button!);
    expect(onPinModel).toHaveBeenCalledTimes(1);
    expect(onPinModel).toHaveBeenCalledWith(routing);
  });

  it('auto source: omits Pin button when onPinModel callback is missing', () => {
    const { container } = render(
      <ProvenanceFooter
        message={{
          ...baseMessage,
          routing: {
            source: 'auto',
            task: 'video',
            pinModel: FIXTURE_PIN_MODEL_ID,
          },
        }}
      />,
    );
    expect(container.querySelector('[data-component="provenance-pin-button"]')).toBeNull();
  });

  it('auto source: omits Pin button when routing.pinModel is absent', () => {
    const onPinModel = vi.fn();
    const { container } = render(
      <ProvenanceFooter
        message={{
          ...baseMessage,
          routing: { source: 'auto', reason: 'no pin candidate' },
        }}
        onPinModel={onPinModel}
      />,
    );
    expect(container.querySelector('[data-component="provenance-pin-button"]')).toBeNull();
    expect(onPinModel).not.toHaveBeenCalled();
  });
});
