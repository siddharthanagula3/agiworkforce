import { describe, expect, it } from 'vitest';

import {
  RETENTION_MATRIX,
  storesOutlivingTheirSubject,
  unclassifiedStores,
  type DataClass,
} from '@/lib/services/deletion-manifest';

const CLASSES: readonly DataClass[] = [
  'customer_content',
  'derived_content',
  'operational_record',
  'audit_trail',
  'telemetry',
];

describe('every store the product writes to carries a class', () => {
  it('leaves nothing unclassified', () => {
    const unclassified = unclassifiedStores();
    expect(
      unclassified,
      `these stores hold data nobody has said what kind it is, so no rule reaches them:\n  ` +
        `${unclassified.join('\n  ')}`,
    ).toEqual([]);
  });

  it('covers a real inventory, so a shrunken matrix cannot pass quietly', () => {
    expect(RETENTION_MATRIX.length).toBeGreaterThan(50);
    for (const entry of RETENTION_MATRIX) {
      expect(CLASSES, `${entry.store} is labelled '${entry.dataClass}'`).toContain(entry.dataClass);
    }
  });

  it('uses every class it declares', () => {
    const used = new Set(RETENTION_MATRIX.map((entry) => entry.dataClass));
    const unused = CLASSES.filter((dataClass) => !used.has(dataClass));
    expect(unused, `declared but never applied: ${unused.join(', ')}`).toEqual([]);
  });

  it('lets a store outlive the person only where the class is not their content', () => {
    for (const entry of storesOutlivingTheirSubject()) {
      expect(
        entry.dataClass,
        `${entry.store} holds ${entry.dataClass} and survives the account that produced it`,
      ).not.toBe('customer_content');
    }
  });

  it('reaches every piece of customer content when an account is erased', () => {
    const content = RETENTION_MATRIX.filter((entry) => entry.dataClass === 'customer_content');
    expect(content.length).toBeGreaterThan(20);
    const surviving = storesOutlivingTheirSubject().map((entry) => entry.store);
    for (const entry of content) {
      expect(surviving, `${entry.store} is customer content and is not erased`).not.toContain(
        entry.store,
      );
    }
  });
});
