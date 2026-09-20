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
import { CLIENT_VERSION_HEADER } from '@agiworkforce/cloud-contracts';
import { MINIMUM_SUPPORTED_RUNTIME_VERSION, PRODUCT_ANALYTICS_SURFACES } from '@agiworkforce/types';

import { API_VERSION_REQUEST_HEADER } from '@/lib/api-gateway-policy';

import { CLIENT_VERSION_LABELS } from '../client-versions';
import { attributeKey, dashboardPanels } from '../dashboards';
import { MEDIA_ATTRIBUTE } from '../media-telemetry';
import {
  SURFACE_REQUEST_HEADER,
  UNSUPPORTED_PROTOCOL_LABEL,
  httpRequestLabels,
  type HttpRequestLabels,
} from '../request-labels';

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

describe('a label a caller writes names the closed set it is checked against', () => {
  type LabelField = keyof HttpRequestLabels;

  function labelsFor(header: string, value: string): HttpRequestLabels {
    return httpRequestLabels((name) => (name === header ? value : null));
  }

  function produced(header: string, values: readonly string[], field: LabelField): Set<string> {
    const seen = new Set<string>();
    for (const value of values) {
      const label = labelsFor(header, value)[field];
      if (label !== undefined) seen.add(label);
    }
    return seen;
  }

  // A pattern is not a vocabulary: it accepts a value nobody shipped, and each
  // one that reaches a metric is a series that never closes.
  it('answers a header nobody shipped with a member of a closed set, or nothing', () => {
    const invented = Array.from({ length: 200 }, (_, index) => index);

    expect([
      ...produced(
        SURFACE_REQUEST_HEADER,
        invented.map((n) => `surface-${n}`),
        'surface',
      ),
    ]).toEqual([]);
    expect([
      ...produced(
        CLIENT_VERSION_HEADER,
        invented.map((n) => `${n + 4000}.${n}.${n}`),
        'clientVersion',
      ),
    ]).toEqual([]);
    const protocols = produced(
      API_VERSION_REQUEST_HEADER,
      invented.map((n) => `v${n}`),
      'protocolVersion',
    );
    expect([...protocols]).toEqual([UNSUPPORTED_PROTOCOL_LABEL]);
  });

  it('keeps every value it does admit inside the vocabulary that owns it', () => {
    for (const surface of PRODUCT_ANALYTICS_SURFACES) {
      expect(labelsFor(SURFACE_REQUEST_HEADER, surface).surface).toBe(surface);
    }
    for (const series of CLIENT_VERSION_LABELS) {
      const admitted = labelsFor(CLIENT_VERSION_HEADER, `${series}.9`).clientVersion;
      expect(admitted === undefined || admitted === series, series).toBe(true);
    }
  });

  it('drops a well-formed client version no release series admits', () => {
    for (const invented of ['999.4.1', '0.1.0', '1.0.0', '4000.0.0', '2026.44.1']) {
      expect(labelsFor(CLIENT_VERSION_HEADER, invented).clientVersion, invented).toBeUndefined();
    }
  });

  it('admits the runtime line from the registry floor and the calendar line the apps ship', () => {
    expect(CLIENT_VERSION_LABELS[0]).toBe(
      MINIMUM_SUPPORTED_RUNTIME_VERSION.split('.').slice(0, 2).join('.'),
    );
    const thisYear = new Date().getUTCFullYear();
    expect(CLIENT_VERSION_LABELS).toContain(`${thisYear}.9`);
    expect(CLIENT_VERSION_LABELS).not.toContain(`${thisYear + 5}.9`);
  });

  it('holds a runtime-line version to the floor and lets the calendar line through', () => {
    expect(labelsFor(CLIENT_VERSION_HEADER, '1.0.0').clientVersion).toBeUndefined();
    expect(
      labelsFor(CLIENT_VERSION_HEADER, `${new Date().getUTCFullYear()}.9.1`).clientVersion,
    ).toBe(`${new Date().getUTCFullYear()}.9`);
  });

  it('opens at most one series for a version that reaches a recorder unchecked', () => {
    resetLabelCardinality();
    const bounded = new Set(
      ['5.1.2', '6.3.4', '7.7.7'].map((version) =>
        boundLabelValue(OBSERVABILITY_ATTRIBUTE.clientVersion, version),
      ),
    );
    expect([...bounded]).toEqual([UNCLASSIFIED_LABEL]);
  });
});
