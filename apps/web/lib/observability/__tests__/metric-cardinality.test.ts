import { beforeEach, describe, expect, it } from 'vitest';

import { OBSERVABILITY_ATTRIBUTE } from '../attributes';
import {
  DEFAULT_LABEL_LIMIT,
  LOCAL_METRIC_LABEL,
  METRIC_LABEL_BOUND,
  OVERFLOW_LABEL,
  UNCLASSIFIED_LABEL,
  boundAttributes,
  boundLabelValue,
  classifyErrorType,
  labelBound,
  resetLabelCardinality,
} from '../cardinality';
import { attributeKey, dashboardPanels } from '../dashboards';
import { MEDIA_ATTRIBUTE } from '../media-telemetry';

beforeEach(() => {
  resetLabelCardinality();
});

describe('metric label cardinality', () => {
  it('classifies every label the observability vocabulary defines', () => {
    const labels = [
      ...Object.values(OBSERVABILITY_ATTRIBUTE),
      ...Object.values(LOCAL_METRIC_LABEL),
      ...Object.values(MEDIA_ATTRIBUTE),
    ];

    for (const label of labels) {
      expect(METRIC_LABEL_BOUND, `${label} has no declared cardinality bound`).toHaveProperty(
        label,
      );
    }
  });

  it('drops a per-request identifier instead of trimming it', () => {
    expect(boundLabelValue(OBSERVABILITY_ATTRIBUTE.runId, 'run_8f31')).toBeNull();
    expect(boundLabelValue(OBSERVABILITY_ATTRIBUTE.sessionId, 'sess_1')).toBeNull();
    expect(
      boundAttributes({
        [OBSERVABILITY_ATTRIBUTE.runId]: 'run_8f31',
        [OBSERVABILITY_ATTRIBUTE.surface]: 'web',
      }),
    ).toEqual({ [OBSERVABILITY_ATTRIBUTE.surface]: 'web' });
  });

  it('never lets a raw exception message become a label', () => {
    const message = "Cannot read properties of undefined (reading 'id') at handler.ts:214";

    expect(classifyErrorType(message)).toBe(UNCLASSIFIED_LABEL);
    expect(boundLabelValue(OBSERVABILITY_ATTRIBUTE.errorType, message)).toBe(UNCLASSIFIED_LABEL);
  });

  it('keeps the vocabulary the code deliberately emits', () => {
    expect(classifyErrorType('RATE_LIMIT_EXCEEDED')).toBe('rate_limit_exceeded');
    expect(classifyErrorType('5xx')).toBe('5xx');
    expect(classifyErrorType('stuck_job')).toBe('stuck_job');
    expect(classifyErrorType('no_route')).toBe('no_route');
    expect(classifyErrorType('web-search')).toBe('web-search');
    expect(classifyErrorType('TypeError')).toBe('TypeError');
  });

  it('collapses a label past its limit rather than growing the series set', () => {
    const limit = DEFAULT_LABEL_LIMIT;
    for (let index = 0; index < limit; index += 1) {
      expect(boundLabelValue(OBSERVABILITY_ATTRIBUTE.surface, `surface_${index}`)).toBe(
        `surface_${index}`,
      );
    }

    expect(boundLabelValue(OBSERVABILITY_ATTRIBUTE.surface, 'surface_overflow')).toBe(
      OVERFLOW_LABEL,
    );
    expect(boundLabelValue(OBSERVABILITY_ATTRIBUTE.surface, 'surface_0')).toBe('surface_0');
  });

  it('refuses a value outside an enumerated set', () => {
    expect(boundLabelValue(LOCAL_METRIC_LABEL.httpMethod, 'GET')).toBe('GET');
    expect(boundLabelValue(LOCAL_METRIC_LABEL.httpMethod, 'BREW')).toBe(UNCLASSIFIED_LABEL);
    expect(boundLabelValue(LOCAL_METRIC_LABEL.spanStatus, 'error')).toBe('error');
  });

  it('leaves numbers and booleans alone on a bounded label', () => {
    expect(boundLabelValue(LOCAL_METRIC_LABEL.httpStatusCode, 500)).toBe(500);
    expect(boundLabelValue('agi.probe.flag', true)).toBe(true);
  });

  it('bounds a label nobody declared rather than letting it through', () => {
    expect(labelBound('agi.something.new')).toEqual({
      kind: 'bounded',
      limit: DEFAULT_LABEL_LIMIT,
    });
  });
});

describe('dashboard grouping cardinality', () => {
  const boundsByKey = new Map(
    Object.entries(METRIC_LABEL_BOUND).map(([label, bound]) => [attributeKey(label), bound]),
  );

  it('groups every panel by a dimension with a declared bound', () => {
    const panels = dashboardPanels();
    expect(panels.length).toBeGreaterThan(0);

    for (const panel of panels) {
      for (const dimension of panel.groupBy) {
        expect(boundsByKey.get(dimension), `${panel.id} groups by unbounded ${dimension}`).toEqual(
          expect.objectContaining({ kind: expect.not.stringMatching(/^identifier$/) }),
        );
      }
    }
  });

  it('selects on bounded dimensions too, not only groups by them', () => {
    for (const panel of dashboardPanels()) {
      for (const key of [...Object.keys(panel.match ?? {}), ...Object.keys(panel.of ?? {})]) {
        expect(boundsByKey.has(key), `${panel.id} selects on undeclared ${key}`).toBe(true);
      }
    }
  });
});
