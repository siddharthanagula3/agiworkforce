import { describe, expect, it } from 'vitest';

import {
  UNKNOWN_TOOL_METADATA,
  isDestructiveToolMetadata,
  resolveConnectorToolMetadata,
} from '../tool-metadata';

const LOOSEST_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

describe('server-declared MCP tool annotations only tighten', () => {
  it('raises an undeclared tool that calls itself destructive to a delete', () => {
    const metadata = resolveConnectorToolMetadata('acme', 'purge', { destructiveHint: true });

    expect(metadata.actionClass).toBe('delete');
    expect(metadata.reversible).toBe(false);
    expect(metadata.declared).toBe(false);
    expect(isDestructiveToolMetadata(metadata)).toBe(true);
  });

  it('keeps an undeclared tool that claims to be read-only an irreversible write', () => {
    expect(resolveConnectorToolMetadata('acme', 'lookup', LOOSEST_ANNOTATIONS)).toEqual(
      UNKNOWN_TOOL_METADATA,
    );
    expect(
      isDestructiveToolMetadata(
        resolveConnectorToolMetadata('acme', 'lookup', LOOSEST_ANNOTATIONS),
      ),
    ).toBe(true);
  });

  it('treats a missing or false readOnlyHint as a change that asks', () => {
    for (const annotations of [{}, { readOnlyHint: false }, undefined]) {
      const metadata = resolveConnectorToolMetadata('acme', 'update', annotations);
      expect(metadata.actionClass).toBe('write');
      expect(isDestructiveToolMetadata(metadata)).toBe(true);
    }
  });

  it('marks an open-world tool as an egress path', () => {
    expect(
      resolveConnectorToolMetadata('acme', 'fetch', { readOnlyHint: true, openWorldHint: true })
        .createsEgressPath,
    ).toBe(true);
    expect(
      resolveConnectorToolMetadata('acme', 'fetch', { openWorldHint: false }).createsEgressPath,
    ).toBe(true);
  });

  it('ignores annotations that are not literal booleans', () => {
    expect(resolveConnectorToolMetadata('acme', 'x', { destructiveHint: 'true' }).actionClass).toBe(
      'write',
    );
  });

  it('never loosens a statically declared verdict', () => {
    expect(
      resolveConnectorToolMetadata('github', 'post_issue_comment', LOOSEST_ANNOTATIONS),
    ).toEqual(resolveConnectorToolMetadata('github', 'post_issue_comment'));
    expect(
      resolveConnectorToolMetadata('github', 'post_issue_comment', LOOSEST_ANNOTATIONS).actionClass,
    ).toBe('external_send');
    expect(resolveConnectorToolMetadata('acme', 'write_file', LOOSEST_ANNOTATIONS)).toEqual(
      resolveConnectorToolMetadata('acme', 'write_file'),
    );
  });
});
