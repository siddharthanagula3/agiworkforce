import { describe, it, expect } from 'vitest';
import { listCanonicalModels } from '@agiworkforce/types';
import { MODEL_ESCALATION_PREFIX, resolveModelEscalation } from '../modelEscalation';
import { getModelPresentationLabel } from '../modelInfo';

const [left, right] = listCanonicalModels();
const servedId = left!.id;
const pinnedId = right!.id;
const servedLabel = getModelPresentationLabel(servedId) || servedId;

describe('resolveModelEscalation · the server marker path', () => {
  it('names the served model and the reason the route gave', () => {
    const escalation = resolveModelEscalation({
      movedFromModelId: pinnedId,
      movedReason: 'the provider account is unfunded',
      servedModelId: servedId,
    });
    expect(escalation).not.toBeNull();
    expect(escalation!.movedFromModelId).toBe(pinnedId);
    expect(escalation!.reason).toBe('the provider account is unfunded');
    expect(escalation!.line).toBe(
      `${MODEL_ESCALATION_PREFIX} ${servedLabel}: the provider account is unfunded`,
    );
  });

  it('omits the reason clause when the marker carries no reason', () => {
    const escalation = resolveModelEscalation({
      movedFromModelId: pinnedId,
      servedModelId: servedId,
    });
    expect(escalation!.line).toBe(`${MODEL_ESCALATION_PREFIX} ${servedLabel}`);
    expect(escalation!.reason).toBeNull();
  });

  it('stays silent when the marker names the model that actually served', () => {
    expect(
      resolveModelEscalation({ movedFromModelId: servedId, servedModelId: servedId }),
    ).toBeNull();
  });
});

describe('resolveModelEscalation · the derivation fallback for turns persisted before the marker', () => {
  it('reads a move from the pinned model differing from the served one under auto', () => {
    const escalation = resolveModelEscalation({
      servedModelId: servedId,
      conversationModelId: pinnedId,
      routingSource: 'auto',
    });
    expect(escalation).not.toBeNull();
    expect(escalation!.movedFromModelId).toBe(pinnedId);
    expect(escalation!.reason).toBeNull();
    expect(escalation!.line).toBe(`${MODEL_ESCALATION_PREFIX} ${servedLabel}`);
  });

  it('claims no move for a manual selection, which is the user changing model', () => {
    expect(
      resolveModelEscalation({
        servedModelId: servedId,
        conversationModelId: pinnedId,
        routingSource: 'manual',
      }),
    ).toBeNull();
  });

  it('claims no move when the pin and the served model agree, or either is missing', () => {
    expect(
      resolveModelEscalation({
        servedModelId: servedId,
        conversationModelId: servedId,
        routingSource: 'auto',
      }),
    ).toBeNull();
    expect(resolveModelEscalation({ servedModelId: servedId, routingSource: 'auto' })).toBeNull();
    expect(
      resolveModelEscalation({ conversationModelId: pinnedId, routingSource: 'auto' }),
    ).toBeNull();
  });

  it('prefers the marker over the derivation when both are present', () => {
    const escalation = resolveModelEscalation({
      movedFromModelId: pinnedId,
      movedReason: 'route rotation',
      servedModelId: servedId,
      conversationModelId: servedId,
      routingSource: 'auto',
    });
    expect(escalation!.reason).toBe('route rotation');
  });
});
