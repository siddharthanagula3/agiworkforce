/**
 * ProvenanceFooter — auto-routing trace + Pin-to-model button.
 *
 * Manual-source messages render only the existing model/provider/tools row.
 * Auto-source messages additionally render the routing trace and (when a
 * `pinModel` and `onPinModel` callback are provided) a "Pin to <model>" button
 * that fires the callback with the full routing payload.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import { ProvenanceFooter } from '../ProvenanceFooter';
import type { ChatMessage } from '../../lib/types';

const baseMessage: Pick<
  ChatMessage,
  'model' | 'provider' | 'toolCalls' | 'citations' | 'createdAt' | 'routing'
> = {
  model: 'test-model-id',
  provider: 'test-provider',
  createdAt: new Date().toISOString(),
};

describe('ProvenanceFooter — source modes', () => {
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
    expect(container.textContent).toContain('test-model-id');
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
            pinModel: 'test-model-id',
          },
        }}
      />,
    );
    const trace = container.querySelector('[data-component="provenance-routing"]');
    expect(trace).toBeTruthy();
    expect(trace?.textContent).toContain('Auto routed');
    expect(trace?.textContent).toContain('code');
    expect(trace?.textContent).toContain('test-model-id');
    expect(trace?.textContent).toContain('detected code-related prompt');
  });

  it('auto source: Pin-to-model button fires callback with routing payload', () => {
    const onPinModel = vi.fn();
    const routing = {
      source: 'auto' as const,
      task: 'image',
      reason: 'image prompt detected',
      pinModel: 'pin-model-id',
    };
    const { container } = render(
      <ProvenanceFooter message={{ ...baseMessage, routing }} onPinModel={onPinModel} />,
    );
    const button = container.querySelector(
      '[data-component="provenance-pin-button"]',
    ) as HTMLButtonElement | null;
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain('Pin to pin-model-id');
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
            pinModel: 'pin-model-id',
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
