import { describe, expect, it } from 'vitest';
import {
  DOM_SUMMARY_HEADING,
  PAGE_CONTENT_FENCE_BEGIN,
  pruneObservationHistory,
} from '../observation-history';

describe('observation history with opaque multimodal parts', () => {
  it('preserves unrecognized parts without interpreting them as browser observations', () => {
    const history = [
      {
        role: 'user',
        content: [
          null,
          42,
          { type: 'future_input', value: 'opaque' },
          { type: 'text', text: 'Goal' },
        ],
      },
    ];
    expect(pruneObservationHistory(history)[0]).toBe(history[0]);
  });

  it('never treats system instructions containing DOM marker examples as observations', () => {
    const system = { role: 'system', content: `Keep these rules: ${PAGE_CONTENT_FENCE_BEGIN}` };
    const history = [system];
    for (let step = 1; step <= 3; step++) {
      history.push(
        { role: 'assistant', content: '' },
        { role: 'tool', content: `${PAGE_CONTENT_FENCE_BEGIN}\nPage ${step}` },
      );
    }
    expect(pruneObservationHistory(history)[0]).toBe(system);
  });

  it('deduplicates a screenshot receipt across sibling results without dropping its appended DOM', () => {
    const screenshot = JSON.stringify({ type: 'screenshot', base64: 'BATCH_PIXELS' });
    const history = [
      { role: 'assistant', content: '' },
      { role: 'tool', tool_call_id: 'click', content: 'Click receipt' },
      {
        role: 'tool',
        tool_call_id: 'screen',
        content: `${screenshot}\n\n${DOM_SUMMARY_HEADING}:\n${PAGE_CONTENT_FENCE_BEGIN}\nCURRENT_BATCH_DOM`,
      },
      { role: 'tool', tool_call_id: 'other', content: 'Sibling receipt' },
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,BATCH_PIXELS' } }],
      },
    ];
    const source = structuredClone(history);
    const result = pruneObservationHistory(history);
    expect(JSON.stringify(result).split('BATCH_PIXELS')).toHaveLength(2);
    expect(result[2]?.content).toContain('CURRENT_BATCH_DOM');
    expect(result[1]).toBe(history[1]);
    expect(result[3]).toBe(history[3]);
    expect(result[4]).toBe(history[4]);
    expect(result.map((message) => message.tool_call_id)).toEqual(
      history.map((message) => message.tool_call_id),
    );
    expect(history).toEqual(source);
  });

  it('does not match a screenshot against a later assistant step', () => {
    const receipt = {
      role: 'tool',
      content: JSON.stringify({ type: 'screenshot', base64: 'SAME_PIXELS' }),
    };
    const history = [
      { role: 'assistant', content: '' },
      receipt,
      { role: 'assistant', content: '' },
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,SAME_PIXELS' } }],
      },
    ];
    expect(pruneObservationHistory(history)[1]).toBe(receipt);
  });

  it('prunes old browser payloads without deleting opaque parts or message metadata', () => {
    const opaque = { type: 'future_input', value: 'opaque' };
    const history = [
      {
        role: 'user',
        name: 'original-context',
        content: [
          null,
          opaque,
          { type: 'text', text: `${PAGE_CONTENT_FENCE_BEGIN}\nSTALE_DOM_PAYLOAD` },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,STALE_PIXELS' } },
        ],
      },
      { role: 'assistant', content: '' },
      {
        role: 'user',
        content: [
          { type: 'text', text: `${PAGE_CONTENT_FENCE_BEGIN}\nPREVIOUS_DOM_PAYLOAD` },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,PREVIOUS_PIXELS' } },
        ],
      },
      { role: 'assistant', content: '' },
      {
        role: 'user',
        content: [
          { type: 'text', text: `${PAGE_CONTENT_FENCE_BEGIN}\nCURRENT_DOM_PAYLOAD` },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,CURRENT_PIXELS' } },
        ],
      },
    ];
    const original = structuredClone(history);
    const result = pruneObservationHistory(history);
    expect(result).toHaveLength(history.length);
    expect(result[0]?.name).toBe('original-context');
    expect(result[0]?.content).toEqual([
      null,
      opaque,
      expect.objectContaining({ type: 'text' }),
      expect.objectContaining({ type: 'text' }),
    ]);
    expect(JSON.stringify(result)).not.toContain('STALE_DOM_PAYLOAD');
    expect(JSON.stringify(result)).not.toContain('STALE_PIXELS');
    expect(result[2]).toBe(history[2]);
    expect(result[4]).toBe(history[4]);
    expect(history).toEqual(original);
  });
});
